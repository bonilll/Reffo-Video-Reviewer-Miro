import type { IncomingMessage, ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type LinkPreviewRequestBody = {
  url?: unknown;
};

type LinkPreviewResponse = {
  kind: "youtube" | "web";
  url: string;
  embedUrl?: string;
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  domain?: string;
  provider?: string;
};

const MAX_HTML_BYTES = 512_000;

const readJsonBody = async (req: IncomingMessage & any): Promise<LinkPreviewRequestBody> => {
  if (req.body && typeof req.body === "object") return req.body as LinkPreviewRequestBody;
  const raw = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (data.length > 32_000) {
        // Enough for this endpoint; prevent oversized body abuse.
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  if (!raw) return {};
  return JSON.parse(raw) as LinkPreviewRequestBody;
};

const setCors = (req: IncomingMessage & any, res: ServerResponse & any) => {
  const origin = req.headers?.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const isPrivateIpv4 = (ip: string) => {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 0) return true;
  return false;
};

const isPrivateIpv6 = (ip: string) => {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
};

const assertSafeTargetUrl = async (targetUrl: URL) => {
  if (!/^https?:$/.test(targetUrl.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  const hostname = targetUrl.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Localhost URLs are not allowed");
  }

  const literalIpVersion = isIP(hostname);
  if (literalIpVersion === 4 && isPrivateIpv4(hostname)) {
    throw new Error("Private network targets are not allowed");
  }
  if (literalIpVersion === 6 && isPrivateIpv6(hostname)) {
    throw new Error("Private network targets are not allowed");
  }

  if (!literalIpVersion) {
    const records = await lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) {
        throw new Error("Resolved private IPv4 address is not allowed");
      }
      if (record.family === 6 && isPrivateIpv6(record.address)) {
        throw new Error("Resolved private IPv6 address is not allowed");
      }
    }
  }
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const stripTags = (value: string) => decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const parseMetaTags = (html: string) => {
  const tags = Array.from(html.matchAll(/<meta\b[^>]*>/gi)).map((match) => match[0]);
  const entries: Array<Record<string, string>> = [];

  for (const tag of tags) {
    const attrs: Record<string, string> = {};
    for (const attrMatch of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const key = attrMatch[1].toLowerCase();
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? "";
      attrs[key] = decodeHtmlEntities(value.trim());
    }
    entries.push(attrs);
  }

  const getMeta = (...keys: string[]) => {
    for (const key of keys) {
      const keyLower = key.toLowerCase();
      const found = entries.find(
        (entry) => entry.property?.toLowerCase() === keyLower || entry.name?.toLowerCase() === keyLower
      );
      const content = found?.content?.trim();
      if (content) return content;
    }
    return undefined;
  };

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : undefined;

  return {
    title: getMeta("og:title", "twitter:title") || title,
    description: getMeta("og:description", "twitter:description", "description"),
    imageUrl: getMeta("og:image", "twitter:image", "twitter:image:src"),
    siteName: getMeta("og:site_name", "application-name"),
  };
};

const parseYouTubeVideoId = (url: URL): string | null => {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  if (hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
  }

  if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "music.youtube.com") {
    if (url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      return v && /^[a-zA-Z0-9_-]{6,20}$/.test(v) ? v : null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
      const id = parts[1];
      return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
    }
  }

  return null;
};

const fetchYouTubeOEmbedTitle = async (targetUrl: string) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }
      );
      if (!response.ok) return undefined;
      const json = (await response.json()) as { title?: unknown; author_name?: unknown };
      return {
        title: typeof json.title === "string" ? json.title : undefined,
        author: typeof json.author_name === "string" ? json.author_name : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return undefined;
  }
};

const buildYouTubePreview = async (targetUrl: URL): Promise<LinkPreviewResponse | null> => {
  const videoId = parseYouTubeVideoId(targetUrl);
  if (!videoId) return null;

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembed = await fetchYouTubeOEmbedTitle(canonicalUrl);

  return {
    kind: "youtube",
    url: canonicalUrl,
    embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
    imageUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    title: oembed?.title || "YouTube Video",
    siteName: "YouTube",
    provider: "YouTube",
    domain: "youtube.com",
    description: oembed?.author,
  };
};

const buildWebPreview = async (targetUrl: URL): Promise<LinkPreviewResponse> => {
  await assertSafeTargetUrl(targetUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ReffoLinkPreviewBot/1.0; +https://reffo.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const finalUrl = new URL(response.url || targetUrl.toString());
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("text/html")) {
      return {
        kind: "web",
        url: finalUrl.toString(),
        title: finalUrl.hostname,
        siteName: finalUrl.hostname.replace(/^www\./, ""),
        domain: finalUrl.hostname.replace(/^www\./, ""),
      };
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const meta = parseMetaTags(html);

    let imageUrl: string | undefined;
    if (meta.imageUrl) {
      try {
        imageUrl = new URL(meta.imageUrl, finalUrl).toString();
      } catch {
        imageUrl = meta.imageUrl;
      }
    }

    return {
      kind: "web",
      url: finalUrl.toString(),
      title: meta.title || finalUrl.hostname,
      description: meta.description,
      siteName: meta.siteName || finalUrl.hostname.replace(/^www\./, ""),
      imageUrl,
      domain: finalUrl.hostname.replace(/^www\./, ""),
      provider: finalUrl.hostname.replace(/^www\./, ""),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const config = {
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

    let body: LinkPreviewRequestBody;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "BAD_REQUEST",
          details: error instanceof Error ? error.message : "Invalid JSON",
        })
      );
      return;
    }

    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "URL_REQUIRED" }));
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "INVALID_URL" }));
      return;
    }

    const youtubePreview = await buildYouTubePreview(targetUrl);
    const preview = youtubePreview ?? (await buildWebPreview(targetUrl));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.end(JSON.stringify({ ok: true, preview }));
  } catch (error) {
    console.error("link-preview failed", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error: "LINK_PREVIEW_FAILED",
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
