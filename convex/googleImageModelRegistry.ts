import { ConvexError } from "convex/values";

export type GoogleImageModelId =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview";

export type NanoBananaRunMode = "interactive" | "batch";
export type NanoBananaResponseMode = "image_only" | "text_and_image";
export type NanoBananaImageSize = "512" | "1K" | "2K" | "4K";

export type NanoBananaNodeConfig = {
  modelId: GoogleImageModelId;
  runMode: NanoBananaRunMode;
  responseMode: NanoBananaResponseMode;
  aspectRatio: string;
  imageSize: NanoBananaImageSize;
  enableSearchGrounding: boolean;
  legacy?: Record<string, unknown>;
};

export type GoogleImageModelCapability = {
  id: GoogleImageModelId;
  label: string;
  maxReferences: number;
  aspectRatios: string[];
  imageSizes: NanoBananaImageSize[];
  supportsSearchGrounding: boolean;
  preview: boolean;
  recommendedReferenceWarningThreshold: number;
};

const DEFAULT_MODEL_ID: GoogleImageModelId = "gemini-3.1-flash-image-preview";
const DEFAULT_RUN_MODE: NanoBananaRunMode = "interactive";
const DEFAULT_RESPONSE_MODE: NanoBananaResponseMode = "image_only";

const MODEL_CAPABILITIES: Record<GoogleImageModelId, GoogleImageModelCapability> = {
  "gemini-2.5-flash-image": {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    maxReferences: 3,
    imageSizes: ["1K"],
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    supportsSearchGrounding: false,
    preview: false,
    recommendedReferenceWarningThreshold: 3,
  },
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Image (Preview)",
    maxReferences: 14,
    imageSizes: ["512", "1K", "2K", "4K"],
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1"],
    supportsSearchGrounding: false,
    preview: true,
    recommendedReferenceWarningThreshold: 10,
  },
  "gemini-3-pro-image-preview": {
    id: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image (Preview)",
    maxReferences: 14,
    imageSizes: ["1K", "2K", "4K"],
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    supportsSearchGrounding: true,
    preview: true,
    recommendedReferenceWarningThreshold: 10,
  },
};

const LEGACY_RESOLUTION_TO_SIZE: Record<string, NanoBananaImageSize> = {
  "1024x1024": "1K",
  "1536x1024": "1K",
  "1024x1536": "1K",
};

const normalizeToLower = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isTruthyValue = (value: unknown) => {
  const normalized = normalizeToLower(value);
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const NANO_BANANA_CANONICAL_NODE_TYPE = "nano_banana";
export const NANO_BANANA_LEGACY_NODE_TYPE = "nano_banana_pro";

export const normalizeNanoNodeType = (value: string) => {
  const normalized = normalizeToLower(value);
  if (normalized === NANO_BANANA_LEGACY_NODE_TYPE) return NANO_BANANA_CANONICAL_NODE_TYPE;
  return normalized;
};

export const isAiGoogleBatchEnabledServer = () => {
  const raw = process.env.AI_GOOGLE_BATCH_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  return isTruthyValue(raw);
};

export const listGoogleImageModels = (): GoogleImageModelCapability[] =>
  Object.values(MODEL_CAPABILITIES);

export const getGoogleImageModelCapability = (
  modelId: GoogleImageModelId
): GoogleImageModelCapability => MODEL_CAPABILITIES[modelId];

export const isGoogleImageModelId = (value: unknown): value is GoogleImageModelId => {
  const normalized = normalizeToLower(value);
  return normalized in MODEL_CAPABILITIES;
};

export const normalizeGoogleImageModelId = (value: unknown): GoogleImageModelId => {
  const normalized = normalizeToLower(value);
  if (normalized in MODEL_CAPABILITIES) {
    return normalized as GoogleImageModelId;
  }
  return DEFAULT_MODEL_ID;
};

export const defaultNanoBananaConfig = (): NanoBananaNodeConfig => ({
  modelId: DEFAULT_MODEL_ID,
  runMode: DEFAULT_RUN_MODE,
  responseMode: DEFAULT_RESPONSE_MODE,
  aspectRatio: "1:1",
  imageSize: "1K",
  enableSearchGrounding: false,
});

const normalizeRunMode = (value: unknown): NanoBananaRunMode => {
  const normalized = normalizeToLower(value);
  return normalized === "batch" ? "batch" : "interactive";
};

const normalizeResponseMode = (value: unknown): NanoBananaResponseMode => {
  const normalized = normalizeToLower(value);
  return normalized === "text_and_image" ? "text_and_image" : "image_only";
};

const normalizeSize = (
  value: unknown,
  capability: GoogleImageModelCapability
): NanoBananaImageSize => {
  const stringValue = typeof value === "string" ? value.trim() : "";
  const fromLegacy = LEGACY_RESOLUTION_TO_SIZE[normalizeToLower(value)];
  const candidate = (fromLegacy ?? stringValue) as NanoBananaImageSize;
  if (capability.imageSizes.includes(candidate)) return candidate;
  return capability.imageSizes[0];
};

const normalizeAspectRatio = (value: unknown, capability: GoogleImageModelCapability) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (capability.aspectRatios.includes(candidate)) return candidate;
  return capability.aspectRatios[0];
};

