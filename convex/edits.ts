import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getCurrentUserOrThrow } from "./utils/auth";
import { api, internal } from "./_generated/api";

const compositionSettingsValidator = v.object({
  width: v.number(),
  height: v.number(),
  fps: v.number(),
  durationFrames: v.number(),
  backgroundColor: v.optional(v.string()),
});

const keyframeArrayValidator = v.array(
  v.object({
    frame: v.number(),
    value: v.any(),
    interpolation: v.optional(v.string()),
    easing: v.optional(v.string()),
  })
);

const clipPatchValidator = v.object({
  sourceInFrame: v.optional(v.number()),
  sourceOutFrame: v.optional(v.number()),
  timelineStartFrame: v.optional(v.number()),
  speed: v.optional(v.number()),
  opacity: v.optional(v.number()),
  label: v.optional(v.string()),
  zIndex: v.optional(v.number()),
  transformTrackId: v.optional(v.id("keyframeTracks")),
});

const DEFAULT_SETTINGS = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationFrames: 900,
  backgroundColor: "#000000",
};

type GenericCtx = MutationCtx | QueryCtx;

async function assertCompositionOwner(
  ctx: GenericCtx,
  compositionId: Id<"compositions">,
  userId: Id<"users">
) {
  const composition = await ctx.db.get(compositionId);
  if (!composition) {
    throw new ConvexError("COMPOSITION_NOT_FOUND");
  }
  if (composition.ownerId !== userId) {
    throw new ConvexError("FORBIDDEN");
  }
  return composition;
}

async function ensureProjectOwnership(
  ctx: GenericCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
) {
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new ConvexError("PROJECT_NOT_FOUND");
  }
  if (project.ownerId !== userId) {
    throw new ConvexError("FORBIDDEN");
  }
}

async function ensureVideoOwnership(
  ctx: GenericCtx,
  videoId: Id<"videos">,
  userId: Id<"users">
) {
  const video = await ctx.db.get(videoId);
  if (!video) {
    throw new ConvexError("VIDEO_NOT_FOUND");
  }
  if (video.ownerId !== userId) {
    throw new ConvexError("FORBIDDEN");
  }
  return video;
}

type SettingsInput = {
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  backgroundColor?: string;
};

function buildSettings(input?: SettingsInput, fallback?: SettingsInput) {
  if (input) {
    return { ...input };
  }
  return {
    width: fallback?.width ?? DEFAULT_SETTINGS.width,
    height: fallback?.height ?? DEFAULT_SETTINGS.height,
    fps: fallback?.fps ?? DEFAULT_SETTINGS.fps,
    durationFrames: fallback?.durationFrames ?? DEFAULT_SETTINGS.durationFrames,
    backgroundColor: fallback?.backgroundColor ?? DEFAULT_SETTINGS.backgroundColor,
  };
}

