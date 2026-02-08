"use node";

import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

const qdrantFilterFor = (args: { userId: string; orgId?: string | null; type?: string | null }) => {
  const must: any[] = [{ key: "userId", match: { value: args.userId } }];
  if (args.orgId) must.push({ key: "orgId", match: { value: args.orgId } });
  if (args.type) must.push({ key: "type", match: { value: args.type } });
  return { must };
};

export const recommendByAssetId = action({
  args: {
    assetId: v.id("assets"),
    limit: v.optional(v.number()),
    // If true, restricts results to the same asset type (recommended).
    sameType: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery("users:current" as any, {});
    if (!user?._id) throw new ConvexError("NOT_AUTHENTICATED");

    const asset = await ctx.runQuery("assets:getById" as any, { id: args.assetId });
    if (!asset) throw new ConvexError("NOT_FOUND");
    if (!asset.embeddingRef) return [];

    const points: Array<{ id: string; score: number; payload?: any }> = await ctx.runAction(
      internal.qdrant.recommendById,
      {
      id: asset.embeddingRef,
      limit: args.limit ?? 12,
      filter: qdrantFilterFor({
        userId: String(user._id),
        orgId: asset.orgId ?? null,
        type: args.sameType === false ? null : (asset.type ?? null),
      }),
      },
    );

    // Qdrant point ids are stored as embeddingRef; we strongly recommend using assetId as point id.
    const ids: string[] = points
      .map((p) => (p?.payload?.assetId as string | undefined) ?? p.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .filter((id) => id !== String(asset._id));

    const unique = Array.from(new Set(ids));
    return await ctx.runQuery("assets:getManyByIds" as any, { ids: unique });
  },
});

export const searchByVector = action({
  args: {
    vector: v.array(v.number()),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery("users:current" as any, {});
    if (!user?._id) throw new ConvexError("NOT_AUTHENTICATED");

    const points: Array<{ id: string; score: number; payload?: any }> = await ctx.runAction(
      internal.qdrant.searchByVector,
      {
      vector: args.vector,
      limit: args.limit ?? 12,
      filter: qdrantFilterFor({
        userId: String(user._id),
        orgId: null,
        type: args.type ?? null,
      }),
      },
    );

    const ids: string[] = points
      .map((p) => (p?.payload?.assetId as string | undefined) ?? p.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const unique = Array.from(new Set(ids));
    return await ctx.runQuery("assets:getManyByIds" as any, { ids: unique });
  },
});
