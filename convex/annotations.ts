import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils/auth";

const annotationValidator = v.any();

export const listByVideo = query({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("NOT_FOUND");
    }

    const annotations = await ctx.db
      .query("annotations")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();

    return annotations.map((annotation) => {
      const data = annotation.data as Record<string, unknown> | null;
      return {
        id: annotation._id,
        videoId: annotation.videoId,
        authorId: annotation.authorId,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt,
        frame: annotation.frame,
        ...(data ?? {}),
      };
    });
  },
});

export const create = mutation({
  args: {
    videoId: v.id("videos"),
    annotation: annotationValidator,
  },
  async handler(ctx, { videoId, annotation }) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    if (typeof annotation !== "object" || annotation === null) {
      throw new ConvexError("INVALID_ANNOTATION");
    }

    const frame = (annotation as any).frame;
    if (typeof frame !== "number") {
      throw new ConvexError("INVALID_FRAME");
    }

    const now = Date.now();
    const id = await ctx.db.insert("annotations", {
      videoId,
      authorId: user._id,
      frame,
      data: annotation,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      ...(annotation as Record<string, unknown>),
      authorId: user._id,
      videoId,
      createdAt: now,
    };
  },
});

export const update = mutation({
  args: {
    annotationId: v.id("annotations"),
    annotation: annotationValidator,
  },
  async handler(ctx, { annotationId, annotation }) {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db.get(annotationId);
    if (!existing) {
      throw new ConvexError("NOT_FOUND");
    }

    const video = await ctx.db.get(existing.videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    if (typeof annotation !== "object" || annotation === null) {
      throw new ConvexError("INVALID_ANNOTATION");
    }
    const frame = (annotation as any).frame;
    if (typeof frame !== "number") {
      throw new ConvexError("INVALID_FRAME");
    }

    await ctx.db.patch(annotationId, {
      frame,
      data: annotation,
      updatedAt: Date.now(),
    });
  },
});

export const removeMany = mutation({
  args: {
    annotationIds: v.array(v.id("annotations")),
  },
  async handler(ctx, { annotationIds }) {
    const user = await getCurrentUserOrThrow(ctx);

    for (const annotationId of annotationIds) {
      const existing = await ctx.db.get(annotationId);
      if (!existing) continue;

      const video = await ctx.db.get(existing.videoId);
      if (!video || video.ownerId !== user._id) {
        throw new ConvexError("FORBIDDEN");
      }

      await ctx.db.delete(annotationId);
    }
  },
});

export const clearForVideo = mutation({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserOrThrow(ctx);

    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const annotations = await ctx.db
      .query("annotations")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();

    await Promise.all(annotations.map((annotation) => ctx.db.delete(annotation._id)));
  },
});

