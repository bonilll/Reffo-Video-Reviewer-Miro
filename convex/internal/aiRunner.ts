"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import {
  NANO_BANANA_CANONICAL_NODE_TYPE,
  normalizeNanoBananaConfig,
  type NanoBananaNodeConfig,
} from "../googleImageModelRegistry";
import {
  buildGoogleInteractiveGenerateRequest,
  parseGoogleInteractiveResponse,
} from "./googleImageAdapter";
import {
  parseGoogleBatchTerminalStatus,
} from "./googleBatchAdapter";

const IV_SIZE = 12;
const TAG_SIZE = 16;
const REQUEST_TIMEOUT_MS = 90_000;
const REFERENCE_TIMEOUT_MS = 25_000;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MAX_INLINE_REQUEST_BYTES = 19 * 1024 * 1024;
const DEFAULT_MAX_RUNS_PER_PUMP = 6;
const BATCH_POLL_BASE_MS = 10_000;
const BATCH_POLL_MAX_MS = 60_000;
const BATCH_MAX_POLLS = 240;

const nowTs = () => Date.now();

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new ConvexError(`Missing environment variable ${name}`);
  }
  return value;
};

const normalizeMasterKey = () => {
  const raw = process.env.AI_KEYS_MASTER_KEY;
  if (!raw) {
    throw new ConvexError("AI_KEYS_MASTER_KEY_MISSING");
  }
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const asBase64 = Buffer.from(trimmed, "base64");
    if (asBase64.length === 32) return asBase64;
  } catch {
    // noop
  }
  return createHash("sha256").update(trimmed).digest();
};

const decryptAesGcm = (encoded: string, key: Buffer, aad: string) => {
  const payload = Buffer.from(encoded, "base64");
  if (payload.length <= IV_SIZE + TAG_SIZE) {
    throw new ConvexError("AI_KEY_DECRYPT_PAYLOAD_INVALID");
  }
  const iv = payload.subarray(0, IV_SIZE);
  const tag = payload.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const ciphertext = payload.subarray(IV_SIZE + TAG_SIZE);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

const decryptApiKey = (keyMaterial: { ciphertext: string; wrappedDek: string }) => {
  const masterKey = normalizeMasterKey();
  const dek = decryptAesGcm(keyMaterial.wrappedDek, masterKey, "ai-key-wrap:v1");
  const plaintext = decryptAesGcm(keyMaterial.ciphertext, dek, "ai-key-data:v1");
  return plaintext.toString("utf8");
};

const inferMimeType = (value?: string) => {
  if (!value) return "image/png";
  const normalized = value.toLowerCase().trim();
  if (
    normalized === "image/png" ||
    normalized === "image/jpeg" ||
    normalized === "image/jpg" ||
    normalized === "image/webp" ||
    normalized === "image/gif"
  ) {
    return normalized === "image/jpg" ? "image/jpeg" : normalized;
  }
  return "image/png";
};

const extensionFromMimeType = (mimeType: string) => {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
    default:
      return "png";
  }
};

const sanitizeSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

const encodeResourcePath = (value: string) =>
  String(value)
    .split("/")
    .filter((item) => item.length > 0)
    .map((item) => encodeURIComponent(item))
    .join("/");

const getStorageConfig = () => {
  const endpoint = requiredEnv("MINIO_ENDPOINT");
  const bucket = requiredEnv("MINIO_BUCKET");
  const region = process.env.MINIO_REGION ?? "us-east-1";
  const publicBase = (
    process.env.MINIO_PUBLIC_URL ||
    `${endpoint.replace(/\/$/, "")}/${bucket}`
  ).replace(/\/$/, "");
  return { endpoint, bucket, region, publicBase };
};

const s3Client = (() => {
  const endpoint = requiredEnv("MINIO_ENDPOINT");
  const region = process.env.MINIO_REGION ?? "us-east-1";
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("MINIO_ACCESS_KEY"),
      secretAccessKey: requiredEnv("MINIO_SECRET_KEY"),
    },
  });
})();

