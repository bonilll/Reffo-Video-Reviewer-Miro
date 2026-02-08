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

export const deleteMediaByPublicUrl = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return jsonResponse(401, { error: "Unauthorized" }, origin);
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Bad Request", details: "Invalid JSON body" }, origin);
  }

  const url = typeof payload?.url === "string" ? payload.url : null;
  if (!url) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing url" }, origin);
  }

  // Basic guardrail: only allow deleting our own storage keys (uploads path).
  // Additional authorization is enforced earlier when deciding which URLs can be deleted.
  if (!url.includes("/uploads/") && !url.includes("/video_review/")) {
    return jsonResponse(400, { error: "Bad Request", details: "URL not deletable" }, origin);
  }

  try {
    await ctx.runAction(internal.storage.deleteObjectByPublicUrl, { publicUrl: url });
    return jsonResponse(200, { deleted: true }, origin);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "DELETE_FAILED", details }, origin);
  }
});

