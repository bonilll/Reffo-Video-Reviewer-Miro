import type { IncomingMessage, ServerResponse } from "node:http";

type ConvexUdfResponse =
  | { status: "success"; value: unknown; logLines?: string[] }
  | { status: "error"; errorMessage: string; errorData?: unknown; logLines?: string[] };

const getConvexUrl = () => {
  const value =
    process.env.CONVEX_URL ||
    process.env.VITE_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_SELF_HOSTED_URL ||
    process.env.VITE_CONVEX_SELF_HOSTED_URL;

  if (!value) {
    throw new Error("CONVEX_URL_MISSING");
  }
  return value;
};

export const getBearerToken = (req: IncomingMessage & any) => {
  const raw = String(req.headers?.authorization ?? "");
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

export const readJsonBody = async <T = any>(req: IncomingMessage & any): Promise<T> => {
  if (req.body && typeof req.body === "object") return req.body as T;

  const raw = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (data.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
};

export const setCors = (req: IncomingMessage & any, res: ServerResponse & any) => {
  const origin = req.headers?.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

export const sendJson = (res: ServerResponse & any, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const convexCall = async <T>(
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
  token: string
): Promise<T> => {
  const convexUrl = getConvexUrl();
  const response = await fetch(`${convexUrl}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      path,
      format: "convex_encoded_json",
      args: [args],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Convex ${kind} failed (${response.status})`);
  }

  const json = (await response.json()) as ConvexUdfResponse;
  if (json.status === "success") {
    return json.value as T;
  }

  throw new Error(json.errorMessage || `Convex ${kind} error`);
};

export const convexQuery = async <T>(
  path: string,
  args: Record<string, unknown>,
  token: string
) => convexCall<T>("query", path, args, token);

export const convexMutation = async <T>(
  path: string,
  args: Record<string, unknown>,
  token: string
) => convexCall<T>("mutation", path, args, token);

export const requireAuthenticatedUser = async (req: IncomingMessage & any) => {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const user = await convexQuery<any>("users:current", {}, token);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return { token, user };
};

export const getClientIp = (req: IncomingMessage & any) => {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.split(",")[0]?.trim() ?? null;
  }
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  const realIp = req.headers?.["x-real-ip"];
  if (Array.isArray(realIp)) return realIp[0] ?? null;
  if (typeof realIp === "string") return realIp;
  return null;
};

export const getUserAgent = (req: IncomingMessage & any) => {
  const userAgent = req.headers?.["user-agent"];
  if (Array.isArray(userAgent)) return userAgent[0] ?? null;
  if (typeof userAgent === "string") return userAgent;
  return null;
};

export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};
