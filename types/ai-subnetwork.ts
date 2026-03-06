export type GoogleImageModelId =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview";

export type NanoBananaRunMode = "interactive" | "batch";
export type NanoBananaResponseMode = "image_only" | "text_and_image";
export type NanoBananaImageSize = "512" | "1K" | "2K" | "4K";

export type AiNodeType = "prompt" | "image_reference" | "nano_banana" | "nano_banana_pro" | "veo3";

export type CanonicalAiNodeType = "prompt" | "image_reference" | "nano_banana" | "veo3";

export type NodeRunStatus =
  | "blocked"
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "canceled";

export type WorkflowRunStatus =
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "canceled";

export type PromptNode = {
  type: "prompt";
  text: string;
  outputPort: "prompt";
};

export type ImageRefNode = {
  type: "image_reference";
  assets: Array<{
    url: string;
    title?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  }>;
  outputPort: "images";
};

export type NanoBananaNode = {
  type: "nano_banana" | "nano_banana_pro";
  promptInput: "prompt";
  imageInput: "images";
  modelId: GoogleImageModelId;
  runMode: NanoBananaRunMode;
  responseMode: NanoBananaResponseMode;
  aspectRatio: string;
  imageSize: NanoBananaImageSize;
  enableSearchGrounding: boolean;
};

export type Veo3Node = {
  type: "veo3";
  promptInput: "prompt";
  startFrameInput?: "image";
  endFrameInput?: "image";
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
};

export type SubnetworkNodeDto = PromptNode | ImageRefNode | NanoBananaNode | Veo3Node;

export type CostSummary = {
  selectedRunEstimateUsd: number;
  subnetworkTotalUsd: number;
  monthlyTotalUsd: number;
  monthKey: string;
};
