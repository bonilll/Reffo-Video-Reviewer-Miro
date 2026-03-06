"use node";

import type { GoogleImageModelId, NanoBananaNodeConfig } from "../googleImageModelRegistry";
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

export const buildNanoBananaBatchJsonlLine = (line: NanoBananaBatchLineInput) => {
  const request = buildGoogleInteractiveGenerateRequest({
    prompt: line.prompt,
    references: line.references,
    config: line.config,
  });

  return JSON.stringify({
    key: line.id,
    request,
  });
};

export const buildNanoBananaBatchJsonl = (lines: NanoBananaBatchLineInput[]) =>
  lines.map((line) => buildNanoBananaBatchJsonlLine(line)).join("\n");

export const parseGoogleBatchTerminalStatus = (status: string | undefined) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCEEDED" || normalized === "JOB_STATE_SUCCEEDED") return "succeeded" as const;
  if (normalized === "FAILED" || normalized === "JOB_STATE_FAILED") return "failed" as const;
  if (normalized === "CANCELLED" || normalized === "JOB_STATE_CANCELLED") return "canceled" as const;
  if (normalized === "EXPIRED" || normalized === "JOB_STATE_EXPIRED") return "expired" as const;
  return "running" as const;
};

export const buildGoogleBatchCreatePayload = (params: {
  model: GoogleImageModelId;
  srcFileName: string;
  destFileName?: string;
}) => ({
  model: `models/${params.model}`,
  src: {
    fileName: params.srcFileName,
  },
  config: {
    dest: {
      fileName: params.destFileName ?? "results.jsonl",
    },
  },
});