const withTimeout = async <T>(promiseFactory: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

class RunnerExecutionError extends Error {
  code?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  validationError?: string;
  providerRequestId?: string;
  providerJobId?: string;
  providerJobState?: string;

  constructor(
    message: string,
    meta?: {
      code?: string;
      providerErrorCode?: string;
      providerErrorMessage?: string;
      validationError?: string;
      providerRequestId?: string;
      providerJobId?: string;
      providerJobState?: string;
    }
  ) {
    super(message);
    this.name = "RunnerExecutionError";
    this.code = meta?.code;
    this.providerErrorCode = meta?.providerErrorCode;
    this.providerErrorMessage = meta?.providerErrorMessage;
    this.validationError = meta?.validationError;
    this.providerRequestId = meta?.providerRequestId;
    this.providerJobId = meta?.providerJobId;
    this.providerJobState = meta?.providerJobState;
  }
}

const toFailurePayload = (error: unknown) => {
  if (error instanceof RunnerExecutionError) {
    return {
      error: error.code ?? error.message,
      providerErrorCode: error.providerErrorCode,
      providerErrorMessage: error.providerErrorMessage,
      validationError: error.validationError,
      providerRequestId: error.providerRequestId,
      providerJobId: error.providerJobId,
      providerJobState: error.providerJobState,
    };
  }

  if (error instanceof ConvexError) {
    return {
      error: String(error.message || "CONVEX_ERROR"),
      providerErrorCode: undefined,
      providerErrorMessage: undefined,
      validationError: undefined,
      providerRequestId: undefined,
      providerJobId: undefined,
      providerJobState: undefined,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    error: "AI_RUNNER_UNHANDLED_ERROR",
    providerErrorCode: "RUNNER_UNHANDLED_ERROR",
    providerErrorMessage: message.slice(0, 1000),
    validationError: undefined,
    providerRequestId: undefined,
    providerJobId: undefined,
    providerJobState: undefined,
  };
};

const resolveReferenceUrl = (
  reference: Record<string, unknown>,
  publicBase: string
): string | null => {
  if (typeof reference.url === "string" && reference.url.trim()) {
    return reference.url.trim();
  }
  if (typeof reference.publicUrl === "string" && reference.publicUrl.trim()) {
    return reference.publicUrl.trim();
  }
  if (typeof reference.storageKey === "string" && reference.storageKey.trim()) {
    return `${publicBase}/${reference.storageKey.replace(/^\//, "")}`;
  }
  return null;
};

const loadReferenceAsInlineData = async (
  reference: Record<string, unknown>,
  publicBase: string
): Promise<{ mimeType: string; base64Data: string; byteLength: number }> => {
  if (typeof reference.base64Data === "string" && reference.base64Data.trim()) {
    const mimeType = inferMimeType(
      typeof reference.mimeType === "string" ? reference.mimeType : undefined
    );
    const byteLength = Buffer.byteLength(reference.base64Data, "base64");
    return {
      mimeType,
      base64Data: reference.base64Data,
      byteLength,
    };
  }

  const url = resolveReferenceUrl(reference, publicBase);
  if (!url) {
    throw new RunnerExecutionError("INPUT_REFERENCE_URL_MISSING", {
      code: "CONFIG_INVALID_REFERENCE_SOURCE",
      validationError: "Missing reference URL or storageKey.",
    });
  }

  const response = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "GET",
        signal,
      }),
    REFERENCE_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new RunnerExecutionError("INPUT_REFERENCE_FETCH_FAILED", {
      code: "INPUT_REFERENCE_FETCH_FAILED",
      providerErrorCode: `HTTP_${response.status}`,
      providerErrorMessage: `Reference fetch failed (${response.status})`,
      validationError: "Reference image is not reachable.",
    });
  }

  const headerLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(headerLength) && headerLength > MAX_REFERENCE_BYTES) {
    throw new RunnerExecutionError("INPUT_REFERENCE_TOO_LARGE", {
      code: "INPUT_TOO_LARGE",
      validationError: "Reference image exceeds max size.",
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  if (bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new RunnerExecutionError("INPUT_REFERENCE_TOO_LARGE", {
      code: "INPUT_TOO_LARGE",
      validationError: "Reference image exceeds max size.",
    });
  }

  return {
    mimeType: inferMimeType(
      typeof reference.mimeType === "string"
        ? reference.mimeType
        : response.headers.get("content-type") || undefined
    ),
    base64Data: bytes.toString("base64"),
    byteLength: bytes.byteLength,
  };
};

const parseGoogleError = (status: number, payload: any, rawText: string) => {
  const providerCode =
    (payload?.error?.status as string | undefined) ||
    (payload?.error?.code ? `HTTP_${payload.error.code}` : undefined) ||
    `HTTP_${status}`;
  const providerMessage =
    (payload?.error?.message as string | undefined) || rawText.slice(0, 1000);
  return {
    providerCode,
    providerMessage,
  };
};

const callGoogleJsonApi = async (params: {
  endpoint: string;
  apiKey: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}) => {
  const response = await withTimeout(
    (signal) =>
      fetch(params.endpoint, {
        method: params.method ?? "GET",
        signal,
        headers:
          params.method === "POST" || params.body
            ? {
                "Content-Type": "application/json",
                "x-goog-api-key": params.apiKey,
              }
            : {
                "x-goog-api-key": params.apiKey,
              },
        body: params.body ? JSON.stringify(params.body) : undefined,
      }),
    REQUEST_TIMEOUT_MS
  );

  const rawText = await response.text();
  let payload: any = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  const providerRequestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-goog-request-id") ??
    undefined;

  if (!response.ok) {
    const parsed = parseGoogleError(response.status, payload, rawText);
    throw new RunnerExecutionError("GOOGLE_API_REQUEST_FAILED", {
      code: "PROVIDER_REQUEST_FAILED",
      providerErrorCode: parsed.providerCode,
      providerErrorMessage: parsed.providerMessage,
      providerRequestId,
    });
  }

  return {
    payload,
    providerRequestId,
  };
};

const callGoogleGenerateContent = async (params: {
  apiKey: string;
  modelId: string;
  requestBody: Record<string, unknown>;
}) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.modelId
  )}:generateContent`;

  return await callGoogleJsonApi({
    endpoint,
    apiKey: params.apiKey,
    method: "POST",
    body: params.requestBody,
  });
};

const callGoogleBatchCreate = async (params: {
  apiKey: string;
  modelId: string;
  displayName: string;
  requestBody: Record<string, unknown>;
  requestKey: string;
}) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.modelId
  )}:batchGenerateContent`;

  const body = {
    batch: {
      model: `models/${params.modelId}`,
      display_name: params.displayName,
      input_config: {
        requests: {
          requests: [
            {
              request: params.requestBody,
              metadata: {
                key: params.requestKey,
              },
            },
          ],
        },
      },
    },
  };

  return await callGoogleJsonApi({
    endpoint,
    apiKey: params.apiKey,
    method: "POST",
    body,
  });
};

