import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildGatewayEnvelope,
  decryptApiKey,
  encryptApiKey,
  isLikelyApiKey,
  redactSecrets,
} from "../../../lib/server/ai-key-security.js";
import {
  convexMutation,
  convexQuery,
  readJsonBody,
  requireAuthenticatedUser,
  sendJson,
  setCors,
} from "../../../lib/server/convex-gateway.js";

type GoogleKeyMode = "session" | "persistent";

type StoreBody = {
  apiKey?: unknown;
  label?: unknown;
  proofToken?: unknown;
  expiresInHours?: unknown;
};

type ModeKeyBody = {
  mode?: unknown;
  keyId?: unknown;
  reason?: unknown;
  proofToken?: unknown;
  apiKey?: unknown;
};

const KNOWN_SINGLE_ROUTES = new Set(["list", "session", "persistent", "test", "pause", "resume"]);

const parseMode = (mode: unknown): GoogleKeyMode | null => {
  if (mode === "session") return "session";
  if (mode === "persistent") return "persistent";
  return null;
};

const getRouteSegments = (req: IncomingMessage & any): string[] => {
  const fromQuery = req.query?.route;
  if (Array.isArray(fromQuery)) return fromQuery.filter(Boolean).map(String);
  if (typeof fromQuery === "string" && fromQuery.length > 0) return [fromQuery];

  const rawUrl = typeof req.url === "string" ? req.url : "";
  const url = new URL(rawUrl, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "api" && parts[1] === "keys" && parts[2] === "google") {
    return parts.slice(3).map((part) => decodeURIComponent(part));
  }

  return [];
};

const testGoogleApiKey = async (apiKey: string) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(
    apiKey
  )}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    body: text.slice(0, 500),
  };
};

const handleList = async (req: IncomingMessage & any, res: ServerResponse & any) => {
  try {
    const { token } = await requireAuthenticatedUser(req);

    await convexMutation("aiKeys:cleanupExpiredSessionKeys", {}, token).catch(() => undefined);
    const keys = await convexQuery<any[]>("aiKeys:listGoogleKeys", {}, token);

    sendJson(res, 200, {
      provider: "google",
      keys,
    });
  } catch (error) {
    sendJson(res, 401, {
      error: "UNAUTHORIZED",
      details: error instanceof Error ? error.message : "Unauthorized",
    });
  }
};

const handleStore = async (
  req: IncomingMessage & any,
  res: ServerResponse & any,
  mode: GoogleKeyMode
) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<StoreBody>(req);

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!isLikelyApiKey(apiKey)) {
      sendJson(res, 400, {
        error: "INVALID_API_KEY_FORMAT",
      });
      return;
    }

    const proofToken = typeof body.proofToken === "string" ? body.proofToken : "";
    if (!proofToken) {
      sendJson(res, 401, { error: "STEP_UP_REQUIRED" });
      return;
    }

    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : undefined;

    const encrypted = encryptApiKey(apiKey);
    const payload: Record<string, unknown> = {
      mode,
      label,
      ...encrypted,
      proofToken,
    };

    if (mode === "session") {
      const hoursRaw = typeof body.expiresInHours === "number" ? body.expiresInHours : 8;
      const expiresInHours = Math.min(24, Math.max(1, Math.floor(hoursRaw)));
      payload.expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;
    }

    const gateway = buildGatewayEnvelope(String(user._id), "store-key", payload);

    const result = await convexMutation<any>(
      "aiKeys:gatewayStoreGoogleKey",
      {
        ...payload,
        gateway,
      },
      token
    );

    sendJson(res, 200, {
      ok: true,
      key: result,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, {
      error: mode === "session" ? "KEY_SESSION_SAVE_FAILED" : "KEY_PERSISTENT_SAVE_FAILED",
      details: redactSecrets(raw),
    });
  }
};

const handlePause = async (req: IncomingMessage & any, res: ServerResponse & any) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<ModeKeyBody>(req);

    const mode = parseMode(body.mode);
    const keyId = typeof body.keyId === "string" ? body.keyId : "";

    if (!mode || !keyId) {
      sendJson(res, 400, { error: "BAD_REQUEST", details: "Missing mode/keyId" });
      return;
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
    const payload = { mode, keyId, reason };
    const gateway = buildGatewayEnvelope(String(user._id), "pause-key", payload);

    const result = await convexMutation<any>(
      "aiKeys:gatewayPauseGoogleKey",
      {
        ...payload,
        gateway,
      },
      token
    );

    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, {
      error: "KEY_PAUSE_FAILED",
      details: redactSecrets(raw),
    });
  }
};

