import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireSubnetworkRead, requireSubnetworkWrite } from "./aiAccess";

const nowTs = () => Date.now();

const importedNodeValidator = v.object({
  id: v.string(),
  type: v.string(),
  title: v.string(),
  position: v.object({
    x: v.number(),
    y: v.number(),
  }),
  size: v.optional(
    v.object({
      width: v.number(),
      height: v.number(),
    })
  ),
  config: v.optional(v.any()),
  inputs: v.optional(v.array(v.any())),
  outputs: v.optional(v.array(v.any())),
  runPolicy: v.optional(v.any()),
});

const importedEdgeValidator = v.object({
  sourceNodeId: v.string(),
  sourcePort: v.string(),
  targetNodeId: v.string(),
  targetPort: v.string(),
});

type GraphNode = {
  _id: Id<"aiNodes">;
};

type GraphEdge = {
  sourceNodeId: Id<"aiNodes">;
  targetNodeId: Id<"aiNodes">;
};

const getTopologicalValidation = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const ids = nodes.map((node) => String(node._id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    const source = String(edge.sourceNodeId);
    const target = String(edge.targetNodeId);
    if (!adjacency.has(source) || !adjacency.has(target)) {
      continue;
    }
    adjacency.get(source)!.push(target);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, count] of inDegree.entries()) {
    if (count === 0) queue.push(id);
  }

  const visited: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextCount = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  const hasCycle = visited.length !== ids.length;

  return {
    valid: !hasCycle,
    hasCycle,
    visitedCount: visited.length,
    totalCount: ids.length,
    topologicalOrder: visited,
  };
};

const assertNodeTypeSupported = (type: string) => {
  const normalized = type.trim().toLowerCase();
  const allowed = new Set([
    "prompt",
    "image_reference",
    "nano_banana_pro",
    "veo3",
  ]);

  if (!allowed.has(normalized)) {
    throw new ConvexError("AI_NODE_TYPE_UNSUPPORTED");
  }

  return normalized;
};

export const getGraph = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork, role } = await requireSubnetworkRead(ctx, args.subnetworkId);

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    return {
      subnetwork,
      role,
      nodes,
      edges,
      validation: getTopologicalValidation(nodes as GraphNode[], edges as GraphEdge[]),
    };
  },
});

export const createNode = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    type: v.string(),
    title: v.string(),
    position: v.object({
      x: v.number(),
      y: v.number(),
    }),
    size: v.optional(
      v.object({
        width: v.number(),
        height: v.number(),
      })
    ),
    config: v.optional(v.any()),
    inputs: v.optional(v.array(v.any())),
    outputs: v.optional(v.array(v.any())),
    runPolicy: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { subnetwork, user } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    const now = nowTs();
    const nodeId = await ctx.db.insert("aiNodes", {
      subnetworkId: subnetwork._id,
      boardId: subnetwork.boardId,
      ownerId: user._id,
      type: assertNodeTypeSupported(args.type),
      title: args.title.trim() || "Node",
      position: args.position,
      size: args.size,
      config: args.config,
      inputs: args.inputs,
      outputs: args.outputs,
      runPolicy: args.runPolicy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(subnetwork._id, { updatedAt: now });
    return nodeId;
  },
});

export const updateNode = mutation({
  args: {
    nodeId: v.id("aiNodes"),
    title: v.optional(v.string()),
    position: v.optional(
      v.object({
        x: v.number(),
        y: v.number(),
      })
    ),
    size: v.optional(
      v.object({
        width: v.number(),
        height: v.number(),
      })
    ),
    config: v.optional(v.any()),
    inputs: v.optional(v.array(v.any())),
    outputs: v.optional(v.array(v.any())),
    runPolicy: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError("AI_NODE_NOT_FOUND");

    const { subnetwork } = await requireSubnetworkWrite(ctx, node.subnetworkId);

    const patch: any = {
      updatedAt: nowTs(),
    };

    if (typeof args.title === "string") {
      patch.title = args.title.trim() || "Node";
    }
    if (args.position) patch.position = args.position;
    if (args.size) patch.size = args.size;
    if (args.config !== undefined) patch.config = args.config;
    if (args.inputs !== undefined) patch.inputs = args.inputs;
    if (args.outputs !== undefined) patch.outputs = args.outputs;
    if (args.runPolicy !== undefined) patch.runPolicy = args.runPolicy;

    await ctx.db.patch(node._id, patch);
    await ctx.db.patch(subnetwork._id, { updatedAt: nowTs() });

    return node._id;
  },
});

