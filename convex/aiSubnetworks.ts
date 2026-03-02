import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireBoardRead, requireBoardWrite, requireSubnetworkRead, requireSubnetworkWrite } from "./aiAccess";

const normalizeTitle = (value?: string | null) => {
  const title = (value ?? "").trim();
  return title.length > 0 ? title : "Subnetwork AI";
};

const normalizeDescription = (value?: string | null) => {
  const description = (value ?? "").trim();
  return description.length > 0 ? description : undefined;
};

export const listByBoard = query({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    await requireBoardRead(ctx, args.boardId);

    const subnetworks = await ctx.db
      .query("aiSubnetworks")
      .withIndex("byBoardUpdatedAt", (q) => q.eq("boardId", args.boardId))
      .order("desc")
      .collect();

    return subnetworks.filter((subnetwork) => !subnetwork.isArchived);
  },
});

export const get = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork, role } = await requireSubnetworkRead(ctx, args.subnetworkId);

    return {
      ...subnetwork,
      role,
    };
  },
});

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireBoardWrite(ctx, args.boardId);

    const title = normalizeTitle(args.title);
    if (title.length > 120) {
      throw new ConvexError("AI_SUBNETWORK_TITLE_TOO_LONG");
    }

    const now = Date.now();
    const subnetworkId = await ctx.db.insert("aiSubnetworks", {
      boardId: args.boardId,
      ownerId: user._id,
      title,
      description: normalizeDescription(args.description),
      icon: args.icon,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    return subnetworkId;
  },
});

export const update = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    const patch: any = {
      updatedAt: Date.now(),
    };

    if (typeof args.title === "string") {
      const title = normalizeTitle(args.title);
      if (title.length > 120) {
        throw new ConvexError("AI_SUBNETWORK_TITLE_TOO_LONG");
      }
      patch.title = title;
    }

    if (typeof args.description === "string") {
      patch.description = normalizeDescription(args.description);
    }

    if (typeof args.icon === "string") {
      patch.icon = args.icon;
    }

    if (typeof args.isArchived === "boolean") {
      patch.isArchived = args.isArchived;
    }

    await ctx.db.patch(subnetwork._id, patch);

    return subnetwork._id;
  },
});

export const remove = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const workflowRuns = await ctx.db
      .query("aiWorkflowRuns")
      .withIndex("bySubnetworkCreatedAt", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const nodeRuns = await ctx.db
      .query("aiNodeRuns")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const outputs = await ctx.db
      .query("aiNodeOutputs")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const ledgers = await ctx.db
      .query("aiCostLedger")
      .withIndex("bySubnetworkCreatedAt", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    for (const edge of edges) {
      await ctx.db.delete(edge._id);
    }
    for (const output of outputs) {
      await ctx.db.delete(output._id);
    }
    for (const nodeRun of nodeRuns) {
      await ctx.db.delete(nodeRun._id);
    }
    for (const workflowRun of workflowRuns) {
      await ctx.db.delete(workflowRun._id);
    }
    for (const ledger of ledgers) {
      await ctx.db.delete(ledger._id);
    }
    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    await ctx.db.delete(subnetwork._id);

    return subnetwork._id;
  },
});

export const getByBoardAndId = query({
  args: {
    boardId: v.id("boards"),
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { role } = await requireBoardRead(ctx, args.boardId);
    const subnetwork = await ctx.db.get(args.subnetworkId);
    if (!subnetwork || subnetwork.boardId !== args.boardId || subnetwork.isArchived) {
      return null;
    }
    return {
      ...subnetwork,
      role,
    };
  },
});

export const existsForBoard = query({
  args: {
    boardId: v.id("boards"),
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    await requireBoardRead(ctx, args.boardId);
    const subnetwork = await ctx.db.get(args.subnetworkId);
    return Boolean(subnetwork && subnetwork.boardId === args.boardId && !subnetwork.isArchived);
  },
});

export const getSubnetworkPermissions = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const subnetwork = await ctx.db.get(args.subnetworkId);
    if (!subnetwork || subnetwork.isArchived) {
      return {
        resourceExists: false,
        canRead: false,
        canWrite: false,
        userRole: null as null | "owner" | "editor" | "viewer",
        boardId: null as Id<"boards"> | null,
      };
    }

    const { role } = await requireSubnetworkRead(ctx, subnetwork._id);
    const canWrite = role === "owner" || role === "editor";
    const canRead = canWrite;

    return {
      resourceExists: true,
      canRead,
      canWrite,
      userRole: role,
      boardId: subnetwork.boardId,
    };
  },
});

export const touch = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkWrite(ctx, args.subnetworkId);
    await ctx.db.patch(subnetwork._id, { updatedAt: Date.now() });
    return subnetwork._id;
  },
});

export const moveToBoard = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkWrite(ctx, args.subnetworkId);
    await requireBoardWrite(ctx, args.boardId);

    if (subnetwork.boardId === args.boardId) {
      return subnetwork._id;
    }

    const now = Date.now();
    await ctx.db.patch(subnetwork._id, {
      boardId: args.boardId,
      updatedAt: now,
    });

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    for (const node of nodes) {
      await ctx.db.patch(node._id, { boardId: args.boardId, updatedAt: now });
    }

    for (const edge of edges) {
      await ctx.db.patch(edge._id, { boardId: args.boardId, updatedAt: now });
    }

    return subnetwork._id;
  },
});
