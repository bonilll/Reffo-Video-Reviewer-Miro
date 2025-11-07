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
      const friends = await ctx.db
        .query('friends')
        .withIndex('byOwner', (q: any) => q.eq('ownerId', user._id))
        .collect();
      const notified = new Set<string>();
      for (const raw of mentionMatches) {
        const normalized = raw.slice(1).trim().toLowerCase();
        if (!normalized) continue;
        const targetFriend = friends.find(
          (f: any) => (f.contactName ?? '').toLowerCase() === normalized,
        );
        if (targetFriend) {
          const targetUserId = targetFriend.contactUserId as Id<'users'> | undefined;
          if (targetUserId && targetUserId !== user._id && !notified.has(targetUserId)) {
            notified.add(targetUserId);
            await ctx.db.insert('notifications', {
              userId: targetUserId,
              type: 'mention',
              message: `${author?.name ?? author?.email ?? 'Someone'} mentioned you in a comment`,
              videoId,
              projectId: undefined,
              commentId,
              frame: frame ?? undefined,
              mentionText: raw.trim(),
              fromUserId: user._id,
              createdAt: Date.now(),
              readAt: undefined,
            });
          }
        }
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
