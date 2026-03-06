import type { IncomingMessage, ServerResponse } from "node:http";
import {
  convexMutation,
  decodeJwtPayload,
  getClientIp,
  getUserAgent,
  readJsonBody,
  requireAuthenticatedUser,
  sendJson,
  setCors,
} from "../../../lib/server/convex-gateway.js";
import { buildGatewayEnvelope, hashProofToken, newProofToken } from "../../../lib/server/ai-key-security.js";

type StepUpRequest = {
  action?: unknown;
  confirmation?: unknown;
};

const ALLOWED_ACTIONS = new Set(["key:add", "key:delete", "key:test"]);

const sessionIsRecentEnough = (token: string) => {
  const payload = decodeJwtPayload(token);
  const iat = typeof payload?.iat === "number" ? payload.iat : null;
  if (!iat) return false;

  const ageMs = Date.now() - iat * 1000;
  return ageMs <= 15 * 60 * 1000;
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
    const body = await readJsonBody<StepUpRequest>(req);

    const action = typeof body.action === "string" ? body.action : "key:add";
    if (!ALLOWED_ACTIONS.has(action)) {
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
}
