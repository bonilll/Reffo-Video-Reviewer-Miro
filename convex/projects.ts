import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import { internal } from "./_generated/api";

export const list = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    // Be tolerant on initial load: if user doc doesn't exist yet, return empty list
    if (!user) {
      return [] as Array<{ _id: Id<"projects">; name: string; createdAt: number; updatedAt: number }>;
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    return projects.map(({ _id, name, createdAt, updatedAt }) => ({
      _id,
      name,
      createdAt,
      updatedAt,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  async handler(ctx, { name }) {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    const projectId = await ctx.db.insert("projects", {
      name,
      ownerId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return projectId;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  async handler(ctx, { projectId, name }) {
    const user = await getCurrentUserOrThrow(ctx);
    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new ConvexError("NOT_FOUND");
    }
    if (project.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(projectId, { name, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
  },
  async handler(ctx, { projectId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new ConvexError("NOT_FOUND");
    }
    if (project.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    // Remove project-level shares
    const projectShares = await ctx.db
      .query("contentShares")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    await Promise.all(projectShares.map((s) => ctx.db.delete(s._id)));

    // Load all videos in the project
    const videos = await ctx.db
      .query("videos")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();

    // Delete related data and storage for each video
    for (const video of videos) {
      const anns = await ctx.db
        .query("annotations")
        .withIndex("byVideo", (q) => q.eq("videoId", video._id))
        .collect();
      const comments = await ctx.db
        .query("comments")
        .withIndex("byVideo", (q) => q.eq("videoId", video._id))
        .collect();
      const shares = await ctx.db
        .query("contentShares")
        .withIndex("byVideo", (q) => q.eq("videoId", video._id))
        .collect();

      await Promise.all([
        ...anns.map((a) => ctx.db.delete(a._id)),
        ...comments.map((c) => ctx.db.delete(c._id)),
        ...shares.map((s) => ctx.db.delete(s._id)),
      ]);

      await ctx.db.delete(video._id);

      await ctx.scheduler.runAfter(0, internal.storage.deleteObject, {
        storageKey: video.storageKey,
      });

      if (video.thumbnailUrl) {
        await ctx.scheduler.runAfter(0, internal.storage.deleteObjectByPublicUrl, {
          publicUrl: video.thumbnailUrl,
        });
      }
    }

    await ctx.db.delete(projectId);
  },
});

export const setProjectForVideo = mutation({
  args: {
    videoId: v.id("videos"),
    projectId: v.optional(v.id("projects")),
  },
  async handler(ctx, { videoId, projectId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(videoId);
    if (!video) {
      throw new ConvexError("NOT_FOUND");
    }
    if (video.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    let projectOwnerId: Id<"users"> | null = null;
    if (projectId) {
      const project = await ctx.db.get(projectId);
      if (!project) {
        throw new ConvexError("NOT_FOUND");
      }
      projectOwnerId = project.ownerId;
    }

    if (projectOwnerId && projectOwnerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(videoId, { projectId });
  },
});