const callGoogleBatchGet = async (params: { apiKey: string; batchName: string }) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${encodeResourcePath(
    params.batchName
  )}`;
  return await callGoogleJsonApi({
    endpoint,
    apiKey: params.apiKey,
    method: "GET",
  });
};

const callGoogleBatchDownloadFile = async (params: {
  apiKey: string;
  responsesFileName: string;
}) => {
  const endpoint = `https://generativelanguage.googleapis.com/download/v1beta/${encodeResourcePath(
    params.responsesFileName
  )}:download?alt=media`;

  const response = await withTimeout(
    (signal) =>
      fetch(endpoint, {
        method: "GET",
        signal,
        headers: {
          "x-goog-api-key": params.apiKey,
        },
      }),
    REQUEST_TIMEOUT_MS
  );

  const rawText = await response.text();
  const providerRequestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-goog-request-id") ??
    undefined;

  if (!response.ok) {
    let payload: any = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }
    const parsed = parseGoogleError(response.status, payload, rawText);
    throw new RunnerExecutionError("GOOGLE_BATCH_DOWNLOAD_FAILED", {
      code: "PROVIDER_REQUEST_FAILED",
      providerErrorCode: parsed.providerCode,
      providerErrorMessage: parsed.providerMessage,
      providerRequestId,
    });
  }

  return {
    rawText,
    providerRequestId,
  };
};

const normalizeGoogleFileDownloadUrl = (fileUri: string) => {
  const trimmed = fileUri.trim();
  if (!trimmed) {
    throw new RunnerExecutionError("GOOGLE_FILE_URI_EMPTY", {
      code: "PROVIDER_RESPONSE_INVALID",
      providerErrorMessage: "Google file URI is empty.",
    });
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    if (trimmed.includes("alt=media")) return trimmed;
    const separator = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${separator}alt=media`;
  }

  const normalized = trimmed.replace(/^\/+/, "");
  if (normalized.startsWith("files/")) {
    return `https://generativelanguage.googleapis.com/download/v1beta/${encodeResourcePath(
      normalized
    )}:download?alt=media`;
  }
  if (normalized.startsWith("v1beta/files/")) {
    const fileName = normalized.slice("v1beta/".length);
    return `https://generativelanguage.googleapis.com/download/v1beta/${encodeResourcePath(
      fileName
    )}:download?alt=media`;
  }

  return `https://generativelanguage.googleapis.com/download/v1beta/${encodeResourcePath(
    normalized
  )}:download?alt=media`;
};

