import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

const buildCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const jsonResponse = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      "Content-Type": "application/json",
    },
  });

const requireRunnerSecret = (request: Request) => {
  const configured = process.env.AI_RUNNER_SECRET;
  if (!configured) {
    throw new Error("Missing Convex env AI_RUNNER_SECRET");
  }

  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  if (!token || token !== configured) {
    throw new Error("Unauthorized");
  }
};

export const claim = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  try {
    requireRunnerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Invalid JSON body" }, origin);
  }

  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  if (!workerId) {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Missing workerId" }, origin);
  }

  const claimed = await ctx.runMutation(internal.aiRuns.claimNodeRun, { workerId });
  return jsonResponse(200, { claimed }, origin);
});

export const heartbeat = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  try {
    requireRunnerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Invalid JSON body" }, origin);
  }

  const nodeRunId = payload?.nodeRunId;
  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  if (!nodeRunId || !workerId) {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Missing nodeRunId/workerId" }, origin);
  }

  try {
    const result = await ctx.runMutation(internal.aiRuns.heartbeatNodeRun, {
      nodeRunId,
      workerId,
    });
    return jsonResponse(200, result, origin);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(400, { error: "HEARTBEAT_FAILED", details }, origin);
  }
});

export const complete = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  try {
    requireRunnerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Invalid JSON body" }, origin);
  }

  const nodeRunId = payload?.nodeRunId;
  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  if (!nodeRunId || !workerId) {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Missing nodeRunId/workerId" }, origin);
  }

  try {
    const result = await ctx.runMutation(internal.aiRuns.completeNodeRun, {
      nodeRunId,
      workerId,
      actualUsd: typeof payload?.actualUsd === "number" ? payload.actualUsd : undefined,
      providerRequestId:
        typeof payload?.providerRequestId === "string" ? payload.providerRequestId : undefined,
      providerJobId:
        typeof payload?.providerJobId === "string" ? payload.providerJobId : undefined,
      providerJobState:
        typeof payload?.providerJobState === "string" ? payload.providerJobState : undefined,
      resolvedConfig: payload?.resolvedConfig,
      outputs: Array.isArray(payload?.outputs) ? payload.outputs : undefined,
      outputSummary: payload?.outputSummary,
    });

    return jsonResponse(200, result, origin);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(400, { error: "COMPLETE_FAILED", details }, origin);
  }
});

export const fail = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  try {
    requireRunnerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Invalid JSON body" }, origin);
  }

  const nodeRunId = payload?.nodeRunId;
  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  const errorMessage = typeof payload?.error === "string" ? payload.error : null;

  if (!nodeRunId || !workerId || !errorMessage) {
    return jsonResponse(400, { error: "BAD_REQUEST", details: "Missing nodeRunId/workerId/error" }, origin);
  }

  try {
    const result = await ctx.runMutation(internal.aiRuns.failNodeRun, {
      nodeRunId,
      workerId,
      error: errorMessage,
      providerJobId:
        typeof payload?.providerJobId === "string" ? payload.providerJobId : undefined,
      providerJobState:
        typeof payload?.providerJobState === "string" ? payload.providerJobState : undefined,
      providerErrorCode:
        typeof payload?.providerErrorCode === "string" ? payload.providerErrorCode : undefined,
      providerErrorMessage:
        typeof payload?.providerErrorMessage === "string" ? payload.providerErrorMessage : undefined,
      validationError:
        typeof payload?.validationError === "string" ? payload.validationError : undefined,
      providerRequestId:
        typeof payload?.providerRequestId === "string" ? payload.providerRequestId : undefined,
    });

    return jsonResponse(200, result, origin);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(400, { error: "FAIL_FAILED", details }, origin);
  }
});
