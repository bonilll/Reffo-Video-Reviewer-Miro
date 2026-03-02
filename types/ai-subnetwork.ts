export type AiNodeType = "prompt" | "image_reference" | "nano_banana_pro" | "veo3";

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
  type: "nano_banana_pro";
  promptInput: "prompt";
  imageInput: "images";
  resolution?: string;
  variations?: number;
  stylePreset?: string;
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