const downloadGoogleOutputFile = async (params: {
  apiKey: string;
  fileUri: string;
}) => {
  const endpoint = normalizeGoogleFileDownloadUrl(params.fileUri);
  const response = await withTimeout(
    (signal) =>
      fetch(endpoint, {
        method: "GET",
        signal,
        headers: {
          "x-goog-api-key": params.apiKey,
        },
      }),
    REQUEST_TIMEOUT_MS
  );

  const providerRequestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-goog-request-id") ??
    undefined;

  if (!response.ok) {
    const rawText = await response.text();
    let payload: any = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }
    const parsed = parseGoogleError(response.status, payload, rawText);
    throw new RunnerExecutionError("GOOGLE_FILE_DOWNLOAD_FAILED", {
      code: "PROVIDER_REQUEST_FAILED",
      providerErrorCode: parsed.providerCode,
      providerErrorMessage: parsed.providerMessage,
      providerRequestId,
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeTypeHeader = response.headers.get("content-type");
  return {
    bytes,
    mimeType: inferMimeType(mimeTypeHeader || undefined),
    providerRequestId,
  };
};

const extractBatchName = (payload: any) => {
  const candidates = [
    payload?.name,
    payload?.batch?.name,
    payload?.metadata?.batch,
    payload?.response?.name,
  ];

  const found = candidates.find((item) => typeof item === "string" && String(item).trim().length > 0);
  if (!found) {
    throw new RunnerExecutionError("BATCH_CREATE_RESPONSE_INVALID", {
      code: "PROVIDER_RESPONSE_INVALID",
      providerErrorMessage: "Missing batch name in create response.",
    });
  }
  const normalized = String(found).trim();
  return normalized.startsWith("batches/") ? normalized : `batches/${normalized}`;
};

const extractBatchState = (payload: any): string => {
  const state =
    payload?.metadata?.state ||
    payload?.state ||
    payload?.batch?.state ||
    payload?.response?.state ||
    "JOB_STATE_PENDING";
  return String(state);
};

const extractResponsesFileName = (payload: any): string | null => {
  const responseRoot = payload?.response ?? payload;
  const fromRoot =
    responseRoot?.responsesFile ||
    responseRoot?.responses_file ||
    responseRoot?.output?.responsesFile ||
    responseRoot?.output?.responses_file ||
    responseRoot?.dest?.fileName ||
    responseRoot?.dest?.file_name ||
    null;
  return typeof fromRoot === "string" && fromRoot.trim().length > 0 ? String(fromRoot).trim() : null;
};

const extractInlinedResponses = (payload: any): any[] => {
  const responseRoot = payload?.response ?? payload;
  const candidates = [
    responseRoot?.inlinedResponses,
    responseRoot?.inlined_responses,
    responseRoot?.output?.inlinedResponses,
    responseRoot?.output?.inlined_responses,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && Array.isArray(candidate.responses)) return candidate.responses;
    if (candidate && Array.isArray(candidate.inlinedResponses)) return candidate.inlinedResponses;
  }

  return [];
};

const parseBatchJsonlLines = (rawText: string): any[] => {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const extractGenerateResponsesFromEntries = (entries: any[], requestKey?: string) => {
  const selected = requestKey
    ? entries.filter((entry) => {
        const key =
          entry?.metadata?.key ||
          entry?.key ||
          entry?.request?.metadata?.key ||
          entry?.request?.key;
        return typeof key === "string" ? key === requestKey : true;
      })
    : entries;

  const effective = selected.length ? selected : entries;

  const responses: any[] = [];
  const errors: any[] = [];

  for (const entry of effective) {
    const responsePayload =
      entry?.response?.response ||
      entry?.response ||
      (Array.isArray(entry?.candidates) ? entry : null);
    if (responsePayload && Array.isArray(responsePayload?.candidates)) {
      responses.push(responsePayload);
      continue;
    }

    const errorPayload = entry?.error || entry?.response?.error;
    if (errorPayload) {
      errors.push(errorPayload);
    }
  }

  return { responses, errors };
};

const uploadOutputImage = async (params: {
  launchedBy: string;
  boardId: string;
  subnetworkId: string;
  nodeId: string;
  nodeRunId: string;
  imageIndex: number;
  mimeType: string;
  bytes: Buffer;
}) => {
  const storage = getStorageConfig();
  const extension = extensionFromMimeType(params.mimeType);
  const storageKey = [
    "ai_outputs",
    sanitizeSegment(params.launchedBy),
    sanitizeSegment(params.boardId),
    sanitizeSegment(params.subnetworkId),
    sanitizeSegment(params.nodeId),
    sanitizeSegment(params.nodeRunId),
    `${nowTs()}-${params.imageIndex + 1}-${randomUUID()}.${extension}`,
  ].join("/");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: storageKey,
      Body: params.bytes,
      ContentType: params.mimeType,
    })
  );

  return {
    storageKey,
    publicUrl: `${storage.publicBase}/${storageKey}`,
  };
};

const heartbeat = async (ctx: any, nodeRunId: string, workerId: string) => {
  try {
    await ctx.runMutation(internal.aiRuns.heartbeatNodeRun, {
      nodeRunId,
      workerId,
    } as any);
  } catch {
    // Best effort heartbeat.
  }
};

const buildNanoBananaExecutionInput = async (claimed: any) => {
  const config: NanoBananaNodeConfig = normalizeNanoBananaConfig(
    claimed.execution?.resolvedConfig ?? claimed.node?.config
  ).config;

  const prompt = String(claimed.execution?.inputSnapshot?.prompt ?? "").trim();
  if (!prompt) {
    throw new RunnerExecutionError("PROMPT_REQUIRED", {
      code: "CONFIG_INVALID_PROMPT_REQUIRED",
      validationError: "Prompt is required.",
    });
  }

  const referencesRaw = Array.isArray(claimed.execution?.inputSnapshot?.references)
    ? claimed.execution.inputSnapshot.references
    : [];

  const storage = getStorageConfig();
  const referencesInline: Array<{ mimeType: string; base64Data: string }> = [];
  let requestBytes = Buffer.byteLength(prompt, "utf8");

  for (const referenceRaw of referencesRaw) {
    const reference =
      referenceRaw && typeof referenceRaw === "object"
        ? (referenceRaw as Record<string, unknown>)
        : {};
    const inline = await loadReferenceAsInlineData(reference, storage.publicBase);
    requestBytes += inline.byteLength;
    if (requestBytes > MAX_INLINE_REQUEST_BYTES) {
      throw new RunnerExecutionError("INPUT_REQUEST_TOO_LARGE", {
        code: "INPUT_TOO_LARGE",
        validationError:
          "Input exceeds inline request size limit. Reduce reference images size/count.",
      });
    }
    referencesInline.push({
      mimeType: inline.mimeType,
      base64Data: inline.base64Data,
    });
  }

  return {
    prompt,
    config,
    referencesInline,
  };
};

