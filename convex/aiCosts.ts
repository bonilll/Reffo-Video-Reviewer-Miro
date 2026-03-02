import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSubnetworkRead } from "./aiAccess";
import { getCurrentUserOrThrow } from "./utils/auth";

const ESTIMATED_MODEL_COST_USD: Record<string, number> = {
  prompt: 0,
  image_reference: 0,
  nano_banana_pro: 0.12,
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
  const normalized = nodeType.trim().toLowerCase();
  return ESTIMATED_MODEL_COST_USD[normalized] ?? 0.05;
};

export const estimateNode = query({
  args: {
    nodeType: v.string(),
  },
  handler: async (_ctx, args) => {
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
      estimatedUsd: estimateNodeTypeCost(node.type),
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
        selectedRunEstimateUsd = estimateNodeTypeCost(node.type);
      }
    } else {
      const nodes = await ctx.db
        .query("aiNodes")
        .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
        .collect();
      selectedRunEstimateUsd = nodes.reduce((acc, node) => acc + estimateNodeTypeCost(node.type), 0);
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

    const sumSimple = (entries: Array<{ amountUsd: number }>) =>
      entries.reduce((acc, entry) => acc + entry.amountUsd, 0);

    return {
      selectedRunEstimateUsd: Number(selectedRunEstimateUsd.toFixed(6)),
      subnetworkTotalUsd: Number(sumSimple(subnetworkEntries).toFixed(6)),
      monthlyTotalUsd: Number(sumSimple(monthlyEntries).toFixed(6)),
      monthKey,
    };
  },
});
