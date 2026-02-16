import { Liveblocks } from "@liveblocks/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type JsonBody = {
  room?: unknown;
};

type ConvexUdfResponse =
  | { status: "success"; value: unknown; logLines?: string[] }
  | { status: "error"; errorMessage: string; errorData?: unknown; logLines?: string[] };

const readJsonBody = async (req: any): Promise<JsonBody> => {
  // Vercel may already parse JSON. If not, fall back to reading the raw stream.
  if (req.body && typeof req.body === "object") return req.body as JsonBody;
  const raw = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  if (!raw) return {};
  return JSON.parse(raw) as JsonBody;
};

const convexQuery = async <T>(
  baseUrl: string,
  path: string,
  args: Record<string, unknown>,
  token?: string | null
): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/api/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path,
      format: "convex_encoded_json",
      args: [args],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Convex query failed (${response.status})`);
  }

  const json = (await response.json()) as ConvexUdfResponse;
  if (json.status === "success") {
    return json.value as T;
  }
  throw new Error(json.errorMessage || "Convex query error");
};

const getBearerToken = (req: any) => {
  const header = String(req.headers?.authorization ?? "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const getGuestId = (req: any) => {
  const raw = req.headers?.["x-reffo-guest-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(cleaned)) return null;
  return cleaned;
};

const decodeJwtSub = (token: string): string | null => {
  // We use Convex as the authoritative validator for the token. This is only to
  // extract the subject to use as the Liveblocks user id.
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
};

const setCors = (req: any, res: any) => {
  const origin = req.headers?.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Reffo-Guest-Id");
};

export const config = {
  // Make it explicit this is a Node serverless function (not Edge).
  runtime: "nodejs",
};

export default async function handler(req: IncomingMessage & any, res: ServerResponse & any) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    const LIVEBLOCKS_SECRET_KEY = process.env.LIVEBLOCKS_SECRET_KEY;
    const CONVEX_URL =
      process.env.CONVEX_URL ||
      process.env.VITE_CONVEX_URL ||
      process.env.VITE_CONVEX_SELF_HOSTED_URL ||
      process.env.CONVEX_SELF_HOSTED_URL;

    if (!LIVEBLOCKS_SECRET_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "LIVEBLOCKS_SECRET_KEY_MISSING" }));
      return;
    }
    if (!CONVEX_URL) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "CONVEX_URL_MISSING" }));
      return;
    }

    let body: JsonBody;
    try {
      body = await readJsonBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "BAD_REQUEST", details: "Invalid JSON body" }));
      return;
    }

    const room = typeof body.room === "string" ? body.room : null;
    if (!room) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "BAD_REQUEST", details: "Missing room parameter" }));
      return;
    }

    const token = getBearerToken(req);

    // Always validate board permissions first. Public mural rooms can be accessed without auth.
    const permissions = await convexQuery<any>(
      CONVEX_URL,
      "boards:getBoardPermissions",
      { boardId: room },
      token
    );

    if (!permissions?.resourceExists) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "NOT_FOUND", details: "Board not found" }));
      return;
    }

    if (!permissions.canRead) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "FORBIDDEN", details: "Access denied" }));
      return;
    }

    const liveblocks = new Liveblocks({ secret: LIVEBLOCKS_SECRET_KEY });

    let liveblocksUserId: string;
    let userName = "Guest";
    let userPicture: string | undefined;

    if (token) {
      const user = await convexQuery<any>(CONVEX_URL, "users:current", {}, token);
      if (!user) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return;
      }
      liveblocksUserId = decodeJwtSub(token) ?? String(user._id);
      userName = user.name ?? user.email ?? "User";
      userPicture = user.avatar ?? undefined;
    } else {
      const guestId = getGuestId(req) ?? randomUUID().replace(/-/g, "");
      liveblocksUserId = `public-${guestId}`;
      userName = "Guest";
      userPicture = undefined;
    }

    const session = liveblocks.prepareSession(liveblocksUserId, {
      userInfo: {
        name: userName,
        picture: userPicture,
      },
    });

    session.allow(room, permissions.canWrite ? session.FULL_ACCESS : session.READ_ACCESS);
    const { status, body: responseBody } = await session.authorize();

    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(responseBody);
  } catch (error) {
    console.error("liveblocks-auth failed", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error: "LIVEBLOCKS_AUTH_FAILED",
        details: error instanceof Error ? error.message : "Unknown error",
      })
    );
  }
}