const persistNanoBananaOutputs = async (params: {
  ctx: any;
  claimed: any;
  workerId: string;
  config: NanoBananaNodeConfig;
  parsedResponses: any[];
  apiKey: string;
  providerRequestId?: string;
  providerJobId?: string;
  providerJobState?: string;
}) => {
  const mergedImages: Array<{ mimeType: string; base64Data?: string; fileUri?: string }> = [];
  const mergedTextParts: string[] = [];
  const mergedFinishReasons = new Set<string>();
  const mergedBlockReasons = new Set<string>();

  for (const responsePayload of params.parsedResponses) {
    const parsed = parseGoogleInteractiveResponse(responsePayload);
    mergedImages.push(...parsed.images);
    mergedTextParts.push(...parsed.textParts);
    for (const reason of parsed.finishReasons) {
      if (reason) mergedFinishReasons.add(reason);
    }
    if (parsed.blockReason) mergedBlockReasons.add(parsed.blockReason);
  }

  if (!mergedImages.length) {
    const diagnosticPieces: string[] = [];
    if (mergedFinishReasons.size > 0) {
      diagnosticPieces.push(`finishReason=${Array.from(mergedFinishReasons).join(",")}`);
    }
    if (mergedBlockReasons.size > 0) {
      diagnosticPieces.push(`blockReason=${Array.from(mergedBlockReasons).join(",")}`);
    }
    if (mergedTextParts.length > 0) {
      diagnosticPieces.push(`text=${mergedTextParts.join(" ").slice(0, 220)}`);
    }

    throw new RunnerExecutionError("PROVIDER_EMPTY_OUTPUT", {
      code: "PROVIDER_EMPTY_OUTPUT",
      providerErrorMessage:
        diagnosticPieces.length > 0
          ? `Google response contains no image outputs (${diagnosticPieces.join(" | ")}).`
          : "Google response contains no image outputs.",
      providerRequestId: params.providerRequestId,
      providerJobId: params.providerJobId,
      providerJobState: params.providerJobState,
    });
  }

  const outputs: Array<Record<string, unknown>> = [];

  for (let i = 0; i < mergedImages.length; i += 1) {
    const item = mergedImages[i];
    const mimeType = inferMimeType(item.mimeType);

    let bytes: Buffer;
    let resolvedMimeType = mimeType;
    let resolvedProviderRequestId = params.providerRequestId;

    if (item.base64Data) {
      bytes = Buffer.from(item.base64Data, "base64");
    } else if (item.fileUri) {
      const downloaded = await downloadGoogleOutputFile({
        apiKey: params.apiKey,
        fileUri: item.fileUri,
      });
      bytes = downloaded.bytes;
      resolvedMimeType = inferMimeType(item.mimeType || downloaded.mimeType);
      if (!resolvedProviderRequestId && downloaded.providerRequestId) {
        resolvedProviderRequestId = downloaded.providerRequestId;
      }
    } else {
      continue;
    }

    const stored = await uploadOutputImage({
      launchedBy: String(params.claimed.nodeRun.launchedBy),
      boardId: String(params.claimed.nodeRun.boardId),
      subnetworkId: String(params.claimed.nodeRun.subnetworkId),
      nodeId: String(params.claimed.nodeRun.nodeId),
      nodeRunId: String(params.claimed.nodeRun._id),
      imageIndex: i,
      mimeType: resolvedMimeType,
      bytes,
    });

    outputs.push({
      outputType: "image",
      title: mergedImages.length > 1 ? `Image ${i + 1}` : "Image",
      storageKey: stored.storageKey,
      publicUrl: stored.publicUrl,
      mimeType: resolvedMimeType,
      byteSize: bytes.byteLength,
      metadata: {
        modelId: params.config.modelId,
        runMode: params.config.runMode,
        source: item.base64Data ? "inlineData" : "fileData",
        fileUri: item.fileUri,
      },
    });

    if (resolvedProviderRequestId) {
      params.providerRequestId = resolvedProviderRequestId;
    }
  }

  if (!outputs.length) {
    throw new RunnerExecutionError("PROVIDER_EMPTY_OUTPUT", {
      code: "PROVIDER_EMPTY_OUTPUT",
      providerErrorMessage: "Google returned image parts, but all were empty/unreadable.",
      providerRequestId: params.providerRequestId,
      providerJobId: params.providerJobId,
      providerJobState: params.providerJobState,
    });
  }

  await params.ctx.runMutation(internal.aiRuns.completeNodeRun, {
    nodeRunId: params.claimed.nodeRun._id,
    workerId: params.workerId,
    providerRequestId: params.providerRequestId,
    providerJobId: params.providerJobId,
    providerJobState: params.providerJobState,
    resolvedConfig: params.config,
    outputs,
    outputSummary:
      mergedTextParts.length > 0
        ? {
            textParts: mergedTextParts,
          }
        : undefined,
  });
};

