import type { IncomingMessage, ServerResponse } from "node:http";
import { buildGatewayEnvelope, encryptApiKey, isLikelyApiKey, redactSecrets } from "../../../lib/server/ai-key-security";
import { convexMutation, readJsonBody, requireAuthenticatedUser, sendJson, setCors } from "../../../lib/server/convex-gateway";

type Body = {
  apiKey?: unknown;
  label?: unknown;
  proofToken?: unknown;
  expiresInHours?: unknown;
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

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<Body>(req);

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
    const hoursRaw = typeof body.expiresInHours === "number" ? body.expiresInHours : 8;
    const expiresInHours = Math.min(24, Math.max(1, Math.floor(hoursRaw)));

    const encrypted = encryptApiKey(apiKey);
    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;

    const payload = {
      mode: "session",
      label,
      ...encrypted,
      expiresAt,
      proofToken,
    };

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
      error: "KEY_SESSION_SAVE_FAILED",
      details: redactSecrets(raw),
    });
  }
}
