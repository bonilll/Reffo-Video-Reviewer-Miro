import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireBoardRead, requireSubnetworkRead, requireSubnetworkWrite } from "./aiAccess";
import { normalizeNanoNodeType } from "./googleImageModelRegistry";

export const listNodeVersions = query({
  args: {
    nodeId: v.id("aiNodes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError("AI_NODE_NOT_FOUND");

    await requireSubnetworkRead(ctx, node.subnetworkId);

    const items = await ctx.db
      .query("aiNodeOutputs")
      .withIndex("byNodeCreatedAt", (q) => q.eq("nodeId", node._id))
      .order("desc")
      .collect();

    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    return items.slice(0, limit);
  },
});

export const markPinned = mutation({
  args: {
    outputId: v.id("aiNodeOutputs"),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const output = await ctx.db.get(args.outputId);
    if (!output) throw new ConvexError("AI_OUTPUT_NOT_FOUND");

    const { subnetwork } = await requireSubnetworkWrite(ctx, output.subnetworkId);

    await ctx.db.patch(output._id, {
      pinned: args.pinned,
      markedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(subnetwork._id, { updatedAt: Date.now() });
    return output._id;
  },
});

export const listForBoard = query({
  args: {
    boardId: v.id("boards"),
    subnetworkId: v.optional(v.id("aiSubnetworks")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBoardRead(ctx, args.boardId);

    const raw = await ctx.db
      .query("aiNodeOutputs")
      .withIndex("byBoard", (q) => q.eq("boardId", args.boardId))
      .order("desc")
      .collect();

    const filtered = args.subnetworkId
      ? raw.filter((item) => item.subnetworkId === args.subnetworkId)
      : raw;

    const limit = Math.max(1, Math.min(args.limit ?? 200, 1000));
    const sliced = filtered.slice(0, limit);

    const nodeIds = Array.from(new Set(sliced.map((output) => output.nodeId)));
    const subnetworkIds = Array.from(new Set(sliced.map((output) => output.subnetworkId)));

    const nodes = await Promise.all(nodeIds.map((id) => ctx.db.get(id)));
    const subnetworks = await Promise.all(subnetworkIds.map((id) => ctx.db.get(id)));

    const nodeMap = new Map(nodes.filter(Boolean).map((node) => [String(node!._id), node!]));
    const subnetworkMap = new Map(
      subnetworks.filter(Boolean).map((subnetwork) => [String(subnetwork!._id), subnetwork!])
    );

    return sliced.map((output) => ({
      ...output,
      nodeTitle: nodeMap.get(String(output.nodeId))?.title ?? "Node",
      nodeType: normalizeNanoNodeType(nodeMap.get(String(output.nodeId))?.type ?? "unknown"),
      subnetworkTitle: subnetworkMap.get(String(output.subnetworkId))?.title ?? "Subnetwork AI",
    }));
  },
});

export const getLatestForNode = query({
  args: {
    nodeId: v.id("aiNodes"),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError("AI_NODE_NOT_FOUND");

    await requireSubnetworkRead(ctx, node.subnetworkId);

    const latest = await ctx.db
      .query("aiNodeOutputs")
      .withIndex("byNodeVersion", (q) => q.eq("nodeId", node._id))
      .order("desc")
      .first();

    return latest;
  },
});
