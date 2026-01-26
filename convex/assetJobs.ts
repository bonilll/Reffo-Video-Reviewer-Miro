import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getCurrentUserOrThrow } from "./utils/auth";

export const enqueue = mutation({
  args: {
    assetId: v.id("assets"),
    requestedFeatures: v.object({
      ocr: v.boolean(),
      caption: v.boolean(),
      tags: v.boolean(),
      embedding: v.boolean(),
      colors: v.boolean(),
      exif: v.boolean(),
    }),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.userId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("assetAnalysisJobs", {
      assetId: args.assetId,
      userId: user._id,
      status: "queued",
      priority: args.priority ?? 0,
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
      requestedFeatures: args.requestedFeatures,
    });
    await ctx.db.patch(args.assetId, {
      analysisStatus: "queued",
      analysisUpdatedAt: now,
    });
    return jobId;
  },
});

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const jobs = await ctx.db
      .query("assetAnalysisJobs")
      .withIndex("byUserCreatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return jobs;
  },
});

export const updateStatus = mutation({
  args: {
    jobId: v.id("assetAnalysisJobs"),
    status: v.string(),
    error: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }
    await ctx.db.patch(args.jobId, {
      status: args.status,
      error: args.error,
      resultSummary: args.resultSummary,
      updatedAt: Date.now(),
    });
    return args.jobId;
  },
});
