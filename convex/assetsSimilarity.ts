"use node";

import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

type QdrantPoint = {
  id: string;
  score: number;
  payload?: any;
};

const qdrantFilterFor = (args: {
  userId: string;
  orgId?: string | null;
  type?: string | null;
  embeddingModel?: string | null;
  embeddingDim?: number | null;
}) => {
  const must: any[] = [{ key: "userId", match: { value: args.userId } }];
  if (args.orgId) must.push({ key: "orgId", match: { value: args.orgId } });
  if (args.type) must.push({ key: "type", match: { value: args.type } });
  if (args.embeddingModel) {
    must.push({ key: "embeddingModel", match: { value: args.embeddingModel } });
  }
  if (typeof args.embeddingDim === "number" && Number.isFinite(args.embeddingDim)) {
    must.push({ key: "embeddingDim", match: { value: args.embeddingDim } });
  }
  return { must };
};

const clampLimit = (value: number | undefined, fallback: number) => {
  const n = Math.floor(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), 200);
};

const clampMinScore = (value: number | undefined, fallback: number) => {
  const n = value ?? fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-1, Math.min(1, n));
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeOptionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const resolveCommonValue = (values: Array<string | null | undefined>) => {
  const normalized = values.map((value) =>
    typeof value === "string" && value.length > 0 ? value : null,
  );
  if (normalized.length === 0) return null;
  const [first, ...rest] = normalized;
  if (!first) return null;
  return rest.every((value) => value === first) ? first : null;
};

const pointToAssetId = (point: QdrantPoint) => {
  const byPayload = point?.payload?.assetId;
  if (typeof byPayload === "string" && byPayload.length > 0) return byPayload;
  return typeof point.id === "string" && point.id.length > 0 ? point.id : null;
};

const mapPointsToScoredAssets = async (
  ctx: any,
  points: QdrantPoint[],
  excludedAssetIds: Set<string>,
  options?: { minScore?: number },
) => {
  const minScore = options?.minScore;
  const bestByAssetId = new Map<string, { score: number; pointId: string; payload?: any }>();

  for (const point of points) {
    if (typeof point.score !== "number" || !Number.isFinite(point.score)) continue;
    if (typeof minScore === "number" && point.score < minScore) continue;
    const assetId = pointToAssetId(point);
    if (!assetId || excludedAssetIds.has(assetId)) continue;
    const current = bestByAssetId.get(assetId);
    if (!current || point.score > current.score) {
      bestByAssetId.set(assetId, {
        score: point.score,
        pointId: point.id,
        payload: point.payload,
      });
    }
  }

  const ids = Array.from(bestByAssetId.keys());
  if (ids.length === 0) return [];

  const assets = await ctx.runQuery("assets:getManyByIds" as any, { ids });
  const assetsById = new Map<string, any>(assets.map((asset: any) => [String(asset._id), asset]));

  return ids
    .map((assetId) => {
      const asset = assetsById.get(assetId);
      if (!asset) return null;
      const meta = bestByAssetId.get(assetId)!;
      const payloadEmbeddingRef = normalizeOptionalString(meta.payload?.embeddingRef);
      const payloadEmbeddingModel = normalizeOptionalString(meta.payload?.embeddingModel);
      const payloadEmbeddingDim = normalizeOptionalNumber(meta.payload?.embeddingDim);

      const assetEmbeddingRef = normalizeOptionalString(asset.embeddingRef);
      const assetEmbeddingModel = normalizeOptionalString(asset.embeddingModel);
      const assetEmbeddingDim = normalizeOptionalNumber(asset.embeddingDim);

      // Ignore stale points from previous embedding generations.
      if (assetEmbeddingRef && payloadEmbeddingRef !== assetEmbeddingRef) return null;
      if (assetEmbeddingModel && payloadEmbeddingModel !== assetEmbeddingModel) return null;
      if (typeof assetEmbeddingDim === "number" && payloadEmbeddingDim !== assetEmbeddingDim) return null;

      return {
        assetId,
        score: meta.score,
        embeddingRef: payloadEmbeddingRef || (typeof meta.pointId === "string" ? meta.pointId : undefined),
        asset,
      };
    })
    .filter((item: any): item is any => Boolean(item))
    .sort((a, b) => b.score - a.score);
};

