import type { IncomingMessage, ServerResponse } from "node:http";
import { buildGatewayEnvelope, redactSecrets } from "../../../lib/server/ai-key-security";
import { convexMutation, readJsonBody, requireAuthenticatedUser, sendJson, setCors } from "../../../lib/server/convex-gateway";

type Body = {
  mode?: unknown;
  proofToken?: unknown;
};

const getKeyIdFromRequest = (req: IncomingMessage & any) => {
  const fromQuery = typeof req.query?.keyId === "string" ? req.query.keyId : null;
  if (fromQuery) return fromQuery;

  const rawUrl = typeof req.url === "string" ? req.url : "";
  const url = new URL(rawUrl, "http://localhost");
  const chunks = url.pathname.split("/").filter(Boolean);
  return chunks[chunks.length - 1] ?? null;
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

  if (req.method !== "DELETE") {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const { token, user } = await requireAuthenticatedUser(req);
    const body = await readJsonBody<Body>(req);

    const keyId = getKeyIdFromRequest(req);
    const mode = body.mode === "session" ? "session" : body.mode === "persistent" ? "persistent" : null;
    const proofToken = typeof body.proofToken === "string" ? body.proofToken : "";

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
}