export const deleteNode = mutation({
  args: {
    nodeId: v.id("aiNodes"),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError("AI_NODE_NOT_FOUND");

    const { subnetwork } = await requireSubnetworkWrite(ctx, node.subnetworkId);

    const outgoing = await ctx.db
      .query("aiEdges")
      .withIndex("bySource", (q) => q.eq("sourceNodeId", node._id))
      .collect();
    const incoming = await ctx.db
      .query("aiEdges")
      .withIndex("byTarget", (q) => q.eq("targetNodeId", node._id))
      .collect();

    for (const edge of [...outgoing, ...incoming]) {
      if (edge.subnetworkId === subnetwork._id) {
        await ctx.db.delete(edge._id);
      }
    }

    await ctx.db.delete(node._id);
    await ctx.db.patch(subnetwork._id, { updatedAt: nowTs() });

    return node._id;
  },
});

export const createEdge = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    sourceNodeId: v.id("aiNodes"),
    sourcePort: v.string(),
    targetNodeId: v.id("aiNodes"),
    targetPort: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.sourceNodeId === args.targetNodeId) {
      throw new ConvexError("AI_GRAPH_SELF_EDGE_NOT_ALLOWED");
    }

    const { subnetwork } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    const sourceNode = await ctx.db.get(args.sourceNodeId);
    const targetNode = await ctx.db.get(args.targetNodeId);

    if (!sourceNode || !targetNode) {
      throw new ConvexError("AI_GRAPH_NODE_NOT_FOUND");
    }

    if (
      sourceNode.subnetworkId !== subnetwork._id ||
      targetNode.subnetworkId !== subnetwork._id
    ) {
      throw new ConvexError("AI_GRAPH_NODE_MISMATCH");
    }

    const existingEdge = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetworkSourceTarget", (q) =>
        q
          .eq("subnetworkId", subnetwork._id)
          .eq("sourceNodeId", args.sourceNodeId)
          .eq("targetNodeId", args.targetNodeId)
      )
      .first();

    if (existingEdge && existingEdge.sourcePort === args.sourcePort && existingEdge.targetPort === args.targetPort) {
      return existingEdge._id;
    }

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const withCandidate = [
      ...edges,
      {
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
      },
    ];

    const validation = getTopologicalValidation(nodes as GraphNode[], withCandidate as GraphEdge[]);
    if (!validation.valid) {
      throw new ConvexError("AI_GRAPH_CYCLE_NOT_ALLOWED");
    }

    const now = nowTs();
    const edgeId = await ctx.db.insert("aiEdges", {
      subnetworkId: subnetwork._id,
      boardId: subnetwork.boardId,
      sourceNodeId: args.sourceNodeId,
      sourcePort: args.sourcePort.trim() || "output",
      targetNodeId: args.targetNodeId,
      targetPort: args.targetPort.trim() || "input",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(subnetwork._id, { updatedAt: now });
    return edgeId;
  },
});

export const deleteEdge = mutation({
  args: {
    edgeId: v.id("aiEdges"),
  },
  handler: async (ctx, args) => {
    const edge = await ctx.db.get(args.edgeId);
    if (!edge) throw new ConvexError("AI_EDGE_NOT_FOUND");

    const { subnetwork } = await requireSubnetworkWrite(ctx, edge.subnetworkId);
    await ctx.db.delete(edge._id);
    await ctx.db.patch(subnetwork._id, { updatedAt: nowTs() });

    return edge._id;
  },
});

