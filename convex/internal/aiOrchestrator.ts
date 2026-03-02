import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

const RUN_STATUS_QUEUED = "queued";
const RUN_STATUS_PROCESSING = "processing";
const RUN_STATUS_DONE = "done";
const RUN_STATUS_FAILED = "failed";
const RUN_STATUS_CANCELED = "canceled";
const NODE_STATUS_BLOCKED = "blocked";

const nowTs = () => Date.now();

const countByStatus = (nodeRuns: Array<Doc<"aiNodeRuns">>) => {
  let done = 0;
  let failed = 0;
  let queued = 0;
  let processing = 0;
  let blocked = 0;

  for (const run of nodeRuns) {
    if (run.status === RUN_STATUS_DONE) done += 1;
    else if (run.status === RUN_STATUS_FAILED) failed += 1;
    else if (run.status === RUN_STATUS_QUEUED) queued += 1;
    else if (run.status === RUN_STATUS_PROCESSING) processing += 1;
    else if (run.status === NODE_STATUS_BLOCKED) blocked += 1;
  }

  return { done, failed, queued, processing, blocked };
};

export const onNodeRunSettled = internalMutation({
  args: {
    workflowRunId: v.id("aiWorkflowRuns"),
    subnetworkId: v.id("aiSubnetworks"),
    nodeId: v.id("aiNodes"),
    nodeRunId: v.id("aiNodeRuns"),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const workflowRun = await ctx.db.get(args.workflowRunId);
    if (!workflowRun) {
      throw new ConvexError("AI_WORKFLOW_RUN_NOT_FOUND");
    }

    const nodeRuns = await ctx.db
      .query("aiNodeRuns")
      .withIndex("byWorkflowRun", (q) => q.eq("workflowRunId", workflowRun._id))
      .collect();

    const now = nowTs();

    if (workflowRun.runType === "node") {
      if (args.success) {
        await ctx.db.patch(workflowRun._id, {
          status: RUN_STATUS_DONE,
          completedAt: now,
          completedNodeCount: 1,
          failedNodeCount: 0,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(workflowRun._id, {
          status: RUN_STATUS_FAILED,
          failedAt: now,
          completedNodeCount: 0,
          failedNodeCount: 1,
          updatedAt: now,
        });
      }
      return { ok: true };
    }

    if (!args.success) {
      for (const nodeRun of nodeRuns) {
        if (nodeRun.status === RUN_STATUS_QUEUED || nodeRun.status === NODE_STATUS_BLOCKED) {
          await ctx.db.patch(nodeRun._id, {
            status: RUN_STATUS_CANCELED,
            updatedAt: now,
          });
        }
      }

      const counts = countByStatus(
        nodeRuns.map((run) =>
          run._id === args.nodeRunId
            ? ({ ...run, status: RUN_STATUS_FAILED } as Doc<"aiNodeRuns">)
            : run
        )
      );

      await ctx.db.patch(workflowRun._id, {
        status: RUN_STATUS_FAILED,
        failedAt: now,
        completedNodeCount: counts.done,
        failedNodeCount: counts.failed,
        updatedAt: now,
      });

      return { ok: true, failed: true };
    }

    const edges = await ctx.db
      .query("aiEdges")
      .withIndex("bySubnetwork", (q) => q.eq("subnetworkId", args.subnetworkId))
      .collect();

    const nodeRunByNodeId = new Map<string, Doc<"aiNodeRuns">>();
    for (const nodeRun of nodeRuns) {
      nodeRunByNodeId.set(String(nodeRun.nodeId), nodeRun);
    }

    const queuedNodeIds = new Set<string>();

    for (const nodeRun of nodeRuns) {
      if (nodeRun.status !== NODE_STATUS_BLOCKED) continue;

      const incoming = edges.filter((edge) => edge.targetNodeId === nodeRun.nodeId);
      if (incoming.length === 0) {
        queuedNodeIds.add(String(nodeRun.nodeId));
        continue;
      }

      const allDone = incoming.every((edge) => {
        const upstream = nodeRunByNodeId.get(String(edge.sourceNodeId));
        return upstream?.status === RUN_STATUS_DONE;
      });

      if (allDone) {
        queuedNodeIds.add(String(nodeRun.nodeId));
      }
    }

    for (const nodeRun of nodeRuns) {
      if (queuedNodeIds.has(String(nodeRun.nodeId)) && nodeRun.status === NODE_STATUS_BLOCKED) {
        await ctx.db.patch(nodeRun._id, {
          status: RUN_STATUS_QUEUED,
          updatedAt: now,
        });
      }
    }

    const updatedNodeRuns = await ctx.db
      .query("aiNodeRuns")
      .withIndex("byWorkflowRun", (q) => q.eq("workflowRunId", workflowRun._id))
      .collect();

    const counts = countByStatus(updatedNodeRuns);

    const isCompleted = counts.done === updatedNodeRuns.length;

    if (isCompleted) {
      await ctx.db.patch(workflowRun._id, {
        status: RUN_STATUS_DONE,
        completedAt: now,
        completedNodeCount: counts.done,
        failedNodeCount: counts.failed,
        updatedAt: now,
      });
      return { ok: true, completed: true };
    }

    await ctx.db.patch(workflowRun._id, {
      status: RUN_STATUS_PROCESSING,
      completedNodeCount: counts.done,
      failedNodeCount: counts.failed,
      updatedAt: now,
    });

    return {
      ok: true,
      queuedNext: queuedNodeIds.size,
      counts,
    };
  },
});