const failNodeRunSafely = async (
  ctx: any,
  params: {
    nodeRunId: string;
    workerId: string;
    error: unknown;
  }
) => {
  const failure = toFailurePayload(params.error);
  await ctx.runMutation(internal.aiRuns.failNodeRun, {
    nodeRunId: params.nodeRunId,
    workerId: params.workerId,
    error: failure.error,
    providerErrorCode: failure.providerErrorCode,
    providerErrorMessage: failure.providerErrorMessage,
    validationError: failure.validationError,
    providerRequestId: failure.providerRequestId,
    providerJobId: failure.providerJobId,
    providerJobState: failure.providerJobState,
  });
};

const extractKeyMaterial = (claimed: any) => {
  if (!claimed?.keyMaterial?.ciphertext || !claimed?.keyMaterial?.wrappedDek) {
    throw new RunnerExecutionError("AI_KEY_REQUIRED", {
      code: "AI_KEY_REQUIRED",
      validationError: "No active API key found for launcher.",
    });
  }
  return {
    ciphertext: String(claimed.keyMaterial.ciphertext),
    wrappedDek: String(claimed.keyMaterial.wrappedDek),
  };
};

const executeNanoBananaInteractive = async (ctx: any, claimed: any, workerId: string) => {
  const keyMaterial = extractKeyMaterial(claimed);
  const apiKey = decryptApiKey(keyMaterial);
  const prepared = await buildNanoBananaExecutionInput(claimed);

  await heartbeat(ctx, claimed.nodeRun._id, workerId);

  const requestBody = buildGoogleInteractiveGenerateRequest({
    prompt: prepared.prompt,
    references: prepared.referencesInline,
    config: prepared.config,
  });

  const google = await callGoogleGenerateContent({
    apiKey,
    modelId: prepared.config.modelId,
    requestBody: requestBody as Record<string, unknown>,
  });

  await persistNanoBananaOutputs({
    ctx,
    claimed,
    workerId,
    config: prepared.config,
    parsedResponses: [google.payload],
    apiKey,
    providerRequestId: google.providerRequestId,
    providerJobState: "done",
  });
};

const startNanoBananaBatch = async (ctx: any, claimed: any, workerId: string) => {
  const keyMaterial = extractKeyMaterial(claimed);
  const apiKey = decryptApiKey(keyMaterial);
  const prepared = await buildNanoBananaExecutionInput(claimed);

  await heartbeat(ctx, claimed.nodeRun._id, workerId);

  const requestBody = buildGoogleInteractiveGenerateRequest({
    prompt: prepared.prompt,
    references: prepared.referencesInline,
    config: prepared.config,
  });

  const requestKey = `node-run-${String(claimed.nodeRun._id)}`;
  const batchCreate = await callGoogleBatchCreate({
    apiKey,
    modelId: prepared.config.modelId,
    displayName: `Reffo ${requestKey}`,
    requestBody: requestBody as Record<string, unknown>,
    requestKey,
  });

  const batchName = extractBatchName(batchCreate.payload);
  const batchState = extractBatchState(batchCreate.payload);

  await ctx.runMutation(internal.aiRuns.updateProcessingNodeRunProviderState, {
    nodeRunId: claimed.nodeRun._id,
    workerId,
    providerRequestId: batchCreate.providerRequestId,
    providerJobId: batchName,
    providerJobState: batchState,
    resolvedConfig: prepared.config,
  });

  const terminal = parseGoogleBatchTerminalStatus(batchState);
  if (terminal === "succeeded") {
    const inlined = extractInlinedResponses(batchCreate.payload);
    const extracted = extractGenerateResponsesFromEntries(inlined, requestKey);
    if (extracted.errors.length > 0 && extracted.responses.length === 0) {
      throw new RunnerExecutionError("BATCH_REQUEST_FAILED", {
        code: "PROVIDER_BATCH_REQUEST_FAILED",
        providerJobId: batchName,
        providerJobState: batchState,
        providerErrorMessage: JSON.stringify(extracted.errors[0]).slice(0, 1000),
      });
    }

    if (extracted.responses.length > 0) {
      await persistNanoBananaOutputs({
        ctx,
        claimed,
        workerId,
        config: prepared.config,
        parsedResponses: extracted.responses,
        apiKey,
        providerRequestId: batchCreate.providerRequestId,
        providerJobId: batchName,
        providerJobState: batchState,
      });
      return;
    }
  }

  if (terminal === "failed" || terminal === "canceled" || terminal === "expired") {
    throw new RunnerExecutionError("BATCH_TERMINAL_FAILURE", {
      code: terminal === "failed" ? "PROVIDER_BATCH_FAILED" : "BATCH_TERMINATED",
      providerJobId: batchName,
      providerJobState: batchState,
      providerRequestId: batchCreate.providerRequestId,
    });
  }

  await ctx.scheduler.runAfter(0, (internal as any)["internal/aiRunner"].continueBatchRun, {
    nodeRunId: claimed.nodeRun._id,
    workerId,
    pollAttempt: 0,
    requestKey,
  });
};

