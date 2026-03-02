import type { IncomingMessage, ServerResponse } from "node:http";
import { buildGatewayEnvelope, redactSecrets } from "../../../lib/server/ai-key-security";
import { convexMutation, readJsonBody, requireAuthenticatedUser, sendJson, setCors } from "../../../lib/server/convex-gateway";

type Body = {
  mode?: unknown;
  keyId?: unknown;
  reason?: unknown;
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

    const mode = body.mode === "session" ? "session" : body.mode === "persistent" ? "persistent" : null;
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
}
