import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

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
  push(asset.captionsI18n?.it);
  push(asset.captionsI18n?.en);
  pushMany(asset.aiTokensI18n?.it);
  pushMany(asset.aiTokensI18n?.en);
  pushMany(asset.userTokens);
  pushMany(asset.tokens);

  const text = normalizeText(parts.join(" "));
  return text.length > 12000 ? text.slice(0, 12000) : text;
};

export const getUserLibrary = query({
  args: {
    userId: v.optional(v.string()),
    orgId: v.optional(v.string()),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    const q = args.searchQuery?.trim();
    if (q) {
      const results = await ctx.db
        .query("assets")
        .withSearchIndex("search_assets_full", (s) =>
          s.search("searchText", q).eq("userId", user._id),
        )
        .take(80);
      return results;
    }
    return await ctx.db
      .query("assets")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getByFileUrls = query({
  args: {
    fileUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    const uniqueUrls = Array.from(new Set(args.fileUrls.filter((url) => url)));
    if (uniqueUrls.length === 0) return [];
    const found: string[] = [];
    for (const url of uniqueUrls) {
      const existing = await ctx.db
        .query("assets")
        .withIndex("byFileUrl", (q) => q.eq("fileUrl", url))
        .filter((q) => q.eq(q.field("userId"), user._id))
        .first();
      if (existing) {
        found.push(url);
      }
    }
    return found;
  },
});

export const getById = query({
  args: {
    id: v.id("assets"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== user._id) {
      return null;
    }
    return asset;
  },
});

export const getManyByIds = query({
  args: {
    ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const unique = Array.from(new Set(args.ids.filter((id) => typeof id === "string" && id)));
    if (unique.length === 0) return [];
    const docs = await Promise.all(
      unique.map(async (id) => {
        try {
          return (await ctx.db.get(id as any)) as any;
        } catch {
          return null;
        }
      }),
    );
    return docs.filter((doc: any): doc is any => Boolean(doc) && doc.userId === user._id);
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    fileUrl: v.string(),
    storageKey: v.optional(v.string()),
    fileName: v.string(),
    type: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    fps: v.optional(v.number()),
    aspectRatio: v.optional(v.number()),
    blurDataUrl: v.optional(v.string()),
    variants: v.optional(v.any()),
    sha256: v.optional(v.string()),
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
    const base: any = {
      userId: user._id,
      title,
      fileUrl: args.fileUrl,
      storageKey: args.storageKey,
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
      blurDataUrl: args.blurDataUrl,
      variants: args.variants,
      sha256: args.sha256,
      dominantColors: args.dominantColors,
      colorFingerprint: args.colorFingerprint,
      phash: args.phash,
      exif: args.exif,
      analysisStatus: "none",
      orgId: args.orgId,
      source: args.source,
    };
    base.searchText = buildSearchText(base);
    return await ctx.db.insert("assets", base);
  },
});

export const createFromBoardMedia = mutation({
  args: {
    fileUrl: v.string(),
    fileName: v.string(),
    type: v.string(),
    title: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query("assets")
      .withIndex("byFileUrl", (q) => q.eq("fileUrl", args.fileUrl))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();
    if (existing) {
      return existing._id;
    }
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
      analysisStatus: "none",
      source: args.source ?? "board",
    });
  },
});

export const updateMetadata = mutation({
  args: {
    id: v.id("assets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tokens: v.optional(v.array(v.string())),
    userTokens: v.optional(v.array(v.string())),
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
      userTokens: args.userTokens ?? args.tokens ?? asset.userTokens,
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
    blurDataUrl: v.optional(v.string()),
    variants: v.optional(v.any()),
    sha256: v.optional(v.string()),
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
    const next: any = {
      mimeType: args.mimeType ?? asset.mimeType,
      fileSize: args.fileSize ?? asset.fileSize,
      width: args.width ?? asset.width,
      height: args.height ?? asset.height,
      durationSeconds: args.durationSeconds ?? asset.durationSeconds,
      fps: args.fps ?? asset.fps,
      aspectRatio: args.aspectRatio ?? asset.aspectRatio,
      blurDataUrl: args.blurDataUrl ?? asset.blurDataUrl,
      variants: args.variants ?? asset.variants,
      sha256: args.sha256 ?? asset.sha256,
      dominantColors: args.dominantColors ?? asset.dominantColors,
      colorFingerprint: args.colorFingerprint ?? asset.colorFingerprint,
      phash: args.phash ?? asset.phash,
      exif: args.exif ?? asset.exif,
      updatedAt: Date.now(),
    };
    next.searchText = buildSearchText({ ...asset, ...next });
    await ctx.db.patch(args.id, next);
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
