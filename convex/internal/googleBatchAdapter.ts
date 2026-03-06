"use node";

import type { NanoBananaNodeConfig } from "../googleImageModelRegistry";
import { buildGoogleInteractiveGenerateRequest } from "./googleImageAdapter";

export type NanoBananaBatchLineInput = {
  id: string;
  prompt: string;
  references: Array<{
    mimeType?: string;
    base64Data?: string;
    fileUri?: string;
  }>;
  config: NanoBananaNodeConfig;
};

const BATCH_METHOD = "models.generateContent";

const toBatchMethodPath = (modelId: string) => `models/${modelId}:generateContent`;

export const buildNanoBananaBatchJsonlLine = (line: NanoBananaBatchLineInput) => {
  const body = buildGoogleInteractiveGenerateRequest({
    prompt: line.prompt,
    references: line.references,
    config: line.config,
  });

  return JSON.stringify({
    id: line.id,
    request: {
      method: BATCH_METHOD,
      path: toBatchMethodPath(line.config.modelId),
      body,
    },
  });
};

export const buildNanoBananaBatchJsonl = (lines: NanoBananaBatchLineInput[]) =>
  lines.map((line) => buildNanoBananaBatchJsonlLine(line)).join("\n");

export const parseGoogleBatchTerminalStatus = (status: string | undefined) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCEEDED") return "succeeded" as const;
  if (normalized === "FAILED") return "failed" as const;
  if (normalized === "CANCELLED") return "canceled" as const;
  if (normalized === "EXPIRED") return "expired" as const;
  return "running" as const;
};
