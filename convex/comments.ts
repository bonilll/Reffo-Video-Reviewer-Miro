import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import type { Id } from "./_generated/dataModel";

const pointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

async function canViewVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  // Shares attached to the specific video
  const videoShares = await ctx.db.query('contentShares').withIndex('byVideo', (q: any) => q.eq('videoId', videoId)).collect();
  let memberEmails = new Set<string>();
  for (const s of videoShares) {
    if (s.groupId) {
      const members = await ctx.db.query('shareGroupMembers').withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId)).collect();
      members.forEach((m: any) => memberEmails.add(m.email));
    }
  }
  // Project-level shares
  if (video.projectId) {
    const projShares = await ctx.db.query('contentShares').withIndex('byProject', (q: any) => q.eq('projectId', video.projectId)).collect();
    for (const s of projShares) {
      if (s.groupId) {
        const members = await ctx.db.query('shareGroupMembers').withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId)).collect();
        members.forEach((m: any) => memberEmails.add(m.email));
      }
    }
  }
  const user = await ctx.db.get(userId);
  return user ? memberEmails.has(user.email) || videoShares.some((s: any) => s.linkToken && s.isActive) : false;
}

async function canCommentOnVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  const shares = await ctx.db.query('contentShares').withIndex('byVideo', (q: any) => q.eq('videoId', videoId)).collect();
  const user = await ctx.db.get(userId);
  if (!user) return false;
  // Group membership with allowComments
  for (const s of shares) {
    if (s.groupId && s.isActive && s.allowComments) {
      const member = await ctx.db
        .query('shareGroupMembers')
        .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
        .filter((q: any) => q.eq(q.field('email'), user.email))
        .first();
      if (member) return true;
    }
  }
  // Public link with allowComments
  if (shares.some((s: any) => s.linkToken && s.isActive && s.allowComments)) return true;
  // Project-level shares with allowComments
  if (video.projectId) {
    const projShares = await ctx.db.query('contentShares').withIndex('byProject', (q: any) => q.eq('projectId', video.projectId)).collect();
    for (const s of projShares) {
      if (s.groupId && s.isActive && s.allowComments) {
        const member = await ctx.db
          .query('shareGroupMembers')
          .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
          .filter((q: any) => q.eq(q.field('email'), user.email))
          .first();
        if (member) return true;
      }
    }
  }
  return false;
}

type MentionCandidate = {
  label: string;
  email: string;
  userId?: Id<'users'> | null;
  avatar?: string | null;
};

const normalizeEmail = (email: string | null | undefined) => email?.trim().toLowerCase() ?? null;

