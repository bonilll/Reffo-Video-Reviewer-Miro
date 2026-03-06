import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSubnetworkRead, requireSubnetworkWrite } from "./aiAccess";
import {
  assertNanoBananaConfigCompatible,
  estimateNanoBananaCostUsd,
  NANO_BANANA_CANONICAL_NODE_TYPE,
  NANO_BANANA_LEGACY_NODE_TYPE,
  normalizeNanoBananaConfig,
  normalizeNanoNodeType,
  resolveNanoBananaModelForNode,
} from "./googleImageModelRegistry";

const RUN_STATUS_QUEUED = "queued";
const RUN_STATUS_PROCESSING = "processing";
const RUN_STATUS_DONE = "done";
const RUN_STATUS_FAILED = "failed";
const RUN_STATUS_CANCELED = "canceled";
const NODE_STATUS_BLOCKED = "blocked";

const ESTIMATED_MODEL_COST_USD: Record<string, number> = {
  prompt: 0,
  image_reference: 0,
  [NANO_BANANA_CANONICAL_NODE_TYPE]: 0.12,
  [NANO_BANANA_LEGACY_NODE_TYPE]: 0.12,
  veo3: 0.45,
};

const estimateNodeCost = (nodeType: string) => {
  const normalized = normalizeNanoNodeType(nodeType);
  return ESTIMATED_MODEL_COST_USD[normalized] ?? 0.05;
};

