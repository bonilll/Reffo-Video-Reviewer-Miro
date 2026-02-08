import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildSearchText = (asset: any) => {
  const parts: string[] = [];
  const push = (v?: string | null) => {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) parts.push(t);
  };
  const pushMany = (arr?: string[] | null) => {
    if (!Array.isArray(arr)) return;
    for (const v of arr) push(v);
  };

  push(asset.title);
  push(asset.description);
  push(asset.ocrText);

  // Multilingual captions/tags
  push(asset.captionsI18n?.it);
  push(asset.captionsI18n?.en);
  pushMany(asset.aiTokensI18n?.it);
  pushMany(asset.aiTokensI18n?.en);

  // Manual tags
  pushMany(asset.userTokens);
  pushMany(asset.tokens);

  const text = normalizeText(parts.join(" "));
  // Prevent runaway document sizes from OCR/tags.
  return text.length > 12000 ? text.slice(0, 12000) : text;
};

export const claimNextJob = internalMutation({
  args: {
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // NOTE: we use `byStatusUpdatedAt` because it exists. This is a simple FIFO.
    const job = await ctx.db
      .query("assetAnalysisJobs")
      .withIndex("byStatusUpdatedAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    if (!job) return null;

    if (job.attempts >= job.maxAttempts) {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: "MAX_ATTEMPTS_EXCEEDED",
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(job._id, {
      status: "processing",
      lockedAt: now,
      lockedBy: args.workerId,
      attempts: job.attempts + 1,
      error: undefined,
      updatedAt: now,
    });

    const asset = await ctx.db.get(job.assetId);
    if (!asset) {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: "ASSET_NOT_FOUND",
        updatedAt: now,
      });
      return null;
    }

    // Keep asset state in sync for UI. Asset might be deleted between `get` and `patch`.
    try {
      await ctx.db.patch(job.assetId, {
        analysisStatus: "processing",
        analysisUpdatedAt: now,
        updatedAt: now,
      });
    } catch {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: "ASSET_NOT_FOUND",
        updatedAt: now,
      });
      return null;
    }

    return { job, asset };
  },
});

export const heartbeatJob = internalMutation({
  args: {
    jobId: v.id("assetAnalysisJobs"),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new ConvexError("JOB_NOT_FOUND");
    if (job.lockedBy !== args.workerId) throw new ConvexError("NOT_LOCK_OWNER");
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      lockedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const applyAnalysisResult = internalMutation({
  args: {
    jobId: v.id("assetAnalysisJobs"),
    workerId: v.string(),
    analysisVersion: v.string(),
    resultSummary: v.optional(v.string()),
    assetPatch: v.object({
      captionsI18n: v.optional(v.any()),
      aiTokensI18n: v.optional(v.any()),
      ocrText: v.optional(v.string()),
      dominantColors: v.optional(v.array(v.string())),
      phash: v.optional(v.string()),
      sha256: v.optional(v.string()),
      embeddingProvider: v.optional(v.string()),
      embeddingRef: v.optional(v.string()),
      embeddingModel: v.optional(v.string()),
      embeddingDim: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new ConvexError("JOB_NOT_FOUND");
    if (job.lockedBy !== args.workerId) throw new ConvexError("NOT_LOCK_OWNER");

    const asset = await ctx.db.get(job.assetId);
    if (!asset) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        error: "ASSET_NOT_FOUND",
        updatedAt: now,
      });
      return { ok: true };
    }

    const nextAsset: any = {
      ...args.assetPatch,
      analysisStatus: "done",
      analysisError: undefined,
      analysisUpdatedAt: now,
      analysisVersion: args.analysisVersion,
      embeddingUpdatedAt: args.assetPatch.embeddingRef ? now : asset.embeddingUpdatedAt,
      updatedAt: now,
    };

    // Ensure `searchText` is always coherent with the latest captions/tags/ocr.
    const searchText = buildSearchText({ ...asset, ...nextAsset });
    nextAsset.searchText = searchText;

    await ctx.db.patch(job.assetId, nextAsset);

    await ctx.db.patch(args.jobId, {
      status: "done",
      error: undefined,
      resultSummary: args.resultSummary,
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id("assetAnalysisJobs"),
    workerId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new ConvexError("JOB_NOT_FOUND");
    if (job.lockedBy !== args.workerId) throw new ConvexError("NOT_LOCK_OWNER");

    const willRetry = job.attempts < job.maxAttempts;
    await ctx.db.patch(args.jobId, {
      status: willRetry ? "queued" : "failed",
      lockedAt: undefined,
      lockedBy: undefined,
      error: args.error,
      updatedAt: now,
    });

    // Asset may already be deleted; don't crash the worker endpoints.
    try {
      await ctx.db.patch(job.assetId, {
        analysisStatus: willRetry ? "queued" : "failed",
        analysisError: args.error,
        analysisUpdatedAt: now,
        updatedAt: now,
      });
    } catch {
      // ignore
    }

    return { ok: true, willRetry };
  },
});
