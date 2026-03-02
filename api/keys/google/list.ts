import type { IncomingMessage, ServerResponse } from "node:http";
import { convexMutation, convexQuery, requireAuthenticatedUser, sendJson, setCors } from "../../../lib/server/convex-gateway";

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

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

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
}
