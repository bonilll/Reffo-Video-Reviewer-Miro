import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils/auth";

const pointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

export const listByVideo = query({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

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
    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
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

    const video = await ctx.db.get(comment.videoId);
    if (!video || video.ownerId !== user._id) {
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

    const video = await ctx.db.get(comment.videoId);
    if (!video || video.ownerId !== user._id) {
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

    const video = await ctx.db.get(comment.videoId);
    if (!video || video.ownerId !== user._id) {
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

    const video = await ctx.db.get(comment.videoId);
    if (!video || video.ownerId !== user._id) {
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

