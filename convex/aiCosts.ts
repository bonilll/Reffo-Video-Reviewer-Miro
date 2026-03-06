import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSubnetworkRead } from "./aiAccess";
import { getCurrentUserOrThrow } from "./utils/auth";
import {
  defaultNanoBananaConfig,
  estimateNanoBananaCostUsd,
  NANO_BANANA_CANONICAL_NODE_TYPE,
  NANO_BANANA_LEGACY_NODE_TYPE,
  normalizeNanoBananaConfig,
  normalizeNanoNodeType,
} from "./googleImageModelRegistry";

const ESTIMATED_MODEL_COST_USD: Record<string, number> = {
  prompt: 0,
  image_reference: 0,
  [NANO_BANANA_CANONICAL_NODE_TYPE]: 0.12,
  [NANO_BANANA_LEGACY_NODE_TYPE]: 0.12,
  veo3: 0.45,
};

const toMonthKey = (value: Date) => {
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}`;
};

const pickEffectiveCost = (entries: Array<{ metric: string; amountUsd: number }>) => {
  const actual = entries.filter((entry) => entry.metric === "actual").reduce((acc, entry) => acc + entry.amountUsd, 0);
  if (actual > 0) return actual;

  const estimated = entries
    .filter((entry) => entry.metric === "estimated")
    .reduce((acc, entry) => acc + entry.amountUsd, 0);

  const adjustment = entries
    .filter((entry) => entry.metric === "adjustment")
    .reduce((acc, entry) => acc + entry.amountUsd, 0);

  return estimated + adjustment;
};

const estimateNodeTypeCost = (nodeType: string) => {
  const normalized = normalizeNanoNodeType(nodeType);
  return ESTIMATED_MODEL_COST_USD[normalized] ?? 0.05;
};

const countReferencesForNode = async (ctx: any, node: any) => {
  const normalizedType = normalizeNanoNodeType(String(node.type ?? ""));
  if (normalizedType !== NANO_BANANA_CANONICAL_NODE_TYPE) return 0;

  const incoming = await ctx.db
    .query("aiEdges")
    .withIndex("byTarget", (q: any) => q.eq("targetNodeId", node._id))
    .collect();
  if (incoming.length === 0) return 0;

  const sourceIds = Array.from(new Set(incoming.map((edge: any) => edge.sourceNodeId)));
  const sourceNodes = await Promise.all(sourceIds.map((sourceId) => ctx.db.get(sourceId)));
  return sourceNodes.filter((source) => source && normalizeNanoNodeType(source.type) === "image_reference").length;
};

const estimateNodeUsd = async (ctx: any, node: any) => {
  const normalizedType = normalizeNanoNodeType(String(node.type ?? ""));
  if (normalizedType !== NANO_BANANA_CANONICAL_NODE_TYPE) {
    return estimateNodeTypeCost(normalizedType);
  }

  const refsCount = await countReferencesForNode(ctx, node);
  const { config } = normalizeNanoBananaConfig(node.config);
  return estimateNanoBananaCostUsd({
    modelId: config.modelId,
    runMode: config.runMode,
    imageSize: config.imageSize,
    referencesCount: refsCount,
    expectedImagesCount: 1,
  });
};

const sumLedgerEffective = (entries: any[]) => {
  const byRun = new Map<string, Array<{ metric: string; amountUsd: number }>>();
  let extra = 0;

  for (const entry of entries) {
    if (entry.nodeRunId) {
      const key = String(entry.nodeRunId);
      const list = byRun.get(key) ?? [];
      list.push({ metric: entry.metric, amountUsd: entry.amountUsd });
      byRun.set(key, list);
    } else {
      extra += entry.amountUsd;
    }
  }

  let total = extra;
  for (const list of byRun.values()) {
    total += pickEffectiveCost(list);
  }
  return total;
};

export const estimateNode = query({
  args: {
    nodeType: v.string(),
  },
  handler: async (_ctx, args) => {
    const normalizedType = normalizeNanoNodeType(args.nodeType);
    if (normalizedType === NANO_BANANA_CANONICAL_NODE_TYPE) {
      const config = defaultNanoBananaConfig();
      return {
        estimatedUsd: estimateNanoBananaCostUsd({
          modelId: config.modelId,
          runMode: config.runMode,
          imageSize: config.imageSize,
          referencesCount: 0,
          expectedImagesCount: 1,
        }),
      };
    }
    return {
      estimatedUsd: estimateNodeTypeCost(args.nodeType),
    };
  },
});

export const estimateForNodeId = query({
  args: {
    nodeId: v.id("aiNodes"),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) return { estimatedUsd: 0 };

    await requireSubnetworkRead(ctx, node.subnetworkId);
    return {
      estimatedUsd: await estimateNodeUsd(ctx, node),
    };
  },
});

export const getSubnetworkSpend = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkRead(ctx, args.subnetworkId);

    const entries = await ctx.db
      .query("aiCostLedger")
      .withIndex("bySubnetworkCreatedAt", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const total = sumLedgerEffective(entries);

    return {
      totalUsd: Number(total.toFixed(6)),
    };
  },
});

export const getUserMonthlySpend = query({
  args: {
    monthKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const monthKey = args.monthKey ?? toMonthKey(new Date());

    const entries = await ctx.db
      .query("aiCostLedger")
      .withIndex("byUserMonth", (q) => q.eq("userId", user._id).eq("monthKey", monthKey))
      .collect();

    const total = sumLedgerEffective(entries);

    return {
      monthKey,
      totalUsd: Number(total.toFixed(6)),
      entriesCount: entries.length,
    };
  },
});

export const getSummary = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    nodeId: v.optional(v.id("aiNodes")),
  },
  handler: async (ctx, args) => {
    const { subnetwork, user } = await requireSubnetworkRead(ctx, args.subnetworkId);

    let selectedRunEstimateUsd = 0;

    if (args.nodeId) {
      const node = await ctx.db.get(args.nodeId);
      if (node && node.subnetworkId === subnetwork._id) {
        selectedRunEstimateUsd = await estimateNodeUsd(ctx, node);
      }
    } else {
      const nodes = await ctx.db
        .query("aiNodes")
        .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
        .collect();
      const estimates = await Promise.all(nodes.map((node) => estimateNodeUsd(ctx, node)));
      selectedRunEstimateUsd = estimates.reduce((acc, amount) => acc + amount, 0);
    }

    const subnetworkEntries = await ctx.db
      .query("aiCostLedger")
      .withIndex("bySubnetworkCreatedAt", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const monthKey = toMonthKey(new Date());
    const monthlyEntries = await ctx.db
      .query("aiCostLedger")
      .withIndex("byUserMonth", (q) => q.eq("userId", user._id).eq("monthKey", monthKey))
      .collect();

    return {
      selectedRunEstimateUsd: Number(selectedRunEstimateUsd.toFixed(6)),
      subnetworkTotalUsd: Number(sumLedgerEffective(subnetworkEntries).toFixed(6)),
      monthlyTotalUsd: Number(sumLedgerEffective(monthlyEntries).toFixed(6)),
      monthKey,
    };
  },
});
