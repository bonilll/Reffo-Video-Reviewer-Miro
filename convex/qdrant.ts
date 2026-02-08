"use node";

import { internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const getConfig = () => {
  // NOTE: read env lazily so `convex codegen` doesn't fail if env isn't configured yet.
  const url = process.env.QDRANT_URL;
  if (!url) throw new ConvexError("Missing environment variable QDRANT_URL");
  return {
    url: url.replace(/\/$/, ""),
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION ?? "assets_embeddings",
  };
};

const qdrantFetch = async (path: string, init: RequestInit) => {
  const cfg = getConfig();
  const url = `${cfg.url}${path}`;
  const headers = new Headers(init.headers ?? undefined);
  headers.set("Content-Type", "application/json");
  if (cfg.apiKey) headers.set("api-key", cfg.apiKey);

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const details =
      (json && (json.status?.error ?? json.status?.message)) ||
      text ||
      response.statusText;
    throw new ConvexError(`QDRANT_${response.status}: ${details}`);
  }
  return json;
};

export const upsertPoint = internalAction({
  args: {
    // Use assetId as point id for stability. Store the same value as embeddingRef in Convex.
    id: v.string(),
    vector: v.array(v.number()),
    payload: v.optional(v.any()),
    // If true, waits for the upsert to be durably applied before returning.
    wait: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const { collection } = getConfig();
    const body = {
      points: [
        {
          id: args.id,
          vector: args.vector,
          payload: args.payload ?? {},
        },
      ],
    };
    const wait = args.wait ?? true;
    await qdrantFetch(
      `/collections/${encodeURIComponent(collection)}/points?wait=${wait ? "true" : "false"}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    return { embeddingRef: args.id };
  },
});

export const deletePoint = internalAction({
  args: {
    id: v.string(),
    wait: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const { collection } = getConfig();
    const wait = args.wait ?? true;
    const body = { points: [args.id] };
    await qdrantFetch(
      `/collections/${encodeURIComponent(collection)}/points/delete?wait=${wait ? "true" : "false"}`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return { deleted: true };
  },
});

export const recommendById = internalAction({
  args: {
    id: v.string(),
    limit: v.optional(v.number()),
    filter: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const { collection } = getConfig();
    const body = {
      positive: [args.id],
      limit: args.limit ?? 12,
      with_payload: true,
      filter: args.filter,
    };
    const result = await qdrantFetch(
      `/collections/${encodeURIComponent(collection)}/points/recommend`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const points = (result?.result ?? []) as Array<{
      id: string;
      score: number;
      payload?: any;
    }>;
    return points;
  },
});

export const searchByVector = internalAction({
  args: {
    vector: v.array(v.number()),
    limit: v.optional(v.number()),
    filter: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const { collection } = getConfig();
    const body = {
      vector: args.vector,
      limit: args.limit ?? 12,
      with_payload: true,
      filter: args.filter,
    };
    const result = await qdrantFetch(
      `/collections/${encodeURIComponent(collection)}/points/search`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const points = (result?.result ?? []) as Array<{
      id: string;
      score: number;
      payload?: any;
    }>;
    return points;
  },
});
