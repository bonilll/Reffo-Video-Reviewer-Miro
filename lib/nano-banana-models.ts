import type {
  GoogleImageModelId,
  NanoBananaImageSize,
  NanoBananaResponseMode,
  NanoBananaRunMode,
} from "@/types/ai-subnetwork";

export type NanoBananaModelCapability = {
  id: GoogleImageModelId;
  label: string;
  imageSizes: NanoBananaImageSize[];
  aspectRatios: string[];
  maxReferences: number;
  supportsSearchGrounding: boolean;
  recommendedReferenceWarningThreshold: number;
};

export const NANO_BANANA_DEFAULT_MODEL_ID: GoogleImageModelId = "gemini-3.1-flash-image-preview";

export const NANO_BANANA_CAPABILITIES: Record<GoogleImageModelId, NanoBananaModelCapability> = {
  "gemini-2.5-flash-image": {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    imageSizes: ["1K"],
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    maxReferences: 3,
    supportsSearchGrounding: false,
    recommendedReferenceWarningThreshold: 3,
  },
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Image (Preview)",
    imageSizes: ["512", "1K", "2K", "4K"],
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1"],
    maxReferences: 14,
    supportsSearchGrounding: true,
    recommendedReferenceWarningThreshold: 10,
  },
  "gemini-3-pro-image-preview": {
    id: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image (Preview)",
    imageSizes: ["1K", "2K", "4K"],
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    maxReferences: 14,
    supportsSearchGrounding: true,
    recommendedReferenceWarningThreshold: 10,
  },
};

export const NANO_BANANA_MODEL_OPTIONS = Object.values(NANO_BANANA_CAPABILITIES);

const LEGACY_RESOLUTION_TO_SIZE: Record<string, NanoBananaImageSize> = {
  "1024x1024": "1K",
  "1536x1024": "1K",
  "1024x1536": "1K",
};

export type NanoBananaUiConfig = {
  modelId: GoogleImageModelId;
  runMode: NanoBananaRunMode;
  responseMode: NanoBananaResponseMode;
  imageSize: NanoBananaImageSize;
  aspectRatio: string;
  enableSearchGrounding: boolean;
  legacy?: Record<string, unknown>;
};

export const normalizeNanoBananaUiConfig = (input: any): NanoBananaUiConfig => {
  const modelId =
    typeof input?.modelId === "string" && input.modelId in NANO_BANANA_CAPABILITIES
      ? (input.modelId as GoogleImageModelId)
      : NANO_BANANA_DEFAULT_MODEL_ID;
  const capability = NANO_BANANA_CAPABILITIES[modelId];

  const runMode: NanoBananaRunMode = input?.runMode === "batch" ? "batch" : "interactive";
  const responseMode: NanoBananaResponseMode =
    input?.responseMode === "text_and_image" ? "text_and_image" : "image_only";

  const legacySize =
    typeof input?.resolution === "string"
      ? LEGACY_RESOLUTION_TO_SIZE[String(input.resolution).toLowerCase()]
      : undefined;
  const rawImageSize = typeof input?.imageSize === "string" ? input.imageSize.trim() : "";
  const normalizedImageSize =
    rawImageSize.toLowerCase() === "512px"
      ? "512"
      : rawImageSize.toUpperCase() === "1K"
        ? "1K"
        : rawImageSize.toUpperCase() === "2K"
          ? "2K"
          : rawImageSize.toUpperCase() === "4K"
            ? "4K"
            : rawImageSize;
  const imageSizeCandidate = (
    normalizedImageSize ||
    legacySize ||
    capability.imageSizes[0]
  ) as NanoBananaImageSize;
  const imageSize = capability.imageSizes.includes(imageSizeCandidate)
    ? imageSizeCandidate
    : capability.imageSizes[0];

  const aspectRatioCandidate = typeof input?.aspectRatio === "string" ? input.aspectRatio : "";
  const aspectRatio = capability.aspectRatios.includes(aspectRatioCandidate)
    ? aspectRatioCandidate
    : capability.aspectRatios[0];

  const enableSearchGrounding = capability.supportsSearchGrounding
    ? Boolean(input?.enableSearchGrounding)
    : false;

  const hasLegacyFields =
    typeof input?.resolution === "string" ||
    typeof input?.variations === "number" ||
    typeof input?.stylePreset === "string";

  return {
    modelId,
    runMode,
    responseMode,
    imageSize,
    aspectRatio,
    enableSearchGrounding,
    legacy: hasLegacyFields
      ? {
          resolution: input?.resolution,
          variations: input?.variations,
          stylePreset: input?.stylePreset,
        }
      : undefined,
  };
};

export const normalizeSubnetworkNodeType = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "nano_banana_pro") return "nano_banana";
  return normalized;
};
