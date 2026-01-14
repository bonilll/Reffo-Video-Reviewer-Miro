import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function canViewVideo(ctx: any, userId: Id<'users'>, videoId: Id<'videos'>) {
  const video = await ctx.db.get(videoId);
  if (!video) return false;
  if (video.ownerId === userId) return true;
  const videoShares = await ctx.db
    .query('contentShares')
    .withIndex('byVideo', (q: any) => q.eq('videoId', videoId))
    .collect();
  const memberEmails = new Set<string>();
  for (const s of videoShares) {
    if (s.groupId) {
      const members = await ctx.db
        .query('shareGroupMembers')
        .withIndex('byGroup', (q: any) => q.eq('groupId', s.groupId))
        .collect();
      members.forEach((m: any) => memberEmails.add(m.email));
    }
  }
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
        members.forEach((m: any) => memberEmails.add(m.email));
      }
    }
  }
  const user = await ctx.db.get(userId);
  return user ? memberEmails.has(user.email) || videoShares.some((s: any) => s.linkToken && s.isActive) : false;
}

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
    // Exclude edit-only assets from general listing
    const notAssets = videos.filter((v: any) => !(v as any).isEditAsset);
    const filtered = projectId
      ? notAssets.filter((video) => video.projectId === projectId)
      : notAssets;

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
    isEditAsset: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new ConvexError("FORBIDDEN");
      }
      if (project.ownerId !== user._id) {
        // Allow upload into a shared project if the user is a member of any active group share for the project.
        const shares = await ctx.db
          .query('contentShares')
          .withIndex('byProject', (q) => q.eq('projectId', args.projectId!))
          .collect();
        let canAttach = false;
        const me = await ctx.db.get(user._id);
        if (me) {
          for (const s of shares) {
            if (!s.isActive || !s.groupId) continue;
            const member = await ctx.db
              .query('shareGroupMembers')
              .withIndex('byGroup', (q) => q.eq('groupId', s.groupId as Id<'shareGroups'>))
              .filter((q) => q.eq(q.field('email'), me.email))
              .first();
            if (member) { canAttach = true; break; }
          }
        }
        if (!canAttach) {
          throw new ConvexError("FORBIDDEN");
        }
      }
    }

    const videoId = await ctx.db.insert("videos", {
      ownerId: user._id,
      projectId: args.projectId,
      isEditAsset: args.isEditAsset ?? false,
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

export const listEditAssets = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [] as Array<any>;
    const videos = await ctx.db
      .query('videos')
      .withIndex('byOwner', (q) => q.eq('ownerId', user._id))
      .collect();
    const assets = (videos as any[]).filter((v) => v.isEditAsset === true);
    return assets
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .map((video) => ({
        id: video._id,
        title: video.title,
        src: video.src,
        storageKey: video.storageKey,
        width: video.width,
        height: video.height,
        fps: video.fps,
        duration: video.duration,
        projectId: video.projectId ?? null,
        uploadedAt: video.uploadedAt,
        thumbnailUrl: video.thumbnailUrl ?? null,
      }));
  }
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
    // Allow unauthenticated/no-user calls to be a no-op instead of erroring.
    const user = await getCurrentUserDoc(ctx);
    const video = await ctx.db.get(videoId);
    if (!video) throw new ConvexError("NOT_FOUND");

    const isOwner = !!user && video.ownerId === user._id;

    // If attempting to change owner-only fields but caller isn't owner, forbid.
    if (!isOwner && (title !== undefined || description !== undefined || projectId !== undefined)) {
      throw new ConvexError("FORBIDDEN");
    }

    // Determine if the caller can at least view via group/project share (for lastReviewedAt updates).
    let canView = isOwner;
    if (!canView && user) {
      // video-level shares
      const shares = await ctx.db
        .query('contentShares')
        .withIndex('byVideo', (q) => q.eq('videoId', videoId))
        .collect();
      const u = await ctx.db.get(user._id);
      if (u) {
        for (const s of shares) {
          if (s.groupId) {
            const gid = s.groupId as Id<'shareGroups'>;
            const member = await ctx.db
              .query('shareGroupMembers')
              .withIndex('byGroup', (q) => q.eq('groupId', gid))
              .filter((q) => q.eq(q.field('email'), u.email))
              .first();
            if (member) { canView = true; break; }
          }
        }
      }
      if (!canView && video.projectId) {
        const projShares = await ctx.db
          .query('contentShares')
          .withIndex('byProject', (q) => q.eq('projectId', video.projectId as Id<'projects'>))
          .collect();
        if (u) {
          for (const s of projShares) {
            if (s.groupId) {
              const gid = s.groupId as Id<'shareGroups'>;
              const member = await ctx.db
                .query('shareGroupMembers')
                .withIndex('byGroup', (q) => q.eq('groupId', gid))
                .filter((q) => q.eq(q.field('email'), u.email))
                .first();
              if (member) { canView = true; break; }
            }
          }
        }
      }
    }

    // If not owner and not viewer, silently no-op to avoid breaking shared links.
    if (!isOwner && !canView) return;

    let nextProjectId = video.projectId;
    if (isOwner) {
      if (projectId === null) {
        nextProjectId = undefined;
      } else if (projectId !== undefined) {
        const project = await ctx.db.get(projectId);
        if (!project || project.ownerId !== (user as any)._id) {
          throw new ConvexError("FORBIDDEN");
        }
        nextProjectId = projectId;
      }
    }

    await ctx.db.patch(videoId, {
      title: isOwner ? (title ?? video.title) : video.title,
      description: isOwner ? (description ?? video.description) : video.description,
      projectId: nextProjectId,
      lastReviewedAt: lastReviewedAt ?? video.lastReviewedAt,
    });
  },
});

