import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { effectiveAvatar } from "./utils/avatar";

const pointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

const MAX_SHARE_SCAN = 4096;
const MAX_USER_MEMBERSHIPS = 1024;
const MAX_MENTION_CANDIDATES = 500;
const MAX_MENTION_FRIENDS = 500;
const MAX_MENTION_GROUPS = 64;
const MAX_MENTION_GROUP_MEMBERS_PER_GROUP = 200;
const MAX_MENTION_COMMENT_AUTHORS = 1000;
const MAX_USERS_PER_EMAIL = 8;

const getActiveVideoShares = (ctx: any, videoId: Id<'videos'>) =>
  ctx.db
    .query('contentShares')
    .withIndex('byVideoActive', (q: any) => q.eq('videoId', videoId).eq('isActive', true))
    .take(MAX_SHARE_SCAN);

const getActiveProjectLevelShares = (ctx: any, projectId: Id<'projects'>) =>
  ctx.db
    .query('contentShares')
    .withIndex('byProjectVideo', (q: any) => q.eq('projectId', projectId).eq('videoId', undefined))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .take(MAX_SHARE_SCAN);

const getUserGroupIds = async (ctx: any, email: string | null | undefined) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return new Set<string>();
  const memberships = await ctx.db
    .query('shareGroupMembers')
    .withIndex('byEmail', (q: any) => q.eq('email', normalized))
    .take(MAX_USER_MEMBERSHIPS);
  return new Set(memberships.map((membership: any) => membership.groupId as string));
};

async function canViewVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  const user = await ctx.db.get(userId);
  if (!user) return false;

  const userGroupIds = await getUserGroupIds(ctx, user.email);
  const videoShares = await getActiveVideoShares(ctx, videoId);
  if (videoShares.some((share: any) => share.linkToken || (share.groupId && userGroupIds.has(share.groupId as string)))) {
    return true;
  }

  if (video.projectId) {
    const projectShares = await getActiveProjectLevelShares(ctx, video.projectId);
    return projectShares.some((share: any) => share.groupId && userGroupIds.has(share.groupId as string));
  }

  return false;
}