const toMonthKey = (value: Date) => {
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}`;
};

const nowTs = () => Date.now();

const toStableJson = (value: unknown): string => {
  const normalize = (input: any): any => {
    if (Array.isArray(input)) return input.map((item) => normalize(item));
    if (!input || typeof input !== "object") return input;
    return Object.keys(input)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = normalize(input[key]);
        return acc;
      }, {});
  };
  return JSON.stringify(normalize(value));
};

const hashSha256Hex = async (value: string) => {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const extractImageReferences = (config: any) => {
  if (Array.isArray(config?.images)) {
    return config.images
      .filter((image: any) => image && typeof image.url === "string")
      .map((image: any) => ({
        url: String(image.url),
        title: typeof image.title === "string" ? image.title : undefined,
        mimeType: typeof image.mimeType === "string" ? image.mimeType : undefined,
        width: typeof image.width === "number" ? image.width : undefined,
        height: typeof image.height === "number" ? image.height : undefined,
        storageKey: typeof image.storageKey === "string" ? image.storageKey : undefined,
      }));
  }
  if (typeof config?.urlsText === "string") {
    return String(config.urlsText)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }
  return [];
};

type PreparedNodeRunInput = {
  estimatedUsd: number;
  providerModelId?: string;
  executionMode: "interactive" | "batch";
  resolvedConfig?: Record<string, unknown>;
  inputSnapshot?: Record<string, unknown>;
  requestHash?: string;
};

const prepareNodeRunInput = async (
  node: Doc<"aiNodes">,
  allNodes: Array<Doc<"aiNodes">>,
  allEdges: Array<Doc<"aiEdges">>
): Promise<PreparedNodeRunInput> => {
  const normalizedType = normalizeNanoNodeType(node.type);
  const nodeById = new Map(allNodes.map((candidate) => [String(candidate._id), candidate]));

  if (normalizedType !== NANO_BANANA_CANONICAL_NODE_TYPE) {
    return {
      estimatedUsd: estimateNodeCost(normalizedType),
      providerModelId: normalizedType,
      executionMode: "interactive",
    };
  }

  const incoming = allEdges.filter((edge) => String(edge.targetNodeId) === String(node._id));
  const promptEdge = incoming.find((edge) => edge.targetPort === "prompt");
  if (!promptEdge) {
    throw new ConvexError("CONFIG_INVALID_PROMPT_REQUIRED");
  }
  const promptNode = nodeById.get(String(promptEdge.sourceNodeId));
  if (!promptNode || normalizeNanoNodeType(promptNode.type) !== "prompt") {
    throw new ConvexError("CONFIG_INVALID_PROMPT_SOURCE");
  }

  const promptText = String((promptNode.config as any)?.text ?? "").trim();
  if (!promptText) {
    throw new ConvexError("CONFIG_INVALID_PROMPT_EMPTY");
  }

  const referenceEdges = incoming.filter((edge) => edge.targetPort === "references");
  const references = referenceEdges
    .map((edge) => nodeById.get(String(edge.sourceNodeId)))
    .filter(Boolean)
    .filter((sourceNode) => normalizeNanoNodeType(sourceNode!.type) === "image_reference")
    .flatMap((sourceNode) => extractImageReferences(sourceNode!.config));

  const dedup = new Map<string, (typeof references)[number]>();
  for (const item of references) {
    const key = item.storageKey || item.url;
    if (!dedup.has(key)) dedup.set(key, item);
  }
  const normalizedReferences = Array.from(dedup.values());

  const { config } = normalizeNanoBananaConfig(node.config);
  assertNanoBananaConfigCompatible(config, normalizedReferences.length);

  const estimatedUsd = estimateNanoBananaCostUsd({
    modelId: config.modelId,
    runMode: config.runMode,
    imageSize: config.imageSize,
    referencesCount: normalizedReferences.length,
    expectedImagesCount: 1,
  });

  const inputSnapshot = {
    prompt: promptText,
    references: normalizedReferences,
    referencesCount: normalizedReferences.length,
  };

  const resolvedConfig = {
    modelId: config.modelId,
    runMode: config.runMode,
    responseMode: config.responseMode,
    imageSize: config.imageSize,
    aspectRatio: config.aspectRatio,
    enableSearchGrounding: config.enableSearchGrounding,
  };

  const requestHash = await hashSha256Hex(
    toStableJson({
      inputSnapshot,
      resolvedConfig,
    })
  );

  return {
    estimatedUsd,
    providerModelId: config.modelId,
    executionMode: config.runMode,
    resolvedConfig,
    inputSnapshot,
    requestHash,
  };
};

const ensureNoActiveNodeRun = async (ctx: any, nodeId: Id<"aiNodes">) => {
  const queued = await ctx.db
    .query("aiNodeRuns")
    .withIndex("byNodeStatus", (q: any) => q.eq("nodeId", nodeId).eq("status", RUN_STATUS_QUEUED))
    .first();
  if (queued) {
    // Best effort self-healing in case a queued run is waiting for a runner.
    await ctx.scheduler.runAfter(0, (internal as any)["internal/aiRunner"].pumpQueue, {});
    throw new ConvexError("AI_NODE_BUSY");
  }

  const processing = await ctx.db
    .query("aiNodeRuns")
    .withIndex("byNodeStatus", (q: any) => q.eq("nodeId", nodeId).eq("status", RUN_STATUS_PROCESSING))
    .first();
  if (processing) {
    // Keep nudging the runner so stale processing locks can settle.
    await ctx.scheduler.runAfter(0, (internal as any)["internal/aiRunner"].pumpQueue, {});
    throw new ConvexError("AI_NODE_BUSY");
  }
};

const resolveLauncherKey = async (ctx: any, userId: Id<"users">) => {
  const now = nowTs();

  const session = await ctx.db
    .query("aiProviderKeySessions")
    .withIndex("byUserProviderStatus", (q: any) =>
      q.eq("userId", userId).eq("provider", "google").eq("status", "active")
    )
    .order("desc")
    .first();

  if (session && session.expiresAt > now) {
    return {
      mode: "session" as const,
      keyId: String(session._id),
    };
  }

  const persistent = await ctx.db
    .query("aiProviderKeys")
    .withIndex("byUserProviderStatus", (q: any) =>
      q.eq("userId", userId).eq("provider", "google").eq("status", "active")
    )
    .order("desc")
    .first();

  if (persistent) {
    return {
      mode: "persistent" as const,
      keyId: String(persistent._id),
    };
  }

  throw new ConvexError("AI_KEY_REQUIRED");
};

const markKeyUsed = async (
  ctx: any,
  userId: Id<"users">,
  keyRef: { mode: "session" | "persistent"; keyId: string }
) => {
  const now = nowTs();

  if (keyRef.mode === "session") {
    const key = await ctx.db.get(keyRef.keyId as Id<"aiProviderKeySessions">);
    if (!key || key.userId !== userId) return;
    await ctx.db.patch(key._id, {
      lastUsedAt: now,
      usageCount: (key.usageCount ?? 0) + 1,
      updatedAt: now,
    });
    return;
  }

  const key = await ctx.db.get(keyRef.keyId as Id<"aiProviderKeys">);
  if (!key || key.userId !== userId) return;
  await ctx.db.patch(key._id, {
    lastUsedAt: now,
    usageCount: (key.usageCount ?? 0) + 1,
    updatedAt: now,
  });
};

const resolveWorkflowKeyMaterial = async (ctx: any, workflowRun: Doc<"aiWorkflowRuns">) => {
  const mode = workflowRun.keyRefType;
  const keyRefId = workflowRun.keyRefId;
  const launcherId = workflowRun.launchedBy;
  const now = nowTs();

  if (!mode || !keyRefId) {
    return null;
  }

  if (mode === "session") {
    const key = await ctx.db.get(keyRefId as Id<"aiProviderKeySessions">);
    if (!key) return null;
    if (key.userId !== launcherId) return null;
    if (key.provider !== "google") return null;
    if (key.status !== "active") return null;
    if (key.expiresAt <= now) return null;
    return {
      mode: "session" as const,
      keyId: String(key._id),
      ciphertext: key.ciphertext,
      wrappedDek: key.wrappedDek,
      kmsKeyVersion: key.kmsKeyVersion,
      fingerprint: key.fingerprint,
      last4: key.last4,
    };
  }

  if (mode === "persistent") {
    const key = await ctx.db.get(keyRefId as Id<"aiProviderKeys">);
    if (!key) return null;
    if (key.userId !== launcherId) return null;
    if (key.provider !== "google") return null;
    if (key.status !== "active") return null;
    return {
      mode: "persistent" as const,
      keyId: String(key._id),
      ciphertext: key.ciphertext,
      wrappedDek: key.wrappedDek,
      kmsKeyVersion: key.kmsKeyVersion,
      fingerprint: key.fingerprint,
      last4: key.last4,
    };
  }

  return null;
};

const buildGraphInfo = (
  nodes: Array<Doc<"aiNodes">>,
  edges: Array<Doc<"aiEdges">>
) => {
  const nodeIds = nodes.map((node) => String(node._id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    const source = String(edge.sourceNodeId);
    const target = String(edge.targetNodeId);
    if (!inDegree.has(source) || !inDegree.has(target)) continue;
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    adjacency.get(source)!.push(target);
  }

  const queue: string[] = [];
  for (const [id, count] of inDegree.entries()) {
    if (count === 0) queue.push(id);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextCount = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  return {
    hasCycle: ordered.length !== nodeIds.length,
    inDegree,
    ordered,
  };
};

const insertEstimatedLedger = async (
  ctx: any,
  userId: Id<"users">,
  boardId: Id<"boards">,
  subnetworkId: Id<"aiSubnetworks">,
  workflowRunId: Id<"aiWorkflowRuns">,
  nodeRunId: Id<"aiNodeRuns">,
  amountUsd: number,
  model: string
) => {
  await ctx.db.insert("aiCostLedger", {
    userId,
    boardId,
    subnetworkId,
    workflowRunId,
    nodeRunId,
    provider: "google",
    model,
    metric: "estimated",
    amountUsd,
    currency: "USD",
    monthKey: toMonthKey(new Date()),
    createdAt: nowTs(),
  });
};

export const launchNode = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    nodeId: v.id("aiNodes"),
  },
  handler: async (ctx, args) => {
    const { subnetwork, user } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    const node = await ctx.db.get(args.nodeId);
    if (!node || node.subnetworkId !== subnetwork._id) {
      throw new ConvexError("AI_NODE_NOT_FOUND");
    }

    await ensureNoActiveNodeRun(ctx, node._id);

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();
    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const prepared = await prepareNodeRunInput(node, nodes, edges);

    const keyRef = await resolveLauncherKey(ctx, user._id);
    await markKeyUsed(ctx, user._id, keyRef);

    const now = nowTs();
    const estimatedUsd = prepared.estimatedUsd;

    const workflowRunId = await ctx.db.insert("aiWorkflowRuns", {
      subnetworkId: subnetwork._id,
      boardId: subnetwork.boardId,
      launchedBy: user._id,
      runType: "node",
      triggerNodeId: node._id,
      status: RUN_STATUS_QUEUED,
      keyRefType: keyRef.mode,
      keyRefId: keyRef.keyId,
      estimatedUsd,
      nodeCount: 1,
      completedNodeCount: 0,
      failedNodeCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const nodeRunId = await ctx.db.insert("aiNodeRuns", {
      workflowRunId,
      subnetworkId: subnetwork._id,
      boardId: subnetwork.boardId,
      nodeId: node._id,
      launchedBy: user._id,
      status: RUN_STATUS_QUEUED,
      attempts: 0,
      maxAttempts: 1,
      estimatedUsd,
      providerModelId: prepared.providerModelId,
      executionMode: prepared.executionMode,
      resolvedConfig: prepared.resolvedConfig,
      inputSnapshot: prepared.inputSnapshot,
      requestHash: prepared.requestHash,
      providerJobState: prepared.executionMode === "batch" ? "queued" : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await insertEstimatedLedger(
      ctx,
      user._id,
      subnetwork.boardId,
      subnetwork._id,
      workflowRunId,
      nodeRunId,
      estimatedUsd,
      prepared.providerModelId ?? resolveNanoBananaModelForNode(node.type, node.config) ?? node.type
    );

    await ctx.db.patch(subnetwork._id, { updatedAt: now });

    await ctx.scheduler.runAfter(0, (internal as any)["internal/aiRunner"].pumpQueue, {});

    return {
      workflowRunId,
      nodeRunId,
      estimatedUsd,
    };
  },
});

export const launchWorkflow = mutation({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
  },
  handler: async (ctx, args) => {
    const { subnetwork, user } = await requireSubnetworkWrite(ctx, args.subnetworkId);

    const nodes = await ctx.db
      .query("aiNodes")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    if (nodes.length === 0) {
      throw new ConvexError("AI_WORKFLOW_EMPTY");
    }

    for (const node of nodes) {
      await ensureNoActiveNodeRun(ctx, node._id);
    }

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const graph = buildGraphInfo(nodes, edges);
    if (graph.hasCycle) {
      throw new ConvexError("AI_GRAPH_CYCLE_NOT_ALLOWED");
    }

    const keyRef = await resolveLauncherKey(ctx, user._id);
    await markKeyUsed(ctx, user._id, keyRef);

    const now = nowTs();

    const preparedByNodeId = new Map<
      string,
      {
        estimatedUsd: number;
        providerModelId?: string;
        executionMode: "interactive" | "batch";
        resolvedConfig?: Record<string, unknown>;
        inputSnapshot?: Record<string, unknown>;
        requestHash?: string;
      }
    >();

    for (const node of nodes) {
      const prepared = await prepareNodeRunInput(node, nodes, edges);
      preparedByNodeId.set(String(node._id), prepared);
    }

    const estimatedUsd = Array.from(preparedByNodeId.values()).reduce(
      (acc, prepared) => acc + prepared.estimatedUsd,
      0
    );

    const workflowRunId = await ctx.db.insert("aiWorkflowRuns", {
      subnetworkId: subnetwork._id,
      boardId: subnetwork.boardId,
      launchedBy: user._id,
      runType: "workflow",
      status: RUN_STATUS_QUEUED,
      keyRefType: keyRef.mode,
      keyRefId: keyRef.keyId,
      estimatedUsd,
      nodeCount: nodes.length,
      completedNodeCount: 0,
      failedNodeCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const nodeIdMap = new Map(nodes.map((node) => [String(node._id), node]));

    const nodeRunIds: Array<Id<"aiNodeRuns">> = [];

    for (const node of nodes) {
      const inDegree = graph.inDegree.get(String(node._id)) ?? 0;
      const nodeStatus = inDegree === 0 ? RUN_STATUS_QUEUED : NODE_STATUS_BLOCKED;
      const prepared = preparedByNodeId.get(String(node._id));
      const estimatedNodeUsd = prepared?.estimatedUsd ?? estimateNodeCost(node.type);

      const nodeRunId = await ctx.db.insert("aiNodeRuns", {
        workflowRunId,
        subnetworkId: subnetwork._id,
        boardId: subnetwork.boardId,
        nodeId: node._id,
        launchedBy: user._id,
        status: nodeStatus,
        attempts: 0,
        maxAttempts: 1,
        estimatedUsd: estimatedNodeUsd,
        providerModelId: prepared?.providerModelId,
        executionMode: prepared?.executionMode,
        resolvedConfig: prepared?.resolvedConfig,
        inputSnapshot: prepared?.inputSnapshot,
        requestHash: prepared?.requestHash,
        providerJobState: prepared?.executionMode === "batch" ? "queued" : undefined,
        createdAt: now,
        updatedAt: now,
      });
      nodeRunIds.push(nodeRunId);

      await insertEstimatedLedger(
        ctx,
        user._id,
        subnetwork.boardId,
        subnetwork._id,
        workflowRunId,
        nodeRunId,
        estimatedNodeUsd,
        prepared?.providerModelId ??
          resolveNanoBananaModelForNode(nodeIdMap.get(String(node._id))?.type ?? node.type, node.config) ??
          (nodeIdMap.get(String(node._id))?.type ?? node.type)
      );
    }

    await ctx.db.patch(subnetwork._id, { updatedAt: now });

    await ctx.scheduler.runAfter(0, (internal as any)["internal/aiRunner"].pumpQueue, {});

    return {
      workflowRunId,
      nodeRunIds,
      estimatedUsd,
    };
  },
});

export const listWorkflowRuns = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkRead(ctx, args.subnetworkId);

    const list = await ctx.db
      .query("aiWorkflowRuns")
      .withIndex("bySubnetworkCreatedAt", (q) => q.eq("subnetworkId", subnetwork._id))
      .order("desc")
      .collect();

    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    return list.slice(0, limit);
  },
});

export const listNodeRunsForSubnetwork = query({
  args: {
    subnetworkId: v.id("aiSubnetworks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { subnetwork } = await requireSubnetworkRead(ctx, args.subnetworkId);

    const runs = await ctx.db
      .query("aiNodeRuns")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", subnetwork._id))
      .collect();

    const sorted = runs.sort((a, b) => b.createdAt - a.createdAt);
    const limit = Math.max(1, Math.min(args.limit ?? 200, 1000));
    const sliced = sorted.slice(0, limit);

    const nodeIds = Array.from(new Set(sliced.map((run) => run.nodeId)));
    const nodes = await Promise.all(nodeIds.map((nodeId) => ctx.db.get(nodeId)));
    const nodeMap = new Map(nodes.filter(Boolean).map((node) => [String(node!._id), node!]));

    return sliced.map((run) => ({
      ...run,
      nodeTitle: nodeMap.get(String(run.nodeId))?.title ?? "Node",
      nodeType: normalizeNanoNodeType(nodeMap.get(String(run.nodeId))?.type ?? "unknown"),
      providerModelId:
        run.providerModelId ??
        resolveNanoBananaModelForNode(
          nodeMap.get(String(run.nodeId))?.type ?? "",
          nodeMap.get(String(run.nodeId))?.config
        ) ??
        normalizeNanoNodeType(nodeMap.get(String(run.nodeId))?.type ?? "unknown"),
    }));
  },
});

export const getWorkflowRun = query({
  args: {
    workflowRunId: v.id("aiWorkflowRuns"),
  },
  handler: async (ctx, args) => {
    const workflowRun = await ctx.db.get(args.workflowRunId);
    if (!workflowRun) return null;

    await requireSubnetworkRead(ctx, workflowRun.subnetworkId);

    const nodeRuns = await ctx.db
      .query("aiNodeRuns")
      .withIndex("byWorkflowRun", (q) => q.eq("workflowRunId", workflowRun._id))
      .collect();

    return {
      workflowRun,
      nodeRuns,
    };
  },
});

export const claimNodeRun = internalMutation({
  args: {
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db
      .query("aiNodeRuns")
      .withIndex("byStatusUpdatedAt", (q) => q.eq("status", RUN_STATUS_QUEUED))
      .order("asc")
      .first();

    if (!candidate) return null;

    const now = nowTs();

    const processingForNode = await ctx.db
      .query("aiNodeRuns")
      .withIndex("byNodeStatus", (q) => q.eq("nodeId", candidate.nodeId).eq("status", RUN_STATUS_PROCESSING))
      .first();

    if (processingForNode) {
      return null;
    }

    const workflowRun = await ctx.db.get(candidate.workflowRunId);
    if (!workflowRun) {
      await ctx.db.patch(candidate._id, {
        status: RUN_STATUS_FAILED,
        error: "WORKFLOW_RUN_NOT_FOUND",
        failedAt: now,
        updatedAt: now,
      });
      return null;
    }

    if (workflowRun.status === RUN_STATUS_FAILED || workflowRun.status === RUN_STATUS_CANCELED) {
      await ctx.db.patch(candidate._id, {
        status: RUN_STATUS_CANCELED,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(candidate._id, {
      status: RUN_STATUS_PROCESSING,
      lockOwner: args.workerId,
      lockedAt: now,
      startedAt: candidate.startedAt ?? now,
      attempts: (candidate.attempts ?? 0) + 1,
      updatedAt: now,
    });

    await ctx.db.patch(workflowRun._id, {
      status: RUN_STATUS_PROCESSING,
      startedAt: workflowRun.startedAt ?? now,
      updatedAt: now,
    });

    const node = await ctx.db.get(candidate.nodeId);
    const subnetwork = await ctx.db.get(candidate.subnetworkId);

    const normalizedNodeType = node ? normalizeNanoNodeType(node.type) : "unknown";
    const resolvedConfig =
      candidate.resolvedConfig ??
      (node && normalizedNodeType === NANO_BANANA_CANONICAL_NODE_TYPE
        ? normalizeNanoBananaConfig(node.config).config
        : undefined);
    const providerModelId =
      candidate.providerModelId ??
      (node ? resolveNanoBananaModelForNode(node.type, node.config) ?? normalizedNodeType : undefined);
    const executionMode =
      candidate.executionMode ??
      (resolvedConfig && typeof (resolvedConfig as any).runMode === "string"
        ? ((resolvedConfig as any).runMode as "interactive" | "batch")
        : "interactive");
    const keyMaterial = await resolveWorkflowKeyMaterial(ctx, workflowRun);

    return {
      nodeRun: {
        ...candidate,
        status: RUN_STATUS_PROCESSING,
        lockOwner: args.workerId,
        lockedAt: now,
        startedAt: candidate.startedAt ?? now,
      },
      execution: {
        nodeType: normalizedNodeType,
        providerModelId,
        executionMode,
        resolvedConfig,
        inputSnapshot: candidate.inputSnapshot ?? undefined,
      },
      workflowRun,
      node,
      subnetwork,
      keyMaterial,
    };
  },
});

export const heartbeatNodeRun = internalMutation({
  args: {
    nodeRunId: v.id("aiNodeRuns"),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const nodeRun = await ctx.db.get(args.nodeRunId);
    if (!nodeRun) throw new ConvexError("AI_NODE_RUN_NOT_FOUND");
    if (nodeRun.lockOwner !== args.workerId) {
      throw new ConvexError("AI_NODE_RUN_LOCK_MISMATCH");
    }

    const now = nowTs();
    await ctx.db.patch(nodeRun._id, {
      lockedAt: now,
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const updateProcessingNodeRunProviderState = internalMutation({
  args: {
    nodeRunId: v.id("aiNodeRuns"),
    workerId: v.string(),
    providerRequestId: v.optional(v.string()),
    providerJobId: v.optional(v.string()),
    providerJobState: v.optional(v.string()),
    resolvedConfig: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const nodeRun = await ctx.db.get(args.nodeRunId);
    if (!nodeRun) throw new ConvexError("AI_NODE_RUN_NOT_FOUND");
    if (nodeRun.lockOwner !== args.workerId) {
      throw new ConvexError("AI_NODE_RUN_LOCK_MISMATCH");
    }
    if (nodeRun.status !== RUN_STATUS_PROCESSING) {
      throw new ConvexError("AI_NODE_RUN_NOT_PROCESSING");
    }

    await ctx.db.patch(nodeRun._id, {
      providerRequestId: args.providerRequestId ?? nodeRun.providerRequestId,
      providerJobId: args.providerJobId ?? nodeRun.providerJobId,
      providerJobState: args.providerJobState ?? nodeRun.providerJobState,
      resolvedConfig: args.resolvedConfig ?? nodeRun.resolvedConfig,
      updatedAt: nowTs(),
    });

    return { ok: true };
  },
});

export const getProcessingNodeRunForWorker = internalQuery({
  args: {
    nodeRunId: v.id("aiNodeRuns"),
  },
  handler: async (ctx, args) => {
    const nodeRun = await ctx.db.get(args.nodeRunId);
    if (!nodeRun) return null;

    const workflowRun = await ctx.db.get(nodeRun.workflowRunId);
    if (!workflowRun) return null;

    const node = await ctx.db.get(nodeRun.nodeId);
    const subnetwork = await ctx.db.get(nodeRun.subnetworkId);

    const normalizedNodeType = node ? normalizeNanoNodeType(node.type) : "unknown";
    const resolvedConfig =
      nodeRun.resolvedConfig ??
      (node && normalizedNodeType === NANO_BANANA_CANONICAL_NODE_TYPE
        ? normalizeNanoBananaConfig(node.config).config
        : undefined);
    const providerModelId =
      nodeRun.providerModelId ??
      (node ? resolveNanoBananaModelForNode(node.type, node.config) ?? normalizedNodeType : undefined);
    const executionMode =
      nodeRun.executionMode ??
      (resolvedConfig && typeof (resolvedConfig as any).runMode === "string"
        ? ((resolvedConfig as any).runMode as "interactive" | "batch")
        : "interactive");
    const keyMaterial = await resolveWorkflowKeyMaterial(ctx, workflowRun);

    return {
      nodeRun,
      execution: {
        nodeType: normalizedNodeType,
        providerModelId,
        executionMode,
        resolvedConfig,
        inputSnapshot: nodeRun.inputSnapshot ?? undefined,
      },
      workflowRun,
      node,
      subnetwork,
      keyMaterial,
    };
  },
});

export const completeNodeRun = internalMutation({
  args: {
    nodeRunId: v.id("aiNodeRuns"),
    workerId: v.string(),
    actualUsd: v.optional(v.number()),
    providerRequestId: v.optional(v.string()),
    providerJobId: v.optional(v.string()),
    providerJobState: v.optional(v.string()),
    resolvedConfig: v.optional(v.any()),
    outputs: v.optional(
      v.array(
        v.object({
          outputType: v.string(),
          title: v.optional(v.string()),
          storageKey: v.optional(v.string()),
          publicUrl: v.optional(v.string()),
          mimeType: v.optional(v.string()),
          byteSize: v.optional(v.number()),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
          durationSeconds: v.optional(v.number()),
          metadata: v.optional(v.any()),
        })
      )
    ),
    outputSummary: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const nodeRun = await ctx.db.get(args.nodeRunId);
    if (!nodeRun) throw new ConvexError("AI_NODE_RUN_NOT_FOUND");
    if (nodeRun.lockOwner !== args.workerId) {
      throw new ConvexError("AI_NODE_RUN_LOCK_MISMATCH");
    }

    const now = nowTs();

    await ctx.db.patch(nodeRun._id, {
      status: RUN_STATUS_DONE,
      lockOwner: undefined,
      lockedAt: undefined,
      completedAt: now,
      actualUsd: args.actualUsd ?? nodeRun.estimatedUsd,
      providerRequestId: args.providerRequestId,
      providerJobId: args.providerJobId ?? nodeRun.providerJobId,
      providerJobState: args.providerJobState ?? (nodeRun.executionMode === "batch" ? "succeeded" : "done"),
      resolvedConfig: args.resolvedConfig ?? nodeRun.resolvedConfig,
      outputSummary: args.outputSummary,
      updatedAt: now,
    });

    const workflowRun = await ctx.db.get(nodeRun.workflowRunId);
    if (!workflowRun) {
      throw new ConvexError("AI_WORKFLOW_RUN_NOT_FOUND");
    }

    const node = await ctx.db.get(nodeRun.nodeId);
    if (!node) {
      throw new ConvexError("AI_NODE_NOT_FOUND");
    }

    const outputs = args.outputs ?? [];
    if (outputs.length > 0) {
      const latest = await ctx.db
        .query("aiNodeOutputs")
        .withIndex("byNodeVersion", (q) => q.eq("nodeId", node._id))
        .order("desc")
        .first();

      let version = (latest?.version ?? 0) + 1;
      for (const output of outputs) {
        await ctx.db.insert("aiNodeOutputs", {
          subnetworkId: nodeRun.subnetworkId,
          boardId: nodeRun.boardId,
          nodeId: node._id,
          workflowRunId: workflowRun._id,
          nodeRunId: nodeRun._id,
          version,
          outputType: output.outputType,
          title: output.title,
          storageKey: output.storageKey,
          publicUrl: output.publicUrl,
          mimeType: output.mimeType,
          byteSize: output.byteSize,
          width: output.width,
          height: output.height,
          durationSeconds: output.durationSeconds,
          metadata: output.metadata,
          pinned: false,
          createdBy: nodeRun.launchedBy,
          createdAt: now,
          updatedAt: now,
        });
        version += 1;
      }
    }

    await ctx.db.insert("aiCostLedger", {
      userId: nodeRun.launchedBy,
      boardId: nodeRun.boardId,
      subnetworkId: nodeRun.subnetworkId,
      workflowRunId: workflowRun._id,
      nodeRunId: nodeRun._id,
      provider: "google",
      model:
        nodeRun.providerModelId ??
        resolveNanoBananaModelForNode(node.type, node.config) ??
        normalizeNanoNodeType(node.type),
      metric: "actual",
      amountUsd: args.actualUsd ?? nodeRun.estimatedUsd ?? 0,
      currency: "USD",
      monthKey: toMonthKey(new Date()),
      createdAt: now,
    });

    await ctx.runMutation((internal as any)["internal/aiOrchestrator"].onNodeRunSettled, {
      workflowRunId: workflowRun._id,
      subnetworkId: nodeRun.subnetworkId,
      nodeId: nodeRun.nodeId,
      nodeRunId: nodeRun._id,
      success: true,
    });

    return { ok: true };
  },
});

export const failNodeRun = internalMutation({
  args: {
    nodeRunId: v.id("aiNodeRuns"),
    workerId: v.string(),
    error: v.string(),
    providerJobId: v.optional(v.string()),
    providerJobState: v.optional(v.string()),
    providerErrorCode: v.optional(v.string()),
    providerErrorMessage: v.optional(v.string()),
    validationError: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nodeRun = await ctx.db.get(args.nodeRunId);
    if (!nodeRun) throw new ConvexError("AI_NODE_RUN_NOT_FOUND");
    if (nodeRun.lockOwner !== args.workerId) {
      throw new ConvexError("AI_NODE_RUN_LOCK_MISMATCH");
    }

    const now = nowTs();
    await ctx.db.patch(nodeRun._id, {
      status: RUN_STATUS_FAILED,
      lockOwner: undefined,
      lockedAt: undefined,
      failedAt: now,
      error: args.error,
      providerJobId: args.providerJobId ?? nodeRun.providerJobId,
      providerJobState: args.providerJobState ?? (nodeRun.executionMode === "batch" ? "failed" : "failed"),
      providerErrorCode: args.providerErrorCode,
      providerErrorMessage: args.providerErrorMessage,
      validationError: args.validationError,
      providerRequestId: args.providerRequestId,
      updatedAt: now,
    });

    await ctx.runMutation((internal as any)["internal/aiOrchestrator"].onNodeRunSettled, {
      workflowRunId: nodeRun.workflowRunId,
      subnetworkId: nodeRun.subnetworkId,
      nodeId: nodeRun.nodeId,
      nodeRunId: nodeRun._id,
      success: false,
    });

    return { ok: true };
  },
});