const runRecommendForAssetIds = async (
  ctx: any,
  args: {
    assetIds: string[];
    sameType?: boolean;
    limit?: number;
    minScore?: number;
  },
) => {
  const user = await ctx.runQuery("users:current" as any, {});
  if (!user?._id) throw new ConvexError("NOT_AUTHENTICATED");

  const uniqueAssetIds = Array.from(
    new Set(args.assetIds.filter((id) => typeof id === "string" && id.length > 0)),
  );
  if (uniqueAssetIds.length === 0) return [];

  const seedAssets = await ctx.runQuery("assets:getManyByIds" as any, { ids: uniqueAssetIds });
  if (seedAssets.length === 0) throw new ConvexError("NOT_FOUND");

  const seedAssetsWithEmbedding = seedAssets.filter(
    (asset: any) => typeof asset.embeddingRef === "string" && asset.embeddingRef.length > 0,
  );
  if (seedAssetsWithEmbedding.length === 0) return [];

  const onlySameType = args.sameType !== false;
  const filterType = onlySameType
    ? resolveCommonValue(seedAssetsWithEmbedding.map((asset: any) => asset.type ?? null))
    : null;
  const filterOrgId = resolveCommonValue(seedAssetsWithEmbedding.map((asset: any) => asset.orgId ?? null));
  const targetLimit = clampLimit(args.limit, 40);
  const minScore = clampMinScore(args.minScore, 0.22);

  const seedByEmbeddingRef = new Map<
    string,
    { embeddingRef: string; embeddingModel: string | null; embeddingDim: number | null }
  >();
  for (const asset of seedAssetsWithEmbedding) {
    const embeddingRef = String(asset.embeddingRef);
    if (seedByEmbeddingRef.has(embeddingRef)) continue;
    seedByEmbeddingRef.set(embeddingRef, {
      embeddingRef,
      embeddingModel: normalizeOptionalString(asset.embeddingModel),
      embeddingDim: normalizeOptionalNumber(asset.embeddingDim),
    });
  }

  const MAX_SEEDS = 8;
  const seeds = Array.from(seedByEmbeddingRef.values()).slice(0, MAX_SEEDS);
  if (seeds.length === 0) return [];

  const perSeedLimit = Math.min(200, Math.max(targetLimit, 30));
  const pointsBySeed: QdrantPoint[][] = await Promise.all(
    seeds.map((seed) =>
      ctx.runAction(internal.qdrant.recommendById, {
        id: seed.embeddingRef,
        limit: perSeedLimit,
        filter: qdrantFilterFor({
          userId: String(user._id),
          orgId: filterOrgId,
          type: filterType,
          embeddingModel: seed.embeddingModel,
          embeddingDim: seed.embeddingDim,
        }),
      }),
    ),
  );
  const points = pointsBySeed.flat();

  const excluded = new Set<string>(seedAssets.map((asset: any) => String(asset._id)));
  const scored = await mapPointsToScoredAssets(ctx, points, excluded, { minScore });
  return scored.slice(0, targetLimit);
};

export const recommendByAssetId = action({
  args: {
    assetId: v.id("assets"),
    limit: v.optional(v.number()),
    sameType: v.optional(v.boolean()),
    minScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await runRecommendForAssetIds(ctx, {
      assetIds: [String(args.assetId)],
      limit: args.limit ?? 12,
      sameType: args.sameType,
      minScore: args.minScore,
    });
  },
});

export const recommendByAssetIds = action({
  args: {
    assetIds: v.array(v.id("assets")),
    limit: v.optional(v.number()),
    sameType: v.optional(v.boolean()),
    minScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await runRecommendForAssetIds(ctx, {
      assetIds: args.assetIds.map((id) => String(id)),
      limit: args.limit ?? 80,
      sameType: args.sameType,
      minScore: args.minScore,
    });
  },
});

export const searchByVector = action({
  args: {
    vector: v.array(v.number()),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
    minScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery("users:current" as any, {});
    if (!user?._id) throw new ConvexError("NOT_AUTHENTICATED");

    const points: QdrantPoint[] = await ctx.runAction(internal.qdrant.searchByVector, {
      vector: args.vector,
      limit: clampLimit(args.limit, 12),
      filter: qdrantFilterFor({
        userId: String(user._id),
        orgId: null,
        type: args.type ?? null,
      }),
    });

    return await mapPointsToScoredAssets(ctx, points, new Set<string>(), {
      minScore: clampMinScore(args.minScore, 0.22),
    });
  },
});
