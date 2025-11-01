import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  async handler(ctx, { projectId }) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) {
      return [] as Array<any>;
    }

    let videosQuery = ctx.db
      .query("videos")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id));

    const videos = await videosQuery.collect();
    const filtered = projectId
      ? videos.filter((video) => video.projectId === projectId)
      : videos;

    return filtered.map((video) => ({
      id: video._id,
      title: video.title,
      description: video.description ?? null,
      src: video.src,
      storageKey: video.storageKey,
      width: video.width,
      height: video.height,
      fps: video.fps,
      duration: video.duration,
      projectId: video.projectId ?? null,
      uploadedAt: video.uploadedAt,
      lastReviewedAt: video.lastReviewedAt ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
    }));
  },
});

export const get = query({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("NOT_FOUND");
    }

    return {
      id: video._id,
      title: video.title,
      description: video.description ?? null,
      src: video.src,
      storageKey: video.storageKey,
      width: video.width,
      height: video.height,
      fps: video.fps,
      duration: video.duration,
      projectId: video.projectId ?? null,
      uploadedAt: video.uploadedAt,
      lastReviewedAt: video.lastReviewedAt ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
    };
  },
});

export const getByShareToken = query({
  args: {
    token: v.optional(v.string()),
  },
  async handler(ctx, { token }) {
    if (!token) return null as any;
    const share = await ctx.db
      .query("contentShares")
      .withIndex("byLinkToken", (q) => q.eq("linkToken", token))
      .unique();
    if (!share || !share.isActive || (share.expiresAt && share.expiresAt < Date.now())) {
      throw new ConvexError("SHARE_NOT_FOUND");
    }
    if (!share.videoId) {
      throw new ConvexError("NOT_A_VIDEO_LINK");
    }
    const video = await ctx.db.get(share.videoId as Id<'videos'>);
    if (!video) {
      throw new ConvexError("NOT_FOUND");
    }
    return {
      id: video._id,
      title: video.title,
      description: video.description ?? null,
      src: video.src,
      storageKey: video.storageKey,
      width: video.width,
      height: video.height,
      fps: video.fps,
      duration: video.duration,
      projectId: video.projectId ?? null,
      uploadedAt: video.uploadedAt,
      lastReviewedAt: video.lastReviewedAt ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
      permissions: {
        canComment: share.allowComments,
        canDownload: share.allowDownload,
      },
    };
  },
});

export const completeUpload = mutation({
  args: {
    storageKey: v.string(),
    publicUrl: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    fps: v.number(),
    duration: v.number(),
    projectId: v.optional(v.id("projects")),
    thumbnailUrl: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.ownerId !== user._id) {
        throw new ConvexError("FORBIDDEN");
      }
    }

    const videoId = await ctx.db.insert("videos", {
      ownerId: user._id,
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      storageKey: args.storageKey,
      src: args.publicUrl,
      width: args.width,
      height: args.height,
      fps: args.fps,
      duration: args.duration,
      uploadedAt: now,
      lastReviewedAt: undefined,
      thumbnailUrl: args.thumbnailUrl ?? undefined,
    });

    const video = await ctx.db.get(videoId);
    if (!video) {
      throw new ConvexError("NOT_FOUND");
    }

    return {
      id: video._id,
      title: video.title,
      description: video.description ?? null,
      src: video.src,
      storageKey: video.storageKey,
      width: video.width,
      height: video.height,
      fps: video.fps,
      duration: video.duration,
      projectId: video.projectId ?? null,
      uploadedAt: video.uploadedAt,
      lastReviewedAt: video.lastReviewedAt ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
    };
  },
});

export const updateMetadata = mutation({
  args: {
    videoId: v.id("videos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    lastReviewedAt: v.optional(v.number()),
  },
  async handler(ctx, { videoId, title, description, projectId, lastReviewedAt }) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(videoId);
    if (!video || video.ownerId !== user._id) {
      throw new ConvexError("NOT_FOUND");
    }

    let nextProjectId = video.projectId;

    if (projectId === null) {
      nextProjectId = undefined;
    } else if (projectId !== undefined) {
      const project = await ctx.db.get(projectId);
      if (!project || project.ownerId !== user._id) {
        throw new ConvexError("FORBIDDEN");
      }
      nextProjectId = projectId;
    }

    await ctx.db.patch(videoId, {
      title: title ?? video.title,
      description: description ?? video.description,
      projectId: nextProjectId,
      lastReviewedAt: lastReviewedAt ?? video.lastReviewedAt,
    });
  },
});

export const remove = mutation({
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
    const comments = await ctx.db
      .query("comments")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();
    const shares = await ctx.db
      .query("contentShares")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();

    await Promise.all([
      ...annotations.map((a) => ctx.db.delete(a._id)),
      ...comments.map((c) => ctx.db.delete(c._id)),
      ...shares.map((s) => ctx.db.delete(s._id)),
    ]);

    await ctx.db.delete(videoId);
    await ctx.scheduler.runAfter(0, internal.storage.deleteObject, {
      storageKey: video.storageKey,
    });
    if (video.thumbnailUrl) {
      await ctx.scheduler.runAfter(0, internal.storage.deleteObjectByPublicUrl, {
        publicUrl: video.thumbnailUrl,
      });
    }
  },
});