export const validateDag = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkRead(ctx, args.subnetworkId);

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    return getTopologicalValidation(nodes as GraphNode[], edges as GraphEdge[]);
  },
});

export const replaceGraphFromSnapshot = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    nodes: v.array(importedNodeValidator),
    edges: v.array(importedEdgeValidator),
  },
  handler: async (ctx, args) => {
    const { subnetwork, user } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    if (args.nodes.length > 500) {
      throw new ConvexError("AI_IMPORT_NODE_LIMIT_EXCEEDED");
    }
    if (args.edges.length > 2500) {
      throw new ConvexError("AI_IMPORT_EDGE_LIMIT_EXCEEDED");
    }

    const uniqueNodeIds = new Set<string>();
    for (const node of args.nodes) {
      const importId = node.id.trim();
      if (!importId) {
        throw new ConvexError("AI_IMPORT_NODE_ID_REQUIRED");
      }
      if (uniqueNodeIds.has(importId)) {
        throw new ConvexError("AI_IMPORT_DUPLICATE_NODE_ID");
      }
      uniqueNodeIds.add(importId);
      assertNodeTypeSupported(node.type);
    }

    const normalizedEdges = args.edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId.trim(),
      sourcePort: edge.sourcePort.trim() || "output",
      targetNodeId: edge.targetNodeId.trim(),
      targetPort: edge.targetPort.trim() || "input",
    }));

    for (const edge of normalizedEdges) {
      if (!uniqueNodeIds.has(edge.sourceNodeId) || !uniqueNodeIds.has(edge.targetNodeId)) {
        throw new ConvexError("AI_IMPORT_EDGE_NODE_NOT_FOUND");
      }
      if (edge.sourceNodeId === edge.targetNodeId) {
        throw new ConvexError("AI_GRAPH_SELF_EDGE_NOT_ALLOWED");
      }
    }

    const pseudoNodes = args.nodes.map((node) => ({
      _id: node.id as unknown as Id<"aiNodes">,
    }));
    const pseudoEdges = normalizedEdges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId as unknown as Id<"aiNodes">,
      targetNodeId: edge.targetNodeId as unknown as Id<"aiNodes">,
    }));
    const validation = getTopologicalValidation(pseudoNodes, pseudoEdges);
    if (!validation.valid) {
      throw new ConvexError("AI_GRAPH_CYCLE_NOT_ALLOWED");
    }

    const existingEdges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();
    const existingNodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    for (const edge of existingEdges) {
      await ctx.db.delete(edge._id);
    }
    for (const node of existingNodes) {
      await ctx.db.delete(node._id);
    }

    const now = nowTs();
    const idMap = new Map<string, Id<"aiNodes">>();

    for (const node of args.nodes) {
      const nodeId = await ctx.db.insert("aiNodes", {
        subnetworkId: subnetwork._id,
        boardId: subnetwork.boardId,
        ownerId: user._id,
        type: assertNodeTypeSupported(node.type),
        title: node.title.trim() || "Node",
        position: node.position,
        size: node.size,
        config: node.config,
        inputs: node.inputs,
        outputs: node.outputs,
        runPolicy: node.runPolicy,
        createdAt: now,
        updatedAt: now,
      });
      idMap.set(node.id.trim(), nodeId);
    }

    for (const edge of normalizedEdges) {
      const sourceNodeId = idMap.get(edge.sourceNodeId);
      const targetNodeId = idMap.get(edge.targetNodeId);
      if (!sourceNodeId || !targetNodeId) {
        throw new ConvexError("AI_IMPORT_EDGE_NODE_NOT_FOUND");
      }

      await ctx.db.insert("aiEdges", {
        subnetworkId: subnetwork._id,
        boardId: subnetwork.boardId,
        sourceNodeId,
        sourcePort: edge.sourcePort,
        targetNodeId,
        targetPort: edge.targetPort,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(subnetwork._id, { updatedAt: now });

    return {
      nodeCount: args.nodes.length,
      edgeCount: normalizedEdges.length,
    };
  },
});
