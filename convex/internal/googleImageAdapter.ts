"use node";

import type { NanoBananaNodeConfig } from "../googleImageModelRegistry";

type ResolvedNanoBananaInput = {
  prompt: string;
  references: Array<{
    mimeType?: string;
    base64Data?: string;
    fileUri?: string;
  }>;
  config: NanoBananaNodeConfig;
};

type GoogleGeneratePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

type GoogleGenerateRequest = {
  contents: Array<{
    role: "user";
    parts: GoogleGeneratePart[];
  }>;
  generationConfig: {
    responseModalities: string[];
    imageConfig: {
      imageSize: string;
      aspectRatio: string;
    };
  };
  tools?: Array<Record<string, unknown>>;
};

export type ParsedGoogleImageOutput = {
  images: Array<{
    mimeType: string;
    base64Data?: string;
    fileUri?: string;
  }>;
  textParts: string[];
  finishReasons: string[];
  blockReason?: string;
};

const toGoogleImageSize = (size: string) => {
  if (size === "512") return "512px";
  if (size === "2K") return "2K";
  if (size === "4K") return "4K";
  return "1K";
};

const toResponseModalities = (mode: NanoBananaNodeConfig["responseMode"]) =>
  mode === "text_and_image" ? ["TEXT", "IMAGE"] : ["IMAGE"];

export const buildGoogleInteractiveGenerateRequest = (
  input: ResolvedNanoBananaInput
): GoogleGenerateRequest => {
  const parts: GoogleGeneratePart[] = [{ text: input.prompt }];

  for (const reference of input.references) {
    if (reference.fileUri) {
      parts.push({
        fileData: {
          fileUri: reference.fileUri,
          mimeType: reference.mimeType || "image/jpeg",
        },
      });
      continue;
    }

    if (reference.base64Data) {
      parts.push({
        inlineData: {
          mimeType: reference.mimeType || "image/jpeg",
          data: reference.base64Data,
        },
      });
    }
  }

  const request: GoogleGenerateRequest = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: toResponseModalities(input.config.responseMode),
      imageConfig: {
        imageSize: toGoogleImageSize(input.config.imageSize),
        aspectRatio: input.config.aspectRatio,
      },
    },
  };

  if (input.config.enableSearchGrounding) {
    request.tools = [{ googleSearch: {} }];
  }

  return request;
};

export const parseGoogleInteractiveResponse = (payload: any): ParsedGoogleImageOutput => {
  const root = payload?.response ?? payload;
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const images: ParsedGoogleImageOutput["images"] = [];
  const textParts: string[] = [];
  const finishReasons: string[] = [];
  const blockReason =
    typeof root?.promptFeedback?.blockReason === "string"
      ? root.promptFeedback.blockReason
      : typeof root?.prompt_feedback?.block_reason === "string"
        ? root.prompt_feedback.block_reason
        : undefined;

  for (const candidate of candidates) {
    const finishReason =
      typeof candidate?.finishReason === "string"
        ? candidate.finishReason
        : typeof candidate?.finish_reason === "string"
          ? candidate.finish_reason
          : null;
    if (finishReason && !finishReasons.includes(finishReason)) {
      finishReasons.push(finishReason);
    }

    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        textParts.push(part.text);
      }

      const inlineData = part?.inlineData ?? part?.inline_data;
      if (inlineData?.data) {
        images.push({
          mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
          base64Data: String(inlineData.data),
        });
      }

      const fileData = part?.fileData ?? part?.file_data;
      const fileUri = typeof fileData?.fileUri === "string"
        ? fileData.fileUri
        : typeof fileData?.file_uri === "string"
          ? fileData.file_uri
          : null;
      if (fileUri) {
        images.push({
          mimeType: fileData?.mimeType || fileData?.mime_type || "image/png",
          fileUri,
        });
      }
    }
  }

  return {
    images,
    textParts,
    finishReasons,
    blockReason,
  };
};