async function getUserByEmail(ctx: any, email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const users = await ctx.db
    .query('users')
    .withIndex('byEmail', (q: any) => q.eq('email', normalized))
    .collect();
  if (!users.length) return null;
  // Prefer a user bound to Clerk (has clerkId), then most recently updated.
  users.sort((a: any, b: any) => {
    const aHas = a.clerkId ? 1 : 0;
    const bHas = b.clerkId ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
  return users[0] ?? null;
}

async function collectMentionCandidates(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>): Promise<{ video: any; candidates: MentionCandidate[] }> {
  const video = await ctx.db.get(videoId);
  if (!video) {
    return { video: null, candidates: [] };
  }

  const emails = new Map<string, { name?: string | null }>();
  const enqueue = (email: string | null | undefined, name?: string | null) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;
    if (emails.has(normalized)) {
      const existing = emails.get(normalized)!;
      if (!existing.name && name) existing.name = name;
      return;
    }
    emails.set(normalized, { name: name ?? null });
  };

  const userDoc = await ctx.db.get(userId);
  enqueue(userDoc?.email, userDoc?.name);

  const owner = await ctx.db.get(video.ownerId);
  enqueue(owner?.email, owner?.name);

  const friends = await ctx.db.query('friends').withIndex('byOwner', (q: any) => q.eq('ownerId', userId)).collect();
  friends.forEach((friend: any) => enqueue(friend.contactEmail, friend.contactName));

  const collectGroupMembers = async (groupId: Id<'shareGroups'>) => {
    const members = await ctx.db.query('shareGroupMembers').withIndex('byGroup', (q: any) => q.eq('groupId', groupId)).collect();
    members.forEach((member: any) => enqueue(member.email, null));
  };

  const includeShareMembers = async (shares: Array<any>) => {
    for (const share of shares) {
      if (share.groupId && share.isActive) {
        await collectGroupMembers(share.groupId);
      }
    }
  };

  const videoShares = await ctx.db.query('contentShares').withIndex('byVideo', (q: any) => q.eq('videoId', videoId)).collect();
  await includeShareMembers(videoShares);

  if (video.projectId) {
    const projectShares = await ctx.db
      .query('contentShares')
      .withIndex('byProject', (q: any) => q.eq('projectId', video.projectId))
      .collect();
    await includeShareMembers(projectShares);
  }

  const comments = await ctx.db.query('comments').withIndex('byVideo', (q: any) => q.eq('videoId', videoId)).collect();
  const authorIds = new Set<Id<'users'>>(comments.map((comment: any) => comment.authorId));
  for (const authorId of authorIds) {
    const author = await ctx.db.get(authorId);
    enqueue(author?.email, author?.name);
  }

  const candidates = await Promise.all(
    Array.from(emails.entries()).map(async ([email, meta]) => {
      const userDoc = await getUserByEmail(ctx, email);
      const label = meta.name ?? userDoc?.name ?? email.split('@')[0];
      return {
        label,
        email,
        userId: userDoc?._id ?? null,
        avatar: userDoc?.avatar ?? null,
      } satisfies MentionCandidate;
    }),
  );

  candidates.sort((a, b) => a.label.localeCompare(b.label));
  return { video, candidates };
}

export const listByVideo = query({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserDoc(ctx);
    if (!user || !(await canViewVideo(ctx, user._id, videoId))) return [];

    const comments = await ctx.db
      .query("comments")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();

    const authorCache = new Map<string, { name: string | null; email: string; avatar: string | null }>();

    return Promise.all(
      comments
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (comment) => {
          let author = authorCache.get(comment.authorId);
          if (!author) {
            const userDoc = await ctx.db.get(comment.authorId);
            author = {
              name: userDoc?.name ?? null,
              email: userDoc?.email ?? "",
              avatar: userDoc?.avatar ?? null,
            };
            authorCache.set(comment.authorId, author);
          }

          return {
            id: comment._id,
            videoId: comment.videoId,
            authorId: comment.authorId,
            text: comment.text,
            parentId: comment.parentId ?? null,
            resolved: comment.resolved,
            frame: comment.frame ?? null,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            position: comment.position ?? null,
            authorName: author.name ?? author.email ?? "Anonymous",
            authorAvatar: author.avatar,
          };
        })
    );
  },
});

