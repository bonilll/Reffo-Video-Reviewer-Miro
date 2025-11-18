import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const processJob = internalMutation({
  args: {
    jobId: v.id("renderJobs"),
  },
  async handler(ctx, { jobId }) {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    if (job.status !== "queued") return;

    const start = Date.now();
    await ctx.db.patch(jobId, {
      status: "running",
      startedAt: start,
      updatedAt: start,
      progress: 5,
      error: undefined,
    });

    const fail = async (message: string) => {
      await ctx.db.patch(jobId, {
        status: "failed",
        progress: 0,
        updatedAt: Date.now(),
        completedAt: Date.now(),
        error: message,
      });
      if (job.compositionId) {
        const exports = await ctx.db
          .query("compositionExports")
          .withIndex("byComposition", (q) => q.eq("compositionId", job.compositionId as any))
          .collect();
        const target = exports.find((exp) => exp.renderJobId === jobId);
        if (target) {
          await ctx.db.patch(target._id, {
            status: "failed",
            progress: 0,
            error: message,
            updatedAt: Date.now(),
          });
        }
      }
      throw new ConvexError(message);
    };

    if (!job.compositionId) {
      await fail("Missing composition");
      return;
    }

    const composition = await ctx.db.get(job.compositionId);
    if (!composition) {
      await fail("Composition not found");
      return;
    }

    const clips = await ctx.db
      .query("compositionClips")
      .withIndex("byComposition", (q) => q.eq("compositionId", job.compositionId!))
      .collect();

    if (!clips.length) {
      await fail("No clips to render");
      return;
    }

    const sortedClips = clips.sort((a, b) => a.timelineStartFrame - b.timelineStartFrame);
    const primaryClip = sortedClips[0];
    const sourceVideo = await ctx.db.get(primaryClip.sourceVideoId);
    if (!sourceVideo) {
      await fail("Source video missing");
      return;
    }

    const midUpdate = Date.now();
    await ctx.db.patch(jobId, { progress: 60, updatedAt: midUpdate });

    const exports = await ctx.db
      .query("compositionExports")
      .withIndex("byComposition", (q) => q.eq("compositionId", job.compositionId!))
      .collect();
    const target = exports.find((exp) => exp.renderJobId === jobId);
    if (!target) {
      await fail("Export record missing");
      return;
    }

    const resultKey = sourceVideo.storageKey;
    const resultUrl = sourceVideo.src;

    await ctx.db.patch(target._id, {
      status: "completed",
      progress: 100,
      outputStorageKey: resultKey,
      outputPublicUrl: resultUrl,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(jobId, {
      status: "completed",
      progress: 100,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