export const normalizeNanoBananaConfig = (
  raw: unknown
): { config: NanoBananaNodeConfig; migratedLegacy: boolean } => {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const modelId = normalizeGoogleImageModelId(input.modelId);
  const capability = getGoogleImageModelCapability(modelId);
  const runMode = normalizeRunMode(input.runMode);
  const responseMode = normalizeResponseMode(input.responseMode);
  const imageSize = normalizeSize(input.imageSize ?? input.resolution, capability);
  const aspectRatio = normalizeAspectRatio(input.aspectRatio, capability);
  const enableSearchGrounding = capability.supportsSearchGrounding
    ? Boolean(input.enableSearchGrounding)
    : false;

  const hasLegacyFields =
    typeof input.resolution === "string" ||
    typeof input.variations === "number" ||
    typeof input.stylePreset === "string";

  return {
    config: {
      modelId,
      runMode,
      responseMode,
      imageSize,
      aspectRatio,
      enableSearchGrounding,
      legacy: hasLegacyFields
        ? {
            resolution: input.resolution,
            variations: input.variations,
            stylePreset: input.stylePreset,
          }
        : undefined,
    },
    migratedLegacy: hasLegacyFields,
  };
};

export const assertNanoBananaConfigCompatible = (
  config: NanoBananaNodeConfig,
  referencesCount: number
) => {
  if (config.runMode === "batch" && !isAiGoogleBatchEnabledServer()) {
    throw new ConvexError("CONFIG_BATCH_DISABLED");
  }
  const capability = getGoogleImageModelCapability(config.modelId);

  if (!capability.imageSizes.includes(config.imageSize)) {
    throw new ConvexError("CONFIG_INVALID_IMAGE_SIZE");
  }
  if (!capability.aspectRatios.includes(config.aspectRatio)) {
    throw new ConvexError("CONFIG_INVALID_ASPECT_RATIO");
  }
  if (!capability.supportsSearchGrounding && config.enableSearchGrounding) {
    throw new ConvexError("CONFIG_INVALID_GROUNDING_UNSUPPORTED");
  }
  if (referencesCount > capability.maxReferences) {
    throw new ConvexError("CONFIG_INVALID_REFERENCE_LIMIT");
  }
};

export type NanoBananaEstimateInput = {
  modelId: GoogleImageModelId;
  runMode: NanoBananaRunMode;
  imageSize: NanoBananaImageSize;
  referencesCount: number;
  expectedImagesCount?: number;
};

const BASE_INTERACTIVE_PRICE: Record<GoogleImageModelId, number> = {
  "gemini-2.5-flash-image": 0.06,
  "gemini-3.1-flash-image-preview": 0.09,
  "gemini-3-pro-image-preview": 0.16,
};

const SIZE_MULTIPLIER: Record<NanoBananaImageSize, number> = {
  "512": 0.65,
  "1K": 1,
  "2K": 1.85,
  "4K": 3.4,
};

export const estimateNanoBananaCostUsd = (input: NanoBananaEstimateInput) => {
  const base = BASE_INTERACTIVE_PRICE[input.modelId] ?? 0.09;
  const sizeFactor = SIZE_MULTIPLIER[input.imageSize] ?? 1;
  const referencesFactor = 1 + Math.min(Math.max(input.referencesCount, 0), 14) * 0.03;
  const expectedImages = Math.min(Math.max(input.expectedImagesCount ?? 1, 1), 8);
  const interactive = base * sizeFactor * referencesFactor * expectedImages;
  const total = input.runMode === "batch" ? interactive * 0.5 : interactive;
  return Number(total.toFixed(6));
};

export const resolveNanoBananaModelForNode = (nodeType: string, config: unknown) => {
  const normalizedType = normalizeNanoNodeType(nodeType);
  if (normalizedType !== NANO_BANANA_CANONICAL_NODE_TYPE) return null;
  return normalizeNanoBananaConfig(config).config.modelId;
};