const processBatchPoll = async (ctx: any, params: {
  nodeRunId: string;
  workerId: string;
  pollAttempt: number;
  requestKey?: string;
}) => {
  const claimed = await ctx.runQuery(internal.aiRuns.getProcessingNodeRunForWorker, {
    nodeRunId: params.nodeRunId,
  });

  if (!claimed) {
    return { ok: false, reason: "NODE_RUN_NOT_FOUND" as const };
  }

  if (claimed.nodeRun.status !== "processing") {
    return { ok: false, reason: "NODE_RUN_NOT_PROCESSING" as const };
  }

  if (String(claimed.nodeRun.lockOwner || "") !== params.workerId) {
    return { ok: false, reason: "LOCK_MISMATCH" as const };
  }

  if (claimed.execution?.nodeType !== NANO_BANANA_CANONICAL_NODE_TYPE) {
    await failNodeRunSafely(ctx, {
      nodeRunId: claimed.nodeRun._id,
      workerId: params.workerId,
      error: new RunnerExecutionError("NODE_TYPE_NOT_IMPLEMENTED", {
        code: "NODE_TYPE_NOT_IMPLEMENTED",
      }),
    });
    return { ok: false, reason: "WRONG_NODE_TYPE" as const };
  }

  if (claimed.execution?.executionMode !== "batch") {
    return { ok: false, reason: "NOT_BATCH" as const };
  }

  const batchName = typeof claimed.nodeRun.providerJobId === "string"
    ? claimed.nodeRun.providerJobId
    : null;

  if (!batchName) {
    await failNodeRunSafely(ctx, {
      nodeRunId: claimed.nodeRun._id,
      workerId: params.workerId,
      error: new RunnerExecutionError("BATCH_JOB_ID_MISSING", {
        code: "PROVIDER_JOB_ID_MISSING",
      }),
    });
    return { ok: false, reason: "MISSING_BATCH_ID" as const };
  }

  const keyMaterial = extractKeyMaterial(claimed);
  const apiKey = decryptApiKey(keyMaterial);
  const prepared = await buildNanoBananaExecutionInput(claimed);

  await heartbeat(ctx, claimed.nodeRun._id, params.workerId);

  const statusResponse = await callGoogleBatchGet({
    apiKey,
    batchName,
  });

  const batchState = extractBatchState(statusResponse.payload);

  await ctx.runMutation(internal.aiRuns.updateProcessingNodeRunProviderState, {
    nodeRunId: claimed.nodeRun._id,
    workerId: params.workerId,
    providerRequestId: statusResponse.providerRequestId,
    providerJobId: batchName,
    providerJobState: batchState,
    resolvedConfig: prepared.config,
  });

  const terminal = parseGoogleBatchTerminalStatus(batchState);

  if (terminal === "running") {
    if (params.pollAttempt >= BATCH_MAX_POLLS) {
      await failNodeRunSafely(ctx, {
        nodeRunId: claimed.nodeRun._id,
        workerId: params.workerId,
        error: new RunnerExecutionError("BATCH_TIMEOUT", {
          code: "BATCH_TIMEOUT",
          providerJobId: batchName,
          providerJobState: batchState,
          providerRequestId: statusResponse.providerRequestId,
          providerErrorMessage: "Batch job did not reach terminal state in expected time.",
        }),
      });
      return { ok: false, reason: "BATCH_TIMEOUT" as const };
    }

    const delay = Math.min(
      BATCH_POLL_MAX_MS,
      BATCH_POLL_BASE_MS * Math.max(1, Math.min(params.pollAttempt + 1, 6))
    );

    await ctx.scheduler.runAfter(delay, (internal as any)["internal/aiRunner"].continueBatchRun, {
      nodeRunId: claimed.nodeRun._id,
      workerId: params.workerId,
      pollAttempt: params.pollAttempt + 1,
      requestKey: params.requestKey,
    });

    return { ok: true, queuedNextPoll: true, batchState };
  }

  if (terminal === "failed" || terminal === "canceled" || terminal === "expired") {
    await failNodeRunSafely(ctx, {
      nodeRunId: claimed.nodeRun._id,
      workerId: params.workerId,
      error: new RunnerExecutionError("BATCH_TERMINAL_FAILURE", {
        code: terminal === "failed" ? "PROVIDER_BATCH_FAILED" : "BATCH_TERMINATED",
        providerJobId: batchName,
        providerJobState: batchState,
        providerRequestId: statusResponse.providerRequestId,
      }),
    });
    return { ok: false, reason: "BATCH_TERMINAL_FAILURE" as const, batchState };
  }

  const inlined = extractInlinedResponses(statusResponse.payload);
  const extractedInlined = extractGenerateResponsesFromEntries(inlined, params.requestKey);

  let responses = extractedInlined.responses;
  if (responses.length === 0) {
    const responsesFileName = extractResponsesFileName(statusResponse.payload);
    if (responsesFileName) {
      const downloaded = await callGoogleBatchDownloadFile({
        apiKey,
        responsesFileName,
      });
      const lines = parseBatchJsonlLines(downloaded.rawText);
      const extractedFromFile = extractGenerateResponsesFromEntries(lines, params.requestKey);
      responses = extractedFromFile.responses;

      if (extractedFromFile.errors.length > 0 && responses.length === 0) {
        await failNodeRunSafely(ctx, {
          nodeRunId: claimed.nodeRun._id,
          workerId: params.workerId,
          error: new RunnerExecutionError("BATCH_REQUEST_FAILED", {
            code: "PROVIDER_BATCH_REQUEST_FAILED",
            providerJobId: batchName,
            providerJobState: batchState,
            providerRequestId: downloaded.providerRequestId ?? statusResponse.providerRequestId,
            providerErrorMessage: JSON.stringify(extractedFromFile.errors[0]).slice(0, 1000),
          }),
        });
        return { ok: false, reason: "BATCH_REQUEST_FAILED" as const };
      }
    }
  }

  if (responses.length === 0) {
    await failNodeRunSafely(ctx, {
      nodeRunId: claimed.nodeRun._id,
      workerId: params.workerId,
      error: new RunnerExecutionError("BATCH_OUTPUT_MISSING", {
        code: "PROVIDER_EMPTY_OUTPUT",
        providerJobId: batchName,
        providerJobState: batchState,
        providerRequestId: statusResponse.providerRequestId,
      }),
    });
    return { ok: false, reason: "BATCH_OUTPUT_MISSING" as const };
  }

  await persistNanoBananaOutputs({
    ctx,
    claimed,
    workerId: params.workerId,
    config: prepared.config,
    parsedResponses: responses,
    apiKey,
    providerRequestId: statusResponse.providerRequestId,
    providerJobId: batchName,
    providerJobState: batchState,
  });

  return { ok: true, completed: true, batchState };
};