export const create = mutation({
  args: {
    videoId: v.id("videos"),
    text: v.string(),
    frame: v.optional(v.number()),
    parentId: v.optional(v.id("comments")),
    position: v.optional(pointValidator),
  },
  async handler(ctx, { videoId, text, frame, parentId, position }) {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canCommentOnVideo(ctx, user._id, videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    if (parentId) {
      const parent = await ctx.db.get(parentId);
      if (!parent || parent.videoId !== videoId) {
        throw new ConvexError("INVALID_PARENT");
      }
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("comments", {
      videoId,
      authorId: user._id,
      text,
      parentId,
      frame,
      position,
      resolved: false,
      createdAt: now,
      updatedAt: now,
    });

    const author = await ctx.db.get(user._id);

    // Mentions: parse @Name and notify
    const mentionMatches = text.match(/@([A-Za-z0-9_\-\. ]{2,})/g) || [];
    if (mentionMatches.length) {
      const { video: mentionVideo, candidates } = await collectMentionCandidates(ctx, user._id, videoId);
      const lookup = new Map<string, MentionCandidate>();
      candidates.forEach((candidate) => {
        const labelKey = candidate.label.trim().toLowerCase();
        if (labelKey) lookup.set(labelKey, candidate);
        const emailKey = normalizeEmail(candidate.email ?? null);
        if (emailKey) lookup.set(emailKey, candidate);
      });
      const notified = new Set<string>();
      for (const raw of mentionMatches) {
        const normalized = raw.slice(1).trim().toLowerCase();
        if (!normalized) continue;
        const candidate = lookup.get(normalized);
        if (!candidate || !candidate.userId || candidate.userId === user._id) continue;
        if (notified.has(candidate.userId)) continue;
        notified.add(candidate.userId);
        await ctx.db.insert('notifications', {
          userId: candidate.userId,
          type: 'mention',
          message: mentionVideo?.title
            ? `New mention in ${mentionVideo.title}`
            : 'You were mentioned in a comment',
          videoId,
          projectId: mentionVideo?.projectId ?? undefined,
          commentId,
          frame: frame ?? undefined,
          mentionText: raw.trim(),
          fromUserId: user._id,
          contextTitle: mentionVideo?.title ?? undefined,
          previewUrl: (mentionVideo as any)?.thumbnailUrl ?? undefined,
          createdAt: Date.now(),
          readAt: undefined,
        });
      }
    }

    return {
      id: commentId,
      videoId,
      text,
      parentId: parentId ?? null,
      frame: frame ?? null,
      position: position ?? null,
      resolved: false,
      createdAt: now,
      updatedAt: now,
      authorId: user._id,
      authorName: author?.name ?? author?.email ?? "Anonymous",
      authorAvatar: author?.avatar ?? null,
    };
  },
});

export const updateText = mutation({
  args: {
    commentId: v.id("comments"),
    text: v.string(),
  },
  async handler(ctx, { commentId, text }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      throw new ConvexError("NOT_FOUND");
    }

    if (!(await canCommentOnVideo(ctx, user._id, comment.videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(commentId, { text, updatedAt: Date.now() });
  },
});

export const toggleResolved = mutation({
  args: {
    commentId: v.id("comments"),
  },
  async handler(ctx, { commentId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      throw new ConvexError("NOT_FOUND");
    }

    if (!(await canCommentOnVideo(ctx, user._id, comment.videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(commentId, {
      resolved: !comment.resolved,
      updatedAt: Date.now(),
    });
  },
});

export const updatePosition = mutation({
  args: {
    commentId: v.id("comments"),
    position: pointValidator,
  },
  async handler(ctx, { commentId, position }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      throw new ConvexError("NOT_FOUND");
    }

    if (!(await canCommentOnVideo(ctx, user._id, comment.videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(commentId, { position, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: {
    commentId: v.id("comments"),
  },
  async handler(ctx, { commentId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      return;
    }

    if (!(await canCommentOnVideo(ctx, user._id, comment.videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    const toDelete = new Set([commentId]);
    const queue = [commentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const replies = await ctx.db
        .query("comments")
        .withIndex("byParent", (q) => q.eq("parentId", currentId))
        .collect();
      for (const reply of replies) {
        if (!toDelete.has(reply._id)) {
          toDelete.add(reply._id);
          queue.push(reply._id);
        }
      }
    }

    await Promise.all(Array.from(toDelete).map((id) => ctx.db.delete(id)));
  },
});

export const mentionables = query({
  args: {
    videoId: v.id('videos'),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserDoc(ctx);
    if (!user || !(await canViewVideo(ctx, user._id, videoId))) {
      return [];
    }

    const { candidates } = await collectMentionCandidates(ctx, user._id, videoId);
    return candidates.map((candidate) => ({
      id: candidate.userId ?? `email:${candidate.email}`,
      email: candidate.email,
      label: candidate.label,
      avatar: candidate.avatar ?? null,
    }));
  },
});