export const listRevisions = query({
  args: { videoId: v.id('videos') },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    if (!(await canViewVideo(ctx, user._id, videoId))) return [];
    const rows = await ctx.db.query('videoRevisions').withIndex('byVideo', q => q.eq('videoId', videoId)).collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.map(r => ({
      id: r._id,
      storageKey: r.storageKey,
      publicUrl: r.publicUrl,
      width: r.width,
      height: r.height,
      fps: r.fps,
      duration: r.duration,
      thumbnailUrl: r.thumbnailUrl ?? null,
      createdAt: r.createdAt,
      label: r.label ?? null,
      fileName: (r as any).fileName ?? null,
    }));
  }
});

export const replaceSource = mutation({
  args: {
    videoId: v.id('videos'),
    storageKey: v.string(),
    publicUrl: v.string(),
    width: v.number(),
    height: v.number(),
    fps: v.number(),
    duration: v.number(),
    thumbnailUrl: v.optional(v.string()),
    label: v.optional(v.string()),
    newTitle: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get(args.videoId);
    if (!video || video.ownerId !== user._id) throw new ConvexError('NOT_FOUND');
    // Only record revisions for newly uploaded sources.
    // If the target storageKey already exists in history (reuse), skip inserting a new revision.
    const revisions = await ctx.db
      .query('videoRevisions')
      .withIndex('byVideo', (q) => q.eq('videoId', args.videoId))
      .collect();
    const targetExists = revisions.some((r) => (r as any).storageKey === args.storageKey);
    const currentAlreadyRecorded = revisions.some((r) => (r as any).storageKey === video.storageKey);
    const isChanging = args.storageKey !== video.storageKey;
    // Always preserve the previous current version when changing source
    // (both for new uploads and for switching back to an existing revision),
    // but avoid duplicates if it's already recorded.
    if (isChanging && !currentAlreadyRecorded) {
      await ctx.db.insert('videoRevisions', {
        videoId: args.videoId,
        storageKey: video.storageKey,
        publicUrl: video.src,
        width: video.width,
        height: video.height,
        fps: video.fps,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        createdAt: Date.now(),
        label: 'Previous',
        fileName: video.title,
      });
    }
    // Update base video
    await ctx.db.patch(args.videoId, {
      storageKey: args.storageKey,
      src: args.publicUrl,
      width: args.width,
      height: args.height,
      fps: args.fps,
      duration: args.duration,
      thumbnailUrl: args.thumbnailUrl ?? video.thumbnailUrl,
      ...(args.newTitle ? { title: args.newTitle } : {}),
    } as any);
    return { ok: true };
  }
});

export const deleteRevision = mutation({
  args: { revisionId: v.id('videoRevisions') },
  async handler(ctx, { revisionId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const rev = await ctx.db.get(revisionId);
    if (!rev) throw new ConvexError('NOT_FOUND');
    const video = await ctx.db.get(rev.videoId as Id<'videos'>);
    if (!video || video.ownerId !== user._id) throw new ConvexError('FORBIDDEN');
    // Best-effort delete of the object in storage
    try {
      await ctx.scheduler.runAfter(0, internal.storage.deleteObject, { storageKey: rev.storageKey as string });
    } catch (_) {
      // ignore scheduling errors
    }
    await ctx.db.delete(revisionId);
    return { ok: true };
  }
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