async function canCommentOnVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  const user = await ctx.db.get(userId);
  if (!user) return false;

  const userGroupIds = await getUserGroupIds(ctx, user.email);
  const shares = await getActiveVideoShares(ctx, videoId);
  if (shares.some((share: any) => share.linkToken && share.allowComments)) {
    return true;
  }
  if (shares.some((share: any) => share.groupId && share.allowComments && userGroupIds.has(share.groupId as string))) {
    return true;
  }

  if (video.projectId) {
    const projectShares = await getActiveProjectLevelShares(ctx, video.projectId);
    return projectShares.some((share: any) => share.groupId && share.allowComments && userGroupIds.has(share.groupId as string));
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
    .take(MAX_USERS_PER_EMAIL);
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
    if (emails.size >= MAX_MENTION_CANDIDATES) return;
    emails.set(normalized, { name: name ?? null });
  };

  const userDoc = await ctx.db.get(userId);
  enqueue(userDoc?.email, userDoc?.name);

  const owner = await ctx.db.get(video.ownerId);
  enqueue(owner?.email, owner?.name);

  const friends = await ctx.db.query('friends').withIndex('byOwner', (q: any) => q.eq('ownerId', userId)).take(MAX_MENTION_FRIENDS);
  friends.forEach((friend: any) => enqueue(friend.contactEmail, friend.contactName));

  const includedGroupIds = new Set<string>();

  const collectGroupMembers = async (groupId: Id<'shareGroups'>) => {
    if (emails.size >= MAX_MENTION_CANDIDATES) return;
    const remaining = MAX_MENTION_CANDIDATES - emails.size;
    const members = await ctx.db
      .query('shareGroupMembers')
      .withIndex('byGroup', (q: any) => q.eq('groupId', groupId))
      .take(Math.min(MAX_MENTION_GROUP_MEMBERS_PER_GROUP, remaining));
    members.forEach((member: any) => enqueue(member.email, null));
  };

  const includeShareMembers = async (shares: Array<any>) => {
    const groupIds = Array.from(
      new Set(
        shares
          .filter((share) => share.groupId && share.isActive)
          .map((share) => share.groupId as Id<'shareGroups'>),
      ),
    ).slice(0, MAX_MENTION_GROUPS);

    for (const groupId of groupIds) {
      const key = groupId as string;
      if (includedGroupIds.has(key)) continue;
      includedGroupIds.add(key);
      await collectGroupMembers(groupId);
    }
  };

  const videoShares = await getActiveVideoShares(ctx, videoId);
  await includeShareMembers(videoShares);

  if (video.projectId) {
    const projectShares = await getActiveProjectLevelShares(ctx, video.projectId);
    await includeShareMembers(projectShares);
  }

  const comments = await ctx.db.query('comments').withIndex('byVideo', (q: any) => q.eq('videoId', videoId)).take(MAX_MENTION_COMMENT_AUTHORS);
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
        avatar: effectiveAvatar(userDoc),
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
              avatar: effectiveAvatar(userDoc),
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

    // Mentions: robust parse using candidate labels with boundary checks
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const { video: mentionVideo, candidates } = await collectMentionCandidates(ctx, user._id, videoId);
    const notified = new Set<string>();
    for (const cand of candidates) {
      const label = (cand.label || '').trim();
      if (!label) continue;
      // Match "@Label" followed by end or boundary (space, punctuation, brackets)
      const pattern = new RegExp(`@${escapeRegExp(label)}(?=$|[\\s.,!?;:)\\]\\}])`, 'i');
      if (!pattern.test(text)) continue;
      const targetId = cand.userId as Id<'users'> | null | undefined;
      if (!targetId || targetId === user._id) continue;
      if (notified.has(targetId)) continue;
      notified.add(targetId);
      await ctx.db.insert('notifications', {
        userId: targetId,
        type: 'mention',
        message: mentionVideo?.title
          ? `New mention in ${mentionVideo.title}`
          : 'You were mentioned in a comment',
        videoId,
        projectId: mentionVideo?.projectId ?? undefined,
        commentId,
        frame: frame ?? undefined,
        mentionText: `@${label}`,
        fromUserId: user._id,
        contextTitle: mentionVideo?.title ?? undefined,
        previewUrl: (mentionVideo as any)?.thumbnailUrl ?? undefined,
        createdAt: Date.now(),
        readAt: undefined,
      });
      // Fire Slack DM if the mentioned user connected Slack
      try {
        await ctx.scheduler.runAfter(0, internal.slack.notifyMention, {
          toUserId: targetId,
          videoId,
          commentId,
        });
      } catch (_err) {
        // ignore slack failures so they don't block comment creation
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
      authorAvatar: effectiveAvatar(author),
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

export const updateFrame = mutation({
  args: {
    commentId: v.id("comments"),
    frame: v.number(),
  },
  async handler(ctx, { commentId, frame }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) {
      throw new ConvexError("NOT_FOUND");
    }

    if (!(await canCommentOnVideo(ctx, user._id, comment.videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    const nextFrame = Math.max(0, Math.floor(frame));
    const updatedAt = Date.now();
    const toUpdate = new Set([commentId]);
    const queue = [commentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const replies = await ctx.db
        .query("comments")
        .withIndex("byParent", (q) => q.eq("parentId", currentId))
        .collect();
      for (const reply of replies) {
        if (!toUpdate.has(reply._id)) {
          toUpdate.add(reply._id);
          queue.push(reply._id);
        }
      }
    }

    await Promise.all(
      Array.from(toUpdate).map((id) =>
        ctx.db.patch(id, { frame: nextFrame, updatedAt }),
      ),
    );
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