export const createComposition = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    sourceVideoId: v.optional(v.id("videos")),
    settings: v.optional(compositionSettingsValidator),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    if (args.projectId) {
      await ensureProjectOwnership(ctx, args.projectId, user._id);
    }

    let sourceVideo: any = null;
    if (args.sourceVideoId) {
      sourceVideo = await ensureVideoOwnership(ctx, args.sourceVideoId, user._id);
    }

    const settings = buildSettings(
      args.settings,
      sourceVideo
        ? {
            width: sourceVideo.width,
            height: sourceVideo.height,
            fps: Math.max(1, Math.round(sourceVideo.fps)),
            durationFrames: Math.max(1, Math.round(sourceVideo.duration * sourceVideo.fps)),
            backgroundColor: DEFAULT_SETTINGS.backgroundColor,
          }
        : undefined
    );

    const compositionId = await ctx.db.insert("compositions", {
      ownerId: user._id,
      projectId: args.projectId,
      sourceVideoId: args.sourceVideoId,
      title: args.title,
      description: args.description,
      settings,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    let initialClipId: Id<"compositionClips"> | null = null;
    if (sourceVideo) {
      const durationFrames = Math.max(
        1,
        Math.round(sourceVideo.duration * Math.max(1, sourceVideo.fps))
      );
      initialClipId = await ctx.db.insert("compositionClips", {
        compositionId,
        sourceVideoId: sourceVideo._id,
        sourceInFrame: 0,
        sourceOutFrame: durationFrames,
        timelineStartFrame: 0,
        speed: 1,
        opacity: 1,
        transformTrackId: undefined,
        zIndex: 0,
        label: sourceVideo.title,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { compositionId, initialClipId };
  },
});

export const listCompositions = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);

    if (args.projectId) {
      await ensureProjectOwnership(ctx, args.projectId, user._id);
    }

    let queryBuilder = ctx.db
      .query("compositions")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id));

    if (args.projectId) {
      queryBuilder = ctx.db
        .query("compositions")
        .withIndex("byProject", (q) => q.eq("projectId", args.projectId));
    }

    const compositions = await queryBuilder.collect();
    return compositions.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getComposition = query({
  args: {
    compositionId: v.id("compositions"),
  },
  async handler(ctx, { compositionId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const composition = await assertCompositionOwner(ctx, compositionId, user._id);

    const clips = await ctx.db
      .query("compositionClips")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();

    const tracks = await ctx.db
      .query("keyframeTracks")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();

    const exports = await ctx.db
      .query("compositionExports")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();

    const videoIds = Array.from(new Set(clips.map((clip) => clip.sourceVideoId)));
    const sources: Record<string, any> = {};
    for (const videoId of videoIds) {
      const videoDoc = await ctx.db.get(videoId);
      if (!videoDoc) continue;
      const key = videoDoc._id as Id<"videos">;
      sources[key] = {
        _id: videoDoc._id,
        title: videoDoc.title,
        width: videoDoc.width,
        height: videoDoc.height,
        fps: Math.max(1, Math.round(videoDoc.fps)),
        durationSeconds: videoDoc.duration,
        durationFrames: Math.max(1, Math.round(videoDoc.duration * Math.max(1, videoDoc.fps))),
        storageKey: videoDoc.storageKey,
        src: videoDoc.src,
      };
    }

    return {
      composition,
      clips: clips.sort((a, b) => a.timelineStartFrame - b.timelineStartFrame),
      tracks,
      exports: exports.sort((a, b) => b.createdAt - a.createdAt),
      sources,
    };
  },
});

export const updateComposition = mutation({
  args: {
    compositionId: v.id("compositions"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    settings: v.optional(compositionSettingsValidator),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    const composition = await assertCompositionOwner(ctx, args.compositionId, user._id);

    const patch: Record<string, any> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.settings) patch.settings = args.settings;

    if (Object.keys(patch).length === 0) return composition._id;

    patch.updatedAt = Date.now();
    await ctx.db.patch(args.compositionId, patch);
    return args.compositionId;
  },
});

export const deleteComposition = mutation({
  args: {
    compositionId: v.id("compositions"),
  },
  async handler(ctx, { compositionId }) {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCompositionOwner(ctx, compositionId, user._id);

    const clips = await ctx.db
      .query("compositionClips")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();
    for (const clip of clips) {
      await ctx.db.delete(clip._id);
    }

    const tracks = await ctx.db
      .query("keyframeTracks")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();
    for (const track of tracks) {
      await ctx.db.delete(track._id);
    }

    const exports = await ctx.db
      .query("compositionExports")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();
    for (const exp of exports) {
      await ctx.db.delete(exp._id);
      if (exp.renderJobId) {
        await ctx.db.delete(exp.renderJobId);
      }
    }

    await ctx.db.delete(compositionId);
  },
});

export const addClip = mutation({
  args: {
    compositionId: v.id("compositions"),
    sourceVideoId: v.id("videos"),
    sourceInFrame: v.number(),
    sourceOutFrame: v.number(),
    timelineStartFrame: v.number(),
    speed: v.optional(v.number()),
    opacity: v.optional(v.number()),
    label: v.optional(v.string()),
    zIndex: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    const composition = await assertCompositionOwner(ctx, args.compositionId, user._id);
    await ensureVideoOwnership(ctx, args.sourceVideoId, user._id);

    if (args.sourceOutFrame <= args.sourceInFrame) {
      throw new ConvexError("INVALID_RANGE");
    }

    const clips = await ctx.db
      .query("compositionClips")
      .withIndex("byComposition", (q) => q.eq("compositionId", args.compositionId))
      .collect();
    const highestZ = clips.length ? Math.max(...clips.map((clip) => clip.zIndex ?? 0)) : 0;

    const now = Date.now();
    const clipId = await ctx.db.insert("compositionClips", {
      compositionId: args.compositionId,
      sourceVideoId: args.sourceVideoId,
      sourceInFrame: args.sourceInFrame,
      sourceOutFrame: args.sourceOutFrame,
      timelineStartFrame: args.timelineStartFrame,
      speed: args.speed ?? 1,
      opacity: args.opacity ?? 1,
      transformTrackId: undefined,
      zIndex: args.zIndex ?? highestZ + 1,
      label: args.label,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.compositionId, { updatedAt: now });
    return clipId;
  },
});

export const updateClip = mutation({
  args: {
    clipId: v.id("compositionClips"),
    patch: clipPatchValidator,
  },
  async handler(ctx, { clipId, patch }) {
    const user = await getCurrentUserOrThrow(ctx);
    const clip = await ctx.db.get(clipId);
    if (!clip) throw new ConvexError("CLIP_NOT_FOUND");
    await assertCompositionOwner(ctx, clip.compositionId, user._id);

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        sanitized[key] = value;
      }
    }

    if (sanitized.sourceInFrame !== undefined || sanitized.sourceOutFrame !== undefined) {
      const sourceIn = sanitized.sourceInFrame ?? clip.sourceInFrame;
      const sourceOut = sanitized.sourceOutFrame ?? clip.sourceOutFrame;
      if (sourceOut <= sourceIn) {
        throw new ConvexError("INVALID_RANGE");
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return clipId;
    }

    sanitized.updatedAt = Date.now();
    await ctx.db.patch(clipId, sanitized);
    await ctx.db.patch(clip.compositionId, { updatedAt: Date.now() });
    return clipId;
  },
});

export const removeClip = mutation({
  args: {
    clipId: v.id("compositionClips"),
  },
  async handler(ctx, { clipId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const clip = await ctx.db.get(clipId);
    if (!clip) return;
    await assertCompositionOwner(ctx, clip.compositionId, user._id);

    await ctx.db.delete(clipId);
    const tracks = await ctx.db
      .query("keyframeTracks")
      .withIndex("byClip", (q) => q.eq("clipId", clipId))
      .collect();
    for (const track of tracks) {
      await ctx.db.delete(track._id);
    }
    await ctx.db.patch(clip.compositionId, { updatedAt: Date.now() });
  },
});

export const upsertKeyframeTrack = mutation({
  args: {
    compositionId: v.id("compositions"),
    trackId: v.optional(v.id("keyframeTracks")),
    clipId: v.optional(v.id("compositionClips")),
    channel: v.string(),
    keyframes: keyframeArrayValidator,
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCompositionOwner(ctx, args.compositionId, user._id);

    if (args.clipId) {
      const clip = await ctx.db.get(args.clipId);
      if (!clip) throw new ConvexError("CLIP_NOT_FOUND");
      if (clip.compositionId !== args.compositionId) {
        throw new ConvexError("INVALID_CLIP");
      }
    }

    const payload = {
      compositionId: args.compositionId,
      clipId: args.clipId,
      channel: args.channel,
      keyframes: args.keyframes,
      updatedAt: Date.now(),
    } as const;

    if (args.trackId) {
      const existing = await ctx.db.get(args.trackId);
      if (!existing) throw new ConvexError("TRACK_NOT_FOUND");
      if (existing.compositionId !== args.compositionId) {
        throw new ConvexError("FORBIDDEN");
      }
      await ctx.db.patch(args.trackId, payload);
      return args.trackId;
    }

    const trackId = await ctx.db.insert("keyframeTracks", {
      ...payload,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.compositionId, { updatedAt: Date.now() });
    return trackId;
  },
});

export const queueExport = mutation({
  args: {
    compositionId: v.id("compositions"),
    format: v.optional(v.string()),
  },
  async handler(ctx, { compositionId, format }) {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCompositionOwner(ctx, compositionId, user._id);
    const now = Date.now();
    const fmt = format ?? "video/mp4";

    const jobId = await ctx.db.insert("renderJobs", {
      jobType: "composition_export",
      compositionId,
      payload: { format: fmt },
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
    });

    const exportId = await ctx.db.insert("compositionExports", {
      compositionId,
      ownerId: user._id,
      status: "queued",
      format: fmt,
      renderJobId: jobId,
      outputStorageKey: undefined,
      outputPublicUrl: undefined,
      progress: 0,
      error: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.render.processJob, { jobId });

    return { exportId, jobId };
  },
});

export const attachExportToReview = mutation({
  args: {
    exportId: v.id("compositionExports"),
    videoId: v.id("videos"),
    frame: v.number(),
    center: v.optional(v.object({ x: v.number(), y: v.number() })),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  async handler(ctx, args): Promise<{ annotationId: Id<'annotations'> }> {
    const user = await getCurrentUserOrThrow(ctx);
    const exportDoc = await ctx.db.get(args.exportId);
    if (!exportDoc) throw new ConvexError("EXPORT_NOT_FOUND");
    if (exportDoc.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    if (exportDoc.status !== "completed" || !exportDoc.outputPublicUrl) {
      throw new ConvexError("EXPORT_NOT_READY");
    }

    const composition = exportDoc.compositionId ? await ctx.db.get(exportDoc.compositionId) : null;
    if (!composition) {
      throw new ConvexError("COMPOSITION_NOT_FOUND");
    }

    const targetVideo = await ensureVideoOwnership(ctx, args.videoId, user._id);

    const aspectRatio = composition.settings.width / Math.max(1, composition.settings.height);
    const frame = Math.max(0, Math.round(args.frame));
    const center = args.center ?? { x: 0.5, y: 0.5 };
    const widthNormalized = Math.min(Math.max(args.width ?? 0.35, 0.05), 0.9);
    const baseHeight = (widthNormalized / Math.max(aspectRatio, 0.01)) * (targetVideo.width / Math.max(targetVideo.height, 1));
    const computedHeight = Math.min(
      Math.max(args.height ?? baseHeight, 0.05),
      0.9,
    );

    const annotation: any = {
      type: "video",
      frame,
      center,
      width: widthNormalized,
      height: computedHeight,
      rotation: 0,
      color: "transparent",
      lineWidth: 0,
      src: exportDoc.outputPublicUrl,
      storageKey: exportDoc.outputStorageKey,
      duration: composition.settings.durationFrames / Math.max(1, composition.settings.fps),
    };

    const annotationId = (await ctx.runMutation(api.annotations.create, {
      videoId: args.videoId,
      annotation,
    })) as unknown as Id<'annotations'>;

    return { annotationId };
  },
});

export const listExports = query({
  args: {
    compositionId: v.id("compositions"),
  },
  async handler(ctx, { compositionId }) {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCompositionOwner(ctx, compositionId, user._id);

    const exports = await ctx.db
      .query("compositionExports")
      .withIndex("byComposition", (q) => q.eq("compositionId", compositionId))
      .collect();

    return exports.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// --- Composition save/load (snapshots) ---

export const listSavesByVideo = query({
  args: { videoId: v.optional(v.id('videos')) },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserOrThrow(ctx);
    if (!videoId) return [] as Array<any>;
    const saves = await ctx.db.query('compositionSaves').withIndex('byVideo', (q) => q.eq('videoId', videoId)).collect();
    return saves
      .filter((s) => s.ownerId === user._id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => ({ id: s._id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt }));
  }
});

export const saveSnapshot = mutation({
  args: { compositionId: v.id('compositions'), videoId: v.id('videos'), name: v.optional(v.string()) },
  async handler(ctx, { compositionId, videoId, name }) {
    const user = await getCurrentUserOrThrow(ctx);
    const composition = await assertCompositionOwner(ctx, compositionId, user._id);
    const clips = await ctx.db.query('compositionClips').withIndex('byComposition', (q) => q.eq('compositionId', compositionId)).collect();
    const tracks = await ctx.db.query('keyframeTracks').withIndex('byComposition', (q) => q.eq('compositionId', compositionId)).collect();
    const now = Date.now();
    const payload = {
      composition: {
        title: composition.title,
        description: composition.description ?? null,
        projectId: composition.projectId ?? null,
        sourceVideoId: composition.sourceVideoId ?? null,
        settings: composition.settings,
      },
      clips: clips.map((c) => ({
        id: c._id,
        sourceVideoId: c.sourceVideoId,
        sourceInFrame: c.sourceInFrame,
        sourceOutFrame: c.sourceOutFrame,
        timelineStartFrame: c.timelineStartFrame,
        speed: c.speed,
        opacity: c.opacity ?? 1,
        transformTrackId: c.transformTrackId ?? null,
        zIndex: c.zIndex,
        label: c.label ?? null,
      })),
      tracks: tracks.map((t) => ({
        id: t._id,
        clipId: t.clipId ?? null,
        channel: t.channel,
        keyframes: t.keyframes,
      })),
    };
    const saveId = await ctx.db.insert('compositionSaves', {
      ownerId: user._id,
      videoId,
      compositionId,
      name: name ?? `Snapshot ${new Date(now).toLocaleString()}`,
      snapshot: payload,
      createdAt: now,
      updatedAt: now,
    });
    return { id: saveId };
  }
});

export const renameSave = mutation({
  args: { saveId: v.id('compositionSaves'), name: v.string() },
  async handler(ctx, { saveId, name }) {
    const user = await getCurrentUserOrThrow(ctx);
    const save = await ctx.db.get(saveId);
    if (!save) throw new ConvexError('SAVE_NOT_FOUND');
    if (save.ownerId !== user._id) throw new ConvexError('FORBIDDEN');
    await ctx.db.patch(saveId, { name, updatedAt: Date.now() });
  }
});

export const deleteSave = mutation({
  args: { saveId: v.id('compositionSaves') },
  async handler(ctx, { saveId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const save = await ctx.db.get(saveId);
    if (!save) return;
    if (save.ownerId !== user._id) throw new ConvexError('FORBIDDEN');
    await ctx.db.delete(saveId);
  }
});

export const loadSnapshot = mutation({
  args: { saveId: v.id('compositionSaves'), title: v.optional(v.string()) },
  async handler(ctx, { saveId, title }) {
    const user = await getCurrentUserOrThrow(ctx);
    const save = await ctx.db.get(saveId);
    if (!save) throw new ConvexError('SAVE_NOT_FOUND');
    if (save.ownerId !== user._id) throw new ConvexError('FORBIDDEN');
    const snap = save.snapshot as any;
    const now = Date.now();

    const baseProjectId = snap.composition.projectId ?? null;
    if (baseProjectId) {
      await ensureProjectOwnership(ctx, baseProjectId, user._id);
    }

    const newCompId = await ctx.db.insert('compositions', {
      ownerId: user._id,
      projectId: baseProjectId ?? undefined,
      sourceVideoId: snap.composition.sourceVideoId ?? undefined,
      title: title ?? `${snap.composition.title} (loaded ${new Date(now).toLocaleString()})`,
      description: snap.composition.description ?? undefined,
      settings: snap.composition.settings,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Insert clips and build id mapping
    const idMap = new Map<string, any>();
    for (const c of snap.clips as Array<any>) {
      const clipId = await ctx.db.insert('compositionClips', {
        compositionId: newCompId,
        sourceVideoId: c.sourceVideoId,
        sourceInFrame: c.sourceInFrame,
        sourceOutFrame: c.sourceOutFrame,
        timelineStartFrame: c.timelineStartFrame,
        speed: c.speed,
        opacity: c.opacity ?? 1,
        transformTrackId: undefined,
        zIndex: c.zIndex,
        label: c.label ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
      idMap.set(c.id as string, clipId);
    }

    // Insert tracks with remapped clipIds
    for (const t of snap.tracks as Array<any>) {
      await ctx.db.insert('keyframeTracks', {
        compositionId: newCompId,
        clipId: t.clipId ? (idMap.get(t.clipId as string) ?? undefined) : undefined,
        channel: t.channel,
        keyframes: t.keyframes,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { compositionId: newCompId };
  }
});

export const upsertAutosave = mutation({
  args: { compositionId: v.id('compositions'), videoId: v.id('videos') },
  async handler(ctx, { compositionId, videoId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const composition = await assertCompositionOwner(ctx, compositionId, user._id);
    const clips = await ctx.db.query('compositionClips').withIndex('byComposition', (q) => q.eq('compositionId', compositionId)).collect();
    const tracks = await ctx.db.query('keyframeTracks').withIndex('byComposition', (q) => q.eq('compositionId', compositionId)).collect();
    const now = Date.now();
    const payload = {
      composition: {
        title: composition.title,
        description: composition.description ?? null,
        projectId: composition.projectId ?? null,
        sourceVideoId: composition.sourceVideoId ?? null,
        settings: composition.settings,
      },
      clips: clips.map((c) => ({
        id: c._id,
        sourceVideoId: c.sourceVideoId,
        sourceInFrame: c.sourceInFrame,
        sourceOutFrame: c.sourceOutFrame,
        timelineStartFrame: c.timelineStartFrame,
        speed: c.speed,
        opacity: c.opacity ?? 1,
        transformTrackId: c.transformTrackId ?? null,
        zIndex: c.zIndex,
        label: c.label ?? null,
      })),
      tracks: tracks.map((t) => ({ id: t._id, clipId: t.clipId ?? null, channel: t.channel, keyframes: t.keyframes })),
    };
    // Find existing 'Autosave' for this user + video
    const existing = (await ctx.db
      .query('compositionSaves')
      .withIndex('byVideo', (q) => q.eq('videoId', videoId))
      .collect())
      .find((s) => s.ownerId === user._id && s.name === 'Autosave');
    if (existing) {
      await ctx.db.patch(existing._id, { snapshot: payload, updatedAt: now, compositionId });
      return { id: existing._id };
    }
    const id = await ctx.db.insert('compositionSaves', {
      ownerId: user._id,
      videoId,
      compositionId,
      name: 'Autosave',
      snapshot: payload,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  }
});

export const getSaveState = query({
  args: { compositionId: v.id('compositions') },
  async handler(ctx, { compositionId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comp = await assertCompositionOwner(ctx, compositionId, user._id);
    const state = (await ctx.db
      .query('compositionSaveStates')
      .withIndex('byOwnerAndComposition', (q) => q.eq('ownerId', user._id).eq('compositionId', compositionId))
      .first()) as any;
    if (state) {
      return { currentSaveId: state.currentSaveId ?? null, autosaveEnabled: state.autosaveEnabled, autosaveIntervalMs: state.autosaveIntervalMs, persisted: true };
    }
    // Fallback: reuse latest settings for this user+video across compositions
    const fallback = (await ctx.db
      .query('compositionSaveStates')
      .withIndex('byOwnerAndVideo', (q) => q.eq('ownerId', user._id).eq('videoId', comp.sourceVideoId as Id<'videos'>))
      .collect())
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] as any | undefined;
    if (fallback) {
      return { currentSaveId: fallback.currentSaveId ?? null, autosaveEnabled: fallback.autosaveEnabled, autosaveIntervalMs: fallback.autosaveIntervalMs, persisted: false };
    }
    return { currentSaveId: null, autosaveEnabled: false, autosaveIntervalMs: 300000, persisted: false };
  }
});

export const setCurrentSave = mutation({
  args: { compositionId: v.id('compositions'), saveId: v.optional(v.id('compositionSaves')) },
  async handler(ctx, { compositionId, saveId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comp = await assertCompositionOwner(ctx, compositionId, user._id);
    const videoId = comp.sourceVideoId ?? null;
    if (!videoId) throw new ConvexError('COMPOSITION_HAS_NO_VIDEO');
    if (saveId) {
      const save = await ctx.db.get(saveId);
      if (!save) throw new ConvexError('SAVE_NOT_FOUND');
      if (save.ownerId !== user._id) throw new ConvexError('FORBIDDEN');
      if (save.videoId !== videoId) throw new ConvexError('MISMATCH_VIDEO');
    }
    const existing = await ctx.db
      .query('compositionSaveStates')
      .withIndex('byOwnerAndComposition', (q) => q.eq('ownerId', user._id).eq('compositionId', compositionId))
      .first();
    const patch = { currentSaveId: saveId ?? undefined, updatedAt: Date.now() } as any;
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    const id = await ctx.db.insert('compositionSaveStates', {
      ownerId: user._id,
      compositionId,
      videoId: videoId as Id<'videos'>,
      currentSaveId: saveId,
      autosaveEnabled: false,
      autosaveIntervalMs: 300000,
      updatedAt: Date.now(),
    });
    return id;
  }
});

export const setAutosave = mutation({
  args: { compositionId: v.id('compositions'), enabled: v.boolean(), intervalMs: v.number() },
  async handler(ctx, { compositionId, enabled, intervalMs }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comp = await assertCompositionOwner(ctx, compositionId, user._id);
    const videoId = comp.sourceVideoId ?? null;
    if (!videoId) throw new ConvexError('COMPOSITION_HAS_NO_VIDEO');
    const existing = await ctx.db
      .query('compositionSaveStates')
      .withIndex('byOwnerAndComposition', (q) => q.eq('ownerId', user._id).eq('compositionId', compositionId))
      .first();
    const patch = { autosaveEnabled: enabled, autosaveIntervalMs: intervalMs, updatedAt: Date.now() } as any;
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    const id = await ctx.db.insert('compositionSaveStates', {
      ownerId: user._id,
      compositionId,
      videoId: videoId as Id<'videos'>,
      currentSaveId: undefined,
      autosaveEnabled: enabled,
      autosaveIntervalMs: intervalMs,
      updatedAt: Date.now(),
    });
    return id;
  }
});

export const saveIntoCurrent = mutation({
  args: { compositionId: v.id('compositions') },
  async handler(ctx, { compositionId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const comp = await assertCompositionOwner(ctx, compositionId, user._id);
    const videoId = comp.sourceVideoId ?? null;
    if (!videoId) throw new ConvexError('COMPOSITION_HAS_NO_VIDEO');
    const state = await ctx.db
      .query('compositionSaveStates')
      .withIndex('byOwnerAndComposition', (q) => q.eq('ownerId', user._id).eq('compositionId', compositionId))
      .first();
    const now = Date.now();
    // Build payload
    const clips = await ctx.db.query('compositionClips').withIndex('byComposition', (q) => q.eq('compositionId', compositionId)).collect();
    const tracks = await ctx.db.query('keyframeTracks').withIndex('byComposition', (q) => q.eq('compositionId', compositionId)).collect();
    const snapshot = {
      composition: {
        title: comp.title,
        description: comp.description ?? null,
        projectId: comp.projectId ?? null,
        sourceVideoId: comp.sourceVideoId ?? null,
        settings: comp.settings,
      },
      clips: clips.map((c) => ({ id: c._id, sourceVideoId: c.sourceVideoId, sourceInFrame: c.sourceInFrame, sourceOutFrame: c.sourceOutFrame, timelineStartFrame: c.timelineStartFrame, speed: c.speed, opacity: c.opacity ?? 1, transformTrackId: c.transformTrackId ?? null, zIndex: c.zIndex, label: c.label ?? null })),
      tracks: tracks.map((t) => ({ id: t._id, clipId: t.clipId ?? null, channel: t.channel, keyframes: t.keyframes })),
    } as any;
    if (state?.currentSaveId) {
      await ctx.db.patch(state.currentSaveId, { snapshot, compositionId, updatedAt: now });
      return { id: state.currentSaveId };
    }
    // No current: create a default "Current" save and set it
    const saveId = await ctx.db.insert('compositionSaves', {
      ownerId: user._id,
      videoId: comp.sourceVideoId as Id<'videos'>,
      compositionId,
      name: 'Current',
      snapshot,
      createdAt: now,
      updatedAt: now,
    });
    if (state) {
      await ctx.db.patch(state._id, { currentSaveId: saveId, updatedAt: now });
    } else {
      await ctx.db.insert('compositionSaveStates', {
        ownerId: user._id,
        compositionId,
        videoId: comp.sourceVideoId as Id<'videos'>,
        currentSaveId: saveId,
        autosaveEnabled: false,
        autosaveIntervalMs: 300000,
        updatedAt: now,
      });
    }
    return { id: saveId };
  }
});

export const listExportsForVideo = query({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const user = await getCurrentUserOrThrow(ctx);
    await ensureVideoOwnership(ctx, videoId, user._id);

    const compositions = await ctx.db
      .query("compositions")
      .withIndex("bySourceVideo", (q) => q.eq("sourceVideoId", videoId))
      .collect();

    const results: Array<{
      export: any;
      composition: { _id: Id<'compositions'>; title: string; settings: any };
    }> = [];

    for (const composition of compositions) {
      if (composition.ownerId !== user._id) continue;
      const exports = await ctx.db
        .query("compositionExports")
        .withIndex("byComposition", (q) => q.eq("compositionId", composition._id))
        .collect();
      for (const exp of exports) {
        results.push({
          export: exp,
          composition: {
            _id: composition._id,
            title: composition.title,
            settings: composition.settings,
          },
        });
      }
    }

    return results.sort((a, b) => b.export.updatedAt - a.export.updatedAt);
  },
});
