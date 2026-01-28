import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

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

const ensureAuthenticated = async (ctx: any, origin: string | null) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return {
      identity: null,
      response: jsonResponse(401, { error: "Unauthorized", details: "Authentication required" }, origin),
    };
  }
  return { identity, response: null };
};

const ensureBoardWriteAccess = async (
  ctx: any,
  boardId: string | null,
  origin: string | null
) => {
  if (!boardId) return { ok: true, response: null };
  let permissions;
  try {
    permissions = await ctx.runQuery(api.boards.getBoardPermissions, {
      boardId: boardId as Id<"boards">,
    });
  } catch {
    return {
      ok: false,
      response: jsonResponse(400, { error: "Bad Request", details: "Invalid board id" }, origin),
    };
  }
  if (!permissions?.resourceExists) {
    return {
      ok: false,
      response: jsonResponse(404, { error: "Not Found", details: "Board not found" }, origin),
    };
  }
  if (!permissions.canWrite) {
    return {
      ok: false,
      response: jsonResponse(403, { error: "Forbidden", details: "Access denied" }, origin),
    };
  }
  return { ok: true, response: null };
};

const parseJson = async (request: Request, origin: string | null) => {
  try {
    return { data: await request.json(), response: null };
  } catch {
    return {
      data: null,
      response: jsonResponse(400, { error: "Bad Request", details: "Invalid JSON body" }, origin),
    };
  }
};

const getEnv = (key: string, fallback = "") => process.env[key] ?? fallback;

const DEFAULT_PART_SIZE = 8 * 1024 * 1024; // 8MB

export const initMultipartUpload = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  const auth = await ensureAuthenticated(ctx, origin);
  if (auth.response) return auth.response;

  const parsed = await parseJson(request, origin);
  if (parsed.response) return parsed.response;

  const payload = parsed.data as {
    fileName?: unknown;
    contentType?: unknown;
    fileSize?: unknown;
    boardId?: unknown;
    isPrivate?: unknown;
    autoSaveToLibrary?: unknown;
    context?: unknown;
    contextId?: unknown;
  };

  const fileName = typeof payload.fileName === "string" ? payload.fileName : "";
  const contentType =
    typeof payload.contentType === "string" && payload.contentType
      ? payload.contentType
      : "application/octet-stream";
  const fileSize = typeof payload.fileSize === "number" ? payload.fileSize : null;
  const boardId = typeof payload.boardId === "string" ? payload.boardId : null;
  const context =
    payload.context === "review" || payload.context === "board" || payload.context === "library"
      ? payload.context
      : null;
  const contextId = typeof payload.contextId === "string" ? payload.contextId : null;

  if (!fileName || !fileSize || fileSize <= 0) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing or invalid file metadata" }, origin);
  }

  const permissionCheck = await ensureBoardWriteAccess(ctx, boardId, origin);
  if (permissionCheck.response) return permissionCheck.response;

  let result: { uploadId: string; storageKey: string; publicUrl: string };
  try {
    result = await ctx.runAction(api.storage.createMultipartUpload, {
      contentType,
      fileName,
      context: context ?? undefined,
      contextId: contextId ?? undefined,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "UPLOAD_INIT_FAILED", details }, origin);
  }

  const partSize = DEFAULT_PART_SIZE;

  return jsonResponse(
    200,
    {
      uploadId: result.uploadId,
      key: result.storageKey,
      bucket: getEnv("MINIO_BUCKET"),
      endpoint: getEnv("MINIO_PUBLIC_ENDPOINT", getEnv("MINIO_ENDPOINT")),
      partSize,
      meta: {
        boardId,
        isPrivate: Boolean(payload.isPrivate),
        autoSaveToLibrary: Boolean(payload.autoSaveToLibrary),
        context,
        contextId,
      },
    },
    origin
  );
});

export const signMultipartUploadPart = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  const auth = await ensureAuthenticated(ctx, origin);
  if (auth.response) return auth.response;

  const parsed = await parseJson(request, origin);
  if (parsed.response) return parsed.response;

  const payload = parsed.data as {
    key?: unknown;
    uploadId?: unknown;
    partNumber?: unknown;
    contentType?: unknown;
  };

  const key = typeof payload.key === "string" ? payload.key : null;
  const uploadId = typeof payload.uploadId === "string" ? payload.uploadId : null;
  const partNumber = typeof payload.partNumber === "number" ? payload.partNumber : null;
  const contentType = typeof payload.contentType === "string" ? payload.contentType : "";

  if (!key || !uploadId || !partNumber) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing multipart identifiers" }, origin);
  }

  let result: { urls: Array<{ partNumber: number; url: string }> };
  try {
    result = await ctx.runAction(api.storage.getMultipartUploadUrls, {
      storageKey: key,
      uploadId,
      partNumbers: [partNumber],
      contentType,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "UPLOAD_SIGN_FAILED", details }, origin);
  }

  const signed = result.urls[0];
  if (!signed?.url) {
    return jsonResponse(500, { error: "Failed to sign part" }, origin);
  }

  return jsonResponse(200, { url: signed.url }, origin);
});

export const completeMultipartUploadRequest = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  const auth = await ensureAuthenticated(ctx, origin);
  if (auth.response) return auth.response;

  const parsed = await parseJson(request, origin);
  if (parsed.response) return parsed.response;

  const payload = parsed.data as {
    key?: unknown;
    uploadId?: unknown;
    parts?: Array<{ partNumber?: number; eTag?: string }>;
    boardId?: unknown;
  };

  const key = typeof payload.key === "string" ? payload.key : null;
  const uploadId = typeof payload.uploadId === "string" ? payload.uploadId : null;
  const parts = Array.isArray(payload.parts) ? payload.parts : null;
  const boardId = typeof payload.boardId === "string" ? payload.boardId : null;

  if (!key || !uploadId || !parts || parts.length === 0) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing completion data" }, origin);
  }

  const permissionCheck = await ensureBoardWriteAccess(ctx, boardId, origin);
  if (permissionCheck.response) return permissionCheck.response;

  const mappedParts = parts
    .filter((p) => typeof p.partNumber === "number" && typeof p.eTag === "string")
    .map((p) => ({ PartNumber: p.partNumber!, ETag: p.eTag! }));

  if (mappedParts.length === 0) {
    return jsonResponse(400, { error: "Bad Request", details: "Invalid multipart parts" }, origin);
  }

  let result: { publicUrl: string };
  try {
    result = await ctx.runAction(api.storage.completeMultipartUpload, {
      storageKey: key,
      uploadId,
      parts: mappedParts,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "UPLOAD_COMPLETE_FAILED", details }, origin);
  }

  return jsonResponse(200, { success: true, url: result.publicUrl }, origin);
});

export const abortMultipartUploadRequest = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  const auth = await ensureAuthenticated(ctx, origin);
  if (auth.response) return auth.response;

  const parsed = await parseJson(request, origin);
  if (parsed.response) return parsed.response;

  const payload = parsed.data as { key?: unknown; uploadId?: unknown };
  const key = typeof payload.key === "string" ? payload.key : null;
  const uploadId = typeof payload.uploadId === "string" ? payload.uploadId : null;

  if (!key || !uploadId) {
    return jsonResponse(400, { error: "Bad Request", details: "Missing multipart identifiers" }, origin);
  }

  try {
    await ctx.runAction(api.storage.abortMultipartUpload, { storageKey: key, uploadId });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: "UPLOAD_ABORT_FAILED", details }, origin);
  }
  return jsonResponse(200, { aborted: true }, origin);
});
