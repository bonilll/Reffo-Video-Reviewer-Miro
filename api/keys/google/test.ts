import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildGatewayEnvelope,
  decryptApiKey,
  isLikelyApiKey,
  redactSecrets,
} from "../../../lib/server/ai-key-security";
import {
  convexMutation,
  convexQuery,
  readJsonBody,
  requireAuthenticatedUser,
  sendJson,
  setCors,
} from "../../../lib/server/convex-gateway";

type Body = {
  mode?: unknown;
  keyId?: unknown;
  proofToken?: unknown;
  apiKey?: unknown;
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
}
