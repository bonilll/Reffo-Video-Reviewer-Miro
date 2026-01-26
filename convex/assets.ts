import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

export const getUserLibrary = query({
  args: {
    userId: v.optional(v.string()),
    orgId: v.optional(v.string()),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    const records = await ctx.db
      .query("assets")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return records;
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    fileUrl: v.string(),
    fileName: v.string(),
    type: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    fps: v.optional(v.number()),
    aspectRatio: v.optional(v.number()),
    dominantColors: v.optional(v.array(v.string())),
    colorFingerprint: v.optional(v.array(v.number())),
    phash: v.optional(v.string()),
    exif: v.optional(v.any()),
    orgId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();
    const title = args.title?.trim() || args.fileName;
    return await ctx.db.insert("assets", {
      userId: user._id,
      title,
      fileUrl: args.fileUrl,
      type: args.type,
      fileName: args.fileName,
      createdAt: now,
      updatedAt: now,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      width: args.width,
      height: args.height,
      durationSeconds: args.durationSeconds,
      fps: args.fps,
      aspectRatio: args.aspectRatio,
      dominantColors: args.dominantColors,
      colorFingerprint: args.colorFingerprint,
      phash: args.phash,
      exif: args.exif,
      analysisStatus: "none",
      orgId: args.orgId,
      source: args.source,
    });
  },
});

export const updateMetadata = mutation({
  args: {
    id: v.id("assets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tokens: v.optional(v.array(v.string())),
    externalLink: v.optional(v.string()),
    author: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }
    await ctx.db.patch(args.id, {
      title: args.title ?? asset.title,
      description: args.description,
      tokens: args.tokens,
      externalLink: args.externalLink,
      author: args.author,
      isPrivate: args.isPrivate,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const patchDerived = mutation({
  args: {
    id: v.id("assets"),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    fps: v.optional(v.number()),
    aspectRatio: v.optional(v.number()),
    dominantColors: v.optional(v.array(v.string())),
    colorFingerprint: v.optional(v.array(v.number())),
    phash: v.optional(v.string()),
    exif: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }
    await ctx.db.patch(args.id, {
      mimeType: args.mimeType ?? asset.mimeType,
      fileSize: args.fileSize ?? asset.fileSize,
      width: args.width ?? asset.width,
      height: args.height ?? asset.height,
      durationSeconds: args.durationSeconds ?? asset.durationSeconds,
      fps: args.fps ?? asset.fps,
      aspectRatio: args.aspectRatio ?? asset.aspectRatio,
      dominantColors: args.dominantColors ?? asset.dominantColors,
      colorFingerprint: args.colorFingerprint ?? asset.colorFingerprint,
      phash: args.phash ?? asset.phash,
      exif: args.exif ?? asset.exif,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const deleteAsset = mutation({
  args: {
    id: v.id("assets"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }
    await ctx.db.delete(args.id);
    return args.id;
  },
});
