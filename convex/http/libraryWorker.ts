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

const requireWorkerSecret = (request: Request) => {
  const configured = process.env.LIBRARY_WORKER_SECRET;
  if (!configured) {
    throw new Error("Missing Convex env LIBRARY_WORKER_SECRET");
  }
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || token !== configured) {
    throw new Error("Unauthorized");
  }
};

export const claimJob = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  try {
    requireWorkerSecret(request);
  } catch (e) {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Bad Request", details: "Invalid JSON body" }, origin);
  }

  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  if (!workerId) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing workerId" }, origin);
  }

  const claimed = await ctx.runMutation(internal.assetWorker.claimNextJob, { workerId });
  return jsonResponse(200, { claimed }, origin);
});

export const heartbeat = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  try {
    requireWorkerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Bad Request", details: "Invalid JSON body" }, origin);
  }

  const jobId = payload?.jobId;
  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  if (!jobId || !workerId) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing jobId/workerId" }, origin);
  }

  try {
    const result = await ctx.runMutation(internal.assetWorker.heartbeatJob, { jobId, workerId });
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
    requireWorkerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Bad Request", details: "Invalid JSON body" }, origin);
  }

  const jobId = payload?.jobId;
  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  const analysisVersion = typeof payload?.analysisVersion === "string" ? payload.analysisVersion : null;
  const result = payload?.result;

  if (!jobId || !workerId || !analysisVersion || !result) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing jobId/workerId/analysisVersion/result" }, origin);
  }

  // Optional: if the worker provides an embedding vector, upsert it via Qdrant here.
  // We use assetId as qdrant point id (= embeddingRef).
  let embeddingRef: string | undefined = result?.embedding?.ref;
  try {
    const embedding = result?.embedding;
    if (embedding?.vector && Array.isArray(embedding.vector) && typeof embedding.id === "string") {
      const upserted = await ctx.runAction(internal.qdrant.upsertPoint, {
        id: embedding.id,
        vector: embedding.vector,
        payload: embedding.payload ?? {},
        wait: true,
      });
      embeddingRef = upserted.embeddingRef;
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "QDRANT_UPSERT_FAILED", details }, origin);
  }

  try {
    const applied = await ctx.runMutation(internal.assetWorker.applyAnalysisResult, {
      jobId,
      workerId,
      analysisVersion,
      resultSummary: typeof payload?.resultSummary === "string" ? payload.resultSummary : undefined,
      assetPatch: {
        captionsI18n: result?.captionsI18n,
        aiTokensI18n: result?.aiTokensI18n,
        ocrText: typeof result?.ocrText === "string" ? result.ocrText : undefined,
        dominantColors: Array.isArray(result?.dominantColors) ? result.dominantColors : undefined,
        phash: typeof result?.phash === "string" ? result.phash : undefined,
        sha256: typeof result?.sha256 === "string" ? result.sha256 : undefined,
        embeddingProvider: embeddingRef ? (result?.embedding?.provider ?? "qdrant") : undefined,
        embeddingRef,
        embeddingModel: typeof result?.embedding?.model === "string" ? result.embedding.model : undefined,
        embeddingDim: typeof result?.embedding?.dim === "number" ? result.embedding.dim : undefined,
      },
    });
    return jsonResponse(200, applied, origin);
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
    requireWorkerSecret(request);
  } catch {
    return jsonResponse(401, { error: "UNAUTHORIZED" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Bad Request", details: "Invalid JSON body" }, origin);
  }

  const jobId = payload?.jobId;
  const workerId = typeof payload?.workerId === "string" ? payload.workerId : null;
  const errorMessage = typeof payload?.error === "string" ? payload.error : null;
  if (!jobId || !workerId || !errorMessage) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing jobId/workerId/error" }, origin);
  }

  try {
    const result = await ctx.runMutation(internal.assetWorker.failJob, {
      jobId,
      workerId,
      error: errorMessage,
    });
    return jsonResponse(200, result, origin);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(400, { error: "FAIL_FAILED", details }, origin);
  }
});

