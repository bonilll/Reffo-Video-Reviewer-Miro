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
    base64Data: string;
  }>;
  textParts: string[];
};

const toGoogleImageSize = (size: string) => {
  if (size === "512") return "IMAGE_SIZE_512";
  if (size === "2K") return "IMAGE_SIZE_2K";
  if (size === "4K") return "IMAGE_SIZE_4K";
  return "IMAGE_SIZE_1K";
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
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const images: ParsedGoogleImageOutput["images"] = [];
  const textParts: string[] = [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        textParts.push(part.text);
      }
      if (part?.inlineData?.data) {
        images.push({
          mimeType: part.inlineData.mimeType || "image/png",
          base64Data: String(part.inlineData.data),
        });
      }
    }
  }

  return {
    images,
    textParts,
  };
};
