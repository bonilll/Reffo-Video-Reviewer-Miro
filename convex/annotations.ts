import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import type { Id } from "./_generated/dataModel";

const annotationValidator = v.any();

async function canViewVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  // Video-level shares
  const videoShares = await ctx.db
    .query('contentShares')
    .withIndex('byVideo', (q: any) => q.eq('videoId', videoId))
    .collect();
  const emails = new Set<string>();
  for (const s of videoShares) {
    if (s.groupId) {
      const members = await ctx.db
        .query('shareGroupMembers')
        .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
        .collect();
      members.forEach((m: any) => emails.add(m.email));
    }
  }
  // Project-level shares
  if (video.projectId) {
    const projShares = await ctx.db
      .query('contentShares')
      .withIndex('byProject', (q: any) => q.eq('projectId', video.projectId))
      .collect();
    for (const s of projShares) {
      if (s.groupId) {
        const members = await ctx.db
          .query('shareGroupMembers')
          .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
          .collect();
        members.forEach((m: any) => emails.add(m.email));
      }
    }
  }
  const user = await ctx.db.get(userId);
  return user ? emails.has(user.email) || videoShares.some((s: any) => s.linkToken && s.isActive) : false;
}

async function canAnnotateVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  // Video-level shares
  const videoShares = await ctx.db
    .query('contentShares')
    .withIndex('byVideo', (q: any) => q.eq('videoId', videoId))
    .collect();
  const userDoc = await ctx.db.get(userId);
  if (!userDoc) return false;
  for (const s of videoShares) {
    if (s.groupId && s.isActive && s.allowComments) {
      const member = await ctx.db
        .query('shareGroupMembers')
        .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
        .filter((q: any) => q.eq(q.field('email'), userDoc.email))
        .first();
      if (member) return true;
    }
  }
  if (videoShares.some((s: any) => s.linkToken && s.isActive && s.allowComments)) return true;
  // Project-level shares
  if (video.projectId) {
    const projShares = await ctx.db
      .query('contentShares')
      .withIndex('byProject', (q: any) => q.eq('projectId', video.projectId))
      .collect();
    for (const s of projShares) {
      if (s.groupId && s.isActive && s.allowComments) {
        const member = await ctx.db
          .query('shareGroupMembers')
          .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
          .filter((q: any) => q.eq(q.field('email'), userDoc.email))
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
    if (!user) return [] as any[];
    const ok = await canViewVideo(ctx, user._id, videoId);
    if (!ok) return [] as any[];

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
    if (!(await canAnnotateVideo(ctx, user._id, videoId))) {
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
    if (!(await canAnnotateVideo(ctx, user._id, existing.videoId))) {
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
      if (!(await canAnnotateVideo(ctx, user._id, existing.videoId))) {
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
    if (!(await canAnnotateVideo(ctx, user._id, videoId))) {
      throw new ConvexError("FORBIDDEN");
    }

    const annotations = await ctx.db
      .query("annotations")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();

    await Promise.all(annotations.map((annotation) => ctx.db.delete(annotation._id)));
  },
});
