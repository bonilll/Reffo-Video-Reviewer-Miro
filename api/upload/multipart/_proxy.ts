import type { IncomingMessage, ServerResponse } from "node:http";

const readJsonBody = async (req: IncomingMessage & any): Promise<Record<string, unknown>> => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      return req.body ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString("utf8");
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    }
    if (typeof req.body === "object") {
      return req.body as Record<string, unknown>;
    }
  }
  const raw = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
};

const setCors = (req: IncomingMessage & any, res: ServerResponse & any) => {
  const origin = req.headers?.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const getTargetBase = () => {
  const base =
    process.env.CONVEX_HTTP_URL ||
    process.env.CONVEX_URL ||
    process.env.VITE_CONVEX_HTTP_URL ||
    process.env.VITE_CONVEX_SELF_HOSTED_URL ||
    process.env.CONVEX_SELF_HOSTED_URL ||
    process.env.VITE_CONVEX_URL ||
    "";
  if (!base) return "";
  return base.includes(".convex.cloud") ? base.replace(".convex.cloud", ".convex.site") : base;
};

export const config = {
  runtime: "nodejs",
};

export const proxyMultipart = async (
  req: IncomingMessage & any,
  res: ServerResponse & any,
  path: string
) => {
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

    const base = getTargetBase();
    if (!base) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "CONVEX_URL_MISSING" }));
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "BAD_REQUEST",
          details: error instanceof Error ? error.message : "Invalid JSON body",
        })
      );
      return;
    }

    const targetUrl = `${base}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (req.headers?.authorization) {
      headers.Authorization = String(req.headers.authorization);
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    res.statusCode = response.status;
    res.setHeader("Content-Type", response.headers.get("content-type") ?? "application/json");
    res.end(text);
  } catch (error) {
    console.error("upload multipart proxy failed", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "PROXY_FAILED",
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
};
