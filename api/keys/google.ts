import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildGatewayEnvelope,
  decryptApiKey,
  encryptApiKey,
  hashProofToken,
  isLikelyApiKey,
  newProofToken,
  redactSecrets,
} from "../../lib/server/ai-key-security.js";
import {
  convexMutation,
  convexQuery,
  decodeJwtPayload,
  getClientIp,
  getUserAgent,
  readJsonBody,
  requireAuthenticatedUser,
  sendJson,
  setCors,
} from "../../lib/server/convex-gateway.js";

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

type StepUpBody = {
  action?: unknown;
  confirmation?: unknown;
};

const ALLOWED_STEPUP_ACTIONS = new Set(["key:add", "key:delete", "key:test"]);

const parseMode = (mode: unknown): GoogleKeyMode | null => {
  if (mode === "session") return "session";
  if (mode === "persistent") return "persistent";
  return null;
};

const getOperation = (req: IncomingMessage & any) => {
  const rawUrl = typeof req.url === "string" ? req.url : "";
  const url = new URL(rawUrl, "http://localhost");
  return (url.searchParams.get("op") ?? "").trim().toLowerCase();
};

const sessionIsRecentEnough = (token: string) => {
  const payload = decodeJwtPayload(token);
  const iat = typeof payload?.iat === "number" ? payload.iat : null;
  if (!iat) return false;
  const ageMs = Date.now() - iat * 1000;
  return ageMs <= 15 * 60 * 1000;
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

const handleStepUp = async (req: IncomingMessage & any, res: ServerResponse & any) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<StepUpBody>(req);

    const action = typeof body.action === "string" ? body.action : "key:add";
    if (!ALLOWED_STEPUP_ACTIONS.has(action)) {
      sendJson(res, 400, { error: "INVALID_ACTION" });
      return;
    }

    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
    if (confirmation !== "CONFIRM") {
      const failPayload = {
        action,
        ipAddress: getClientIp(req) ?? undefined,
        userAgent: getUserAgent(req) ?? undefined,
        reason: "CONFIRMATION_MISMATCH",
      };

      const failGateway = buildGatewayEnvelope(String(user._id), "failed-stepup", failPayload);
      await convexMutation(
        "aiKeys:gatewayRecordFailedStepUp",
        {
          ...failPayload,
          gateway: failGateway,
        },
        token
      ).catch(() => undefined);

      sendJson(res, 401, {
        error: "STEP_UP_VALIDATION_FAILED",
        details: "Type CONFIRM to proceed.",
      });
      return;
    }

    if (!sessionIsRecentEnough(token)) {
      sendJson(res, 401, {
        error: "STEP_UP_REAUTH_REQUIRED",
        details: "Session older than 15 minutes. Please sign in again.",
      });
      return;
    }

    const proofToken = newProofToken();
    const tokenHash = hashProofToken(proofToken);
    const expiresAt = Date.now() + 5 * 60 * 1000;

    const payload = {
      action,
      tokenHash,
      expiresAt,
      ipAddress: getClientIp(req) ?? undefined,
      userAgent: getUserAgent(req) ?? undefined,
    };

    const gateway = buildGatewayEnvelope(String(user._id), "issue-stepup", payload);

    await convexMutation(
      "aiKeys:gatewayIssueStepUpProof",
      {
        ...payload,
        gateway,
      },
      token
    );

    sendJson(res, 200, {
      ok: true,
      action,
      proofToken,
      expiresAt,
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

const handleDelete = async (req: IncomingMessage & any, res: ServerResponse & any) => {
  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<ModeKeyBody>(req);

    const mode = parseMode(body.mode);
    const proofToken = typeof body.proofToken === "string" ? body.proofToken : "";
    const keyId = typeof body.keyId === "string" ? body.keyId.trim() : "";

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

  const op = getOperation(req);

  if (req.method === "GET") {
    if (!op || op === "list") {
      await handleList(req, res);
      return;
    }
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  if (op === "stepup") {
    await handleStepUp(req, res);
    return;
  }

  if (op === "session") {
    await handleStore(req, res, "session");
    return;
  }

  if (op === "persistent") {
    await handleStore(req, res, "persistent");
    return;
  }

  if (op === "test") {
    await handleTest(req, res);
    return;
  }

  if (op === "pause") {
    await handlePause(req, res);
    return;
  }

  if (op === "resume") {
    await handleResume(req, res);
    return;
  }

  if (op === "delete") {
    await handleDelete(req, res);
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
}