const executeNanoBananaRun = async (ctx: any, claimed: any, workerId: string) => {
  const runMode = claimed.execution?.executionMode === "batch" ? "batch" : "interactive";
  if (runMode === "batch") {
    await startNanoBananaBatch(ctx, claimed, workerId);
    return;
  }

  await executeNanoBananaInteractive(ctx, claimed, workerId);
};

const executeRun = async (ctx: any, claimed: any, workerId: string) => {
  const nodeType = String(claimed.execution?.nodeType ?? "");

  if (nodeType === "prompt" || nodeType === "image_reference") {
    await ctx.runMutation(internal.aiRuns.completeNodeRun, {
      nodeRunId: claimed.nodeRun._id,
      workerId,
      providerJobState: "done",
      outputSummary:
        nodeType === "prompt"
          ? {
              text: String(claimed.node?.config?.text ?? ""),
            }
          : {
              referencesCount: Array.isArray(claimed.node?.config?.images)
                ? claimed.node.config.images.length
                : 0,
            },
    });
    return;
  }

  if (nodeType === NANO_BANANA_CANONICAL_NODE_TYPE) {
    await executeNanoBananaRun(ctx, claimed, workerId);
    return;
  }

  throw new RunnerExecutionError("NODE_TYPE_NOT_IMPLEMENTED", {
    code: "NODE_TYPE_NOT_IMPLEMENTED",
    validationError: `Node type "${nodeType}" is not yet executable.`,
  });
};

export const continueBatchRun = internalAction({
  args: {
    nodeRunId: v.id("aiNodeRuns"),
    workerId: v.string(),
    pollAttempt: v.optional(v.number()),
    requestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      return await processBatchPoll(ctx, {
        nodeRunId: args.nodeRunId,
        workerId: args.workerId,
        pollAttempt: Math.max(0, Math.floor(args.pollAttempt ?? 0)),
        requestKey: args.requestKey,
      });
    } catch (error) {
      await failNodeRunSafely(ctx, {
        nodeRunId: args.nodeRunId,
        workerId: args.workerId,
        error,
      });
      return {
        ok: false,
        reason: "POLL_HANDLER_FAILED",
      };
    }
  },
});

export const pumpQueue = internalAction({
  args: {
    maxRuns: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxRuns = Math.max(
      1,
      Math.min(Math.floor(args.maxRuns ?? DEFAULT_MAX_RUNS_PER_PUMP), 24)
    );
    const workerId = `internal-ai-runner-${nowTs()}-${randomUUID().slice(0, 8)}`;

    let processed = 0;
    let failed = 0;

    while (processed < maxRuns) {
      const claimed = await ctx.runMutation(internal.aiRuns.claimNodeRun, { workerId });
      if (!claimed) break;

      try {
        await executeRun(ctx, claimed, workerId);
      } catch (error) {
        failed += 1;
        await failNodeRunSafely(ctx, {
          nodeRunId: claimed.nodeRun._id,
          workerId,
          error,
        });
      }

      processed += 1;
    }

    if (processed >= maxRuns) {
      await ctx.scheduler.runAfter(0, (internal as any)["internal/aiRunner"].pumpQueue, {
        maxRuns,
      });
    }

    return {
      ok: true,
      workerId,
      processed,
      failed,
      maxRuns,
    };
  },
});