const handleResume = async (req: IncomingMessage & any, res: ServerResponse & any) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<ModeKeyBody>(req);

    const mode = parseMode(body.mode);
    const keyId = typeof body.keyId === "string" ? body.keyId : "";

    if (!mode || !keyId) {
      sendJson(res, 400, { error: "BAD_REQUEST", details: "Missing mode/keyId" });
      return;
    }

    const payload = { mode, keyId };
    const gateway = buildGatewayEnvelope(String(user._id), "resume-key", payload);

    const result = await convexMutation<any>(
      "aiKeys:gatewayResumeGoogleKey",
      {
        ...payload,
        gateway,
      },
      token
    );

    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, {
      error: "KEY_RESUME_FAILED",
      details: redactSecrets(raw),
    });
  }
};

const handleDelete = async (
  req: IncomingMessage & any,
  res: ServerResponse & any,
  keyIdFromPath: string
) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<ModeKeyBody>(req);

    const mode = parseMode(body.mode);
    const proofToken = typeof body.proofToken === "string" ? body.proofToken : "";
    const keyId = keyIdFromPath?.trim();

    if (!keyId || !mode || !proofToken) {
      sendJson(res, 400, {
        error: "BAD_REQUEST",
        details: "Missing keyId/mode/proofToken",
      });
      return;
    }

    const payload = {
      mode,
      keyId,
      proofToken,
    };

    const gateway = buildGatewayEnvelope(String(user._id), "delete-key", payload);

    const result = await convexMutation<any>(
      "aiKeys:gatewayDeleteGoogleKey",
      {
        ...payload,
        gateway,
      },
      token
    );

    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, {
      error: "KEY_DELETE_FAILED",
      details: redactSecrets(raw),
    });
  }
};

const handleTest = async (req: IncomingMessage & any, res: ServerResponse & any) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<ModeKeyBody>(req);

    const mode = parseMode(body.mode);
    const keyId = typeof body.keyId === "string" ? body.keyId : "";
    const proofToken = typeof body.proofToken === "string" ? body.proofToken : "";

    if (!mode || !keyId || !proofToken) {
      sendJson(res, 400, { error: "BAD_REQUEST", details: "Missing mode/keyId/proofToken" });
      return;
    }

    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!apiKey) {
      const getPayload = { mode, keyId };
      const getGateway = buildGatewayEnvelope(String(user._id), "get-key", getPayload);

      const encrypted = await convexQuery<any>(
        "aiKeys:gatewayGetEncryptedGoogleKey",
        {
          ...getPayload,
          gateway: getGateway,
        },
        token
      );

      apiKey = decryptApiKey({
        ciphertext: encrypted.ciphertext,
        wrappedDek: encrypted.wrappedDek,
      });
    }

    if (!isLikelyApiKey(apiKey)) {
      sendJson(res, 400, { error: "INVALID_API_KEY_FORMAT" });
      return;
    }

    const testResult = await testGoogleApiKey(apiKey);

    const markPayload = {
      mode,
      keyId,
      proofToken,
      ok: testResult.ok,
      errorCode: testResult.ok ? undefined : `HTTP_${testResult.status}`,
      errorMessage: testResult.ok ? undefined : testResult.body,
    };

    const markGateway = buildGatewayEnvelope(String(user._id), "mark-test", markPayload);

    await convexMutation(
      "aiKeys:gatewayMarkGoogleKeyTest",
      {
        ...markPayload,
        gateway: markGateway,
      },
      token
    );

    if (!testResult.ok) {
      sendJson(res, 400, {
        ok: false,
        status: testResult.status,
        details: redactSecrets(testResult.body),
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: testResult.status,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, {
      error: "KEY_TEST_FAILED",
      details: redactSecrets(raw),
    });
  }
};

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: IncomingMessage & any, res: ServerResponse & any) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const segments = getRouteSegments(req);
  const route = segments[0];

  if (!route) {
    sendJson(res, 404, { error: "NOT_FOUND" });
    return;
  }

  if (route === "list") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handleList(req, res);
    return;
  }

  if (route === "session") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handleStore(req, res, "session");
    return;
  }

  if (route === "persistent") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handleStore(req, res, "persistent");
    return;
  }

  if (route === "test") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handleTest(req, res);
    return;
  }

  if (route === "pause") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handlePause(req, res);
    return;
  }

  if (route === "resume") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handleResume(req, res);
    return;
  }

  if (segments.length === 1 && !KNOWN_SINGLE_ROUTES.has(route)) {
    if (req.method !== "DELETE") {
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    await handleDelete(req, res, route);
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
}
