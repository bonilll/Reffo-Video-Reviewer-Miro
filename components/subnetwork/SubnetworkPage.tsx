import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  Cable,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Command,
  Download,
  Expand,
  FileText,
  ImageIcon,
  Link2,
  Minus,
  Pin,
  PinOff,
  Play,
  Plus,
  SquarePen,
  Search,
  Sparkles,
  TextCursorInput,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Room } from "@/components/room";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOthersMapped, useUpdateMyPresence } from "@/liveblocks.config";
import { useResourcePermissions } from "@/hooks/use-resource-permissions";
import {
  NANO_BANANA_CAPABILITIES,
  NANO_BANANA_MODEL_OPTIONS,
  normalizeNanoBananaUiConfig,
  normalizeSubnetworkNodeType,
} from "@/lib/nano-banana-models";
import { isAiGoogleBatchEnabled } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import type { AiNodeType } from "@/types/ai-subnetwork";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const GRID_STEP = 28;
const EDGE_STROKE_WIDTH = 2;

type Vec2 = {
  x: number;
  y: number;
};

type Camera = {
  x: number;
  y: number;
  scale: number;
};

type PortKind = "text" | "image" | "images" | "video" | "any";

type PortDefinition = {
  id: string;
  label: string;
  kind: PortKind;
  optional?: boolean;
};

type NodeTemplate = {
  type: "prompt" | "image_reference" | "nano_banana" | "veo3";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  borderClass: string;
  glowClass: string;
  size: { width: number; height: number };
  defaultConfig: Record<string, any>;
};

type NodeLayout = {
  id: string;
  node: any;
  position: Vec2;
  size: { width: number; height: number };
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  template: NodeTemplate;
};

type CommandMenuState = {
  x: number;
  y: number;
  worldPoint: Vec2;
};

type ConnectionDraft = {
  sourceNodeId: string;
  sourcePortId: string;
  pointer: Vec2;
};

type DragNodeState = {
  pointerId: number;
  nodeId: string;
  offset: Vec2;
};

type PanState = {
  pointerId: number;
  lastClient: Vec2;
};

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    type: "prompt",
    title: "Prompt",
    description: "Text prompt source for downstream generation nodes",
    icon: TextCursorInput,
    accentClass: "text-slate-700",
    borderClass: "border-slate-200",
    glowClass: "shadow-[0_0_0_1px_rgba(148,163,184,0.45),0_10px_26px_rgba(100,116,139,0.2)]",
    size: { width: 272, height: 176 },
    defaultConfig: {
      text: "",
    },
  },
  {
    type: "image_reference",
    title: "Image Reference",
    description: "Reference images used by image/video generation",
    icon: ImageIcon,
    accentClass: "text-emerald-700",
    borderClass: "border-emerald-200",
    glowClass: "shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_10px_26px_rgba(5,150,105,0.2)]",
    size: { width: 272, height: 168 },
    defaultConfig: {
      urlsText: "",
    },
  },
  {
    type: "nano_banana",
    title: "Nano Banana",
    description: "Google image generation node with explicit model selection",
    icon: Sparkles,
    accentClass: "text-amber-700",
    borderClass: "border-amber-200",
    glowClass: "shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_10px_26px_rgba(217,119,6,0.18)]",
    size: { width: 286, height: 178 },
    defaultConfig: normalizeNanoBananaUiConfig({}),
  },
  {
    type: "veo3",
    title: "Veo3",
    description: "Google video generation node from prompt and optional frames",
    icon: Video,
    accentClass: "text-fuchsia-700",
    borderClass: "border-fuchsia-200",
    glowClass: "shadow-[0_0_0_1px_rgba(217,70,239,0.32),0_10px_26px_rgba(162,28,175,0.16)]",
    size: { width: 286, height: 192 },
    defaultConfig: {
      durationSeconds: 6,
      resolution: "1080p",
      aspectRatio: "16:9",
    },
  },
];

const NODE_PORTS: Record<string, { inputs: PortDefinition[]; outputs: PortDefinition[] }> = {
  prompt: {
    inputs: [],
    outputs: [{ id: "prompt", label: "Prompt", kind: "text" }],
  },
  image_reference: {
    inputs: [],
    outputs: [{ id: "images", label: "Images", kind: "images" }],
  },
  nano_banana: {
    inputs: [
      { id: "prompt", label: "Prompt", kind: "text" },
      { id: "references", label: "References", kind: "images", optional: true },
    ],
    outputs: [{ id: "images", label: "Images", kind: "images" }],
  },
  veo3: {
    inputs: [
      { id: "prompt", label: "Prompt", kind: "text" },
      { id: "start_frame", label: "Start Frame", kind: "image", optional: true },
      { id: "end_frame", label: "End Frame", kind: "image", optional: true },
    ],
    outputs: [{ id: "video", label: "Video", kind: "video" }],
  },
};

const TEMPLATE_BY_TYPE = new Map(NODE_TEMPLATES.map((template) => [template.type, template]));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildEdgePath = (from: Vec2, to: Vec2) => {
  const delta = Math.abs(to.x - from.x);
  const c = Math.max(68, delta * 0.42);
  return `M ${from.x} ${from.y} C ${from.x + c} ${from.y}, ${to.x - c} ${to.y}, ${to.x} ${to.y}`;
};

const kindCompatible = (source: PortKind, target: PortKind) => {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  if (source === "image" && target === "images") return true;
  if (source === "images" && target === "image") return true;
  return false;
};

const getTemplateForType = (type: string): NodeTemplate => {
  const normalized = normalizeSubnetworkNodeType(type) as AiNodeType;
  return (
    TEMPLATE_BY_TYPE.get(normalized) ?? {
      type: "prompt",
      title: normalized || "Node",
      description: "",
      icon: Cable,
      accentClass: "text-neutral-700",
      borderClass: "border-black/50",
      glowClass: "shadow-[0_0_0_1px_rgba(148,163,184,0.25)]",
      size: { width: 270, height: 166 },
      defaultConfig: {},
    }
  );
};

const clonePlain = <T,>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const getNodePorts = (type: string) => {
  const normalized = normalizeSubnetworkNodeType(type);
  return NODE_PORTS[normalized] ?? { inputs: [], outputs: [] };
};

const getPortWorldPoint = (
  layout: NodeLayout,
  side: "input" | "output",
  portId: string
): Vec2 => {
  const ports = side === "input" ? layout.inputs : layout.outputs;
  const index = Math.max(
    0,
    ports.findIndex((port) => port.id === portId)
  );
  const rowBase = 58;
  const rowGap = 24;
  const y = layout.position.y + rowBase + index * rowGap;
  const x = side === "input" ? layout.position.x : layout.position.x + layout.size.width;
  return { x, y };
};

const getErrorMessage = (error: unknown) => {
  const fromData =
    typeof error === "object" && error && "data" in (error as any)
      ? (error as any).data?.message
      : undefined;
  const raw = fromData || (error instanceof Error ? error.message : "Unknown error");

  if (typeof raw !== "string") return "Unexpected error";
  if (raw.includes("AI_KEY_REQUIRED")) {
    return "Google API key missing. Add a key in Profile > Connections.";
  }
  if (raw.includes("AI_NODE_BUSY")) {
    return "This node already has an active run.";
  }
  if (raw.includes("AI_GRAPH_CYCLE_NOT_ALLOWED")) {
    return "Connection rejected: cyclic graphs are not allowed.";
  }
  if (raw.includes("AI_GRAPH_SELF_EDGE_NOT_ALLOWED")) {
    return "Connection rejected: a node cannot connect to itself.";
  }
  if (raw.includes("CONFIG_INVALID_PROMPT_REQUIRED")) {
    return "Nano Banana requires a connected Prompt node.";
  }
  if (raw.includes("CONFIG_INVALID_PROMPT_SOURCE")) {
    return "Nano Banana prompt input must come from a Prompt node.";
  }
  if (raw.includes("CONFIG_INVALID_PROMPT_EMPTY")) {
    return "Prompt input is empty. Add text in the Prompt node.";
  }
  if (raw.includes("CONFIG_INVALID_REFERENCE_LIMIT")) {
    return "Too many references for selected model. Reduce connected image references.";
  }
  if (raw.includes("CONFIG_INVALID_IMAGE_SIZE")) {
    return "Selected image size is not valid for the current model.";
  }
  if (raw.includes("CONFIG_INVALID_ASPECT_RATIO")) {
    return "Selected aspect ratio is not valid for the current model.";
  }
  if (raw.includes("CONFIG_INVALID_GROUNDING_UNSUPPORTED")) {
    return "Search grounding is not supported for the selected model.";
  }
  if (raw.includes("CONFIG_BATCH_DISABLED")) {
    return "Batch mode is currently disabled.";
  }
  if (raw.includes("FORBIDDEN")) {
    return "Action not allowed for your current role.";
  }
  return raw;
};

const formatStatus = (status: string) =>
  status
    .replaceAll("_", " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatUsd = (value?: number | null) => `$${(value ?? 0).toFixed(4)}`;

const PANEL_CARD_CLASS =
  "rounded-2xl border border-black/10 bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]";
const INPUT_CLASS =
  "h-9 w-full rounded-xl border border-black/15 bg-white px-3 text-sm text-black outline-none transition focus:border-black/40";
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black/40";

const getRunToneClasses = (status?: string | null) => {
  const value = (status ?? "").toLowerCase();
  if (value.includes("done")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value.includes("processing")) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (value.includes("queued")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (value.includes("failed") || value.includes("error")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (value.includes("canceled") || value.includes("blocked")) {
    return "border-neutral-300 bg-neutral-100 text-neutral-700";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
};

const isEditableElement = (target: EventTarget | null) => {
  const element =
    target instanceof Element
      ? target
      : target && (target as Node).nodeType === Node.TEXT_NODE
      ? (target as Node).parentElement
      : null;
  if (!element) return false;
  const html = element as HTMLElement;
  return (
    html.isContentEditable ||
    html.tagName === "INPUT" ||
    html.tagName === "TEXTAREA" ||
    html.tagName === "SELECT" ||
    html.closest("[data-subnetwork-command-menu='true']") !== null
  );
};

type SubnetworkPageProps = {
  boardId: string;
  subnetworkId: string;
  onBack: () => void;
};

const SNAPSHOT_VERSION = "reffo-subnetwork.v1";

type ImportedSnapshotNode = {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  config?: any;
  inputs?: any[];
  outputs?: any[];
  runPolicy?: any;
};

type ImportedSnapshotEdge = {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

type ImageReferenceItem = {
  url: string;
  title?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  storageKey?: string;
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSnapshotPayload = (payload: unknown): { nodes: ImportedSnapshotNode[]; edges: ImportedSnapshotEdge[] } => {
  if (!isPlainObject(payload)) {
    throw new Error("Invalid snapshot file.");
  }

  const nodesRaw = Array.isArray(payload.nodes) ? payload.nodes : null;
  const edgesRaw = Array.isArray(payload.edges) ? payload.edges : null;

  if (!nodesRaw || !edgesRaw) {
    throw new Error("Snapshot must include nodes and edges arrays.");
  }

  const nodes: ImportedSnapshotNode[] = nodesRaw.map((entry, index) => {
    if (!isPlainObject(entry) || !isPlainObject(entry.position)) {
      throw new Error(`Invalid node at index ${index}.`);
    }

    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const type = typeof entry.type === "string" ? entry.type.trim() : "";
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const x = Number(entry.position.x);
    const y = Number(entry.position.y);

    if (!id || !type || Number.isNaN(x) || Number.isNaN(y)) {
      throw new Error(`Node ${index + 1} is missing required fields.`);
    }

    const size =
      isPlainObject(entry.size) &&
      typeof entry.size.width === "number" &&
      typeof entry.size.height === "number"
        ? {
            width: entry.size.width,
            height: entry.size.height,
          }
        : undefined;

    return {
      id,
      type,
      title: title || "Node",
      position: { x, y },
      size,
      config: entry.config,
      inputs: Array.isArray(entry.inputs) ? entry.inputs : undefined,
      outputs: Array.isArray(entry.outputs) ? entry.outputs : undefined,
      runPolicy: entry.runPolicy,
    };
  });

  const edges: ImportedSnapshotEdge[] = edgesRaw.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Invalid edge at index ${index}.`);
    }
    const sourceNodeId = typeof entry.sourceNodeId === "string" ? entry.sourceNodeId.trim() : "";
    const sourcePort = typeof entry.sourcePort === "string" ? entry.sourcePort.trim() : "";
    const targetNodeId = typeof entry.targetNodeId === "string" ? entry.targetNodeId.trim() : "";
    const targetPort = typeof entry.targetPort === "string" ? entry.targetPort.trim() : "";

    if (!sourceNodeId || !sourcePort || !targetNodeId || !targetPort) {
      throw new Error(`Edge ${index + 1} is missing required fields.`);
    }

    return {
      sourceNodeId,
      sourcePort,
      targetNodeId,
      targetPort,
    };
  });

  return { nodes, edges };
};

const extractImageReferenceItems = (config: any): ImageReferenceItem[] => {
  if (Array.isArray(config?.images)) {
    return config.images
      .filter((item: any) => item && typeof item.url === "string")
      .map((item: any) => ({
        url: item.url,
        title: typeof item.title === "string" ? item.title : undefined,
        mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
        width: typeof item.width === "number" ? item.width : undefined,
        height: typeof item.height === "number" ? item.height : undefined,
        storageKey: typeof item.storageKey === "string" ? item.storageKey : undefined,
      }));
  }

  if (typeof config?.urlsText === "string") {
    return config.urlsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean)
      .map((url: string) => ({ url }));
  }

  return [];
};

const getImageDimensions = async (file: File): Promise<{ width?: number; height?: number }> => {
  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || undefined,
        height: image.naturalHeight || undefined,
      });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      resolve({});
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
};

const PresenceLayer = () => {
  const others = useOthersMapped((other) => ({
    connectionId: other.connectionId,
    cursor: other.presence.cursor,
    profile: other.presence.profile,
  }));

  return (
    <>
      {others.map(([connectionId, state]) => {
        if (!state.cursor) return null;
        return (
          <div
            key={connectionId}
            className="pointer-events-none absolute z-[90]"
            style={{ left: state.cursor.x, top: state.cursor.y }}
          >
            <div className="-translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg">
              {state.profile?.name || "User"}
            </div>
          </div>
        );
      })}
    </>
  );
};

const PresenceTracker = () => {
  const updateMyPresence = useUpdateMyPresence();

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      updateMyPresence({
        cursor: {
          x: event.clientX,
          y: event.clientY,
        },
      });
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [updateMyPresence]);

  return null;
};

const EditorSurface = ({ boardId, subnetworkId, onBack }: SubnetworkPageProps) => {
  const permissions = useResourcePermissions("board", boardId as Id<"boards">);
  const canWrite = permissions.canWrite;
  const batchModeEnabled = isAiGoogleBatchEnabled();

  const subnetwork = useQuery(api.aiSubnetworks.getByBoardAndId, {
    boardId: boardId as Id<"boards">,
    subnetworkId: subnetworkId as Id<"aiSubnetworks">,
  });

  const graph = useQuery(
    api.aiGraph.getGraph,
    subnetwork
      ? {
          subnetworkId: subnetwork._id,
        }
      : "skip"
  );

  const outputs = useQuery(
    api.aiOutputs.listForBoard,
    subnetwork
      ? {
          boardId: boardId as Id<"boards">,
          subnetworkId: subnetwork._id,
          limit: 400,
        }
      : "skip"
  );

  const workflowRuns = useQuery(
    api.aiRuns.listWorkflowRuns,
    subnetwork
      ? {
          subnetworkId: subnetwork._id,
          limit: 80,
        }
      : "skip"
  );

  const nodeRuns = useQuery(
    api.aiRuns.listNodeRunsForSubnetwork,
    subnetwork
      ? {
          subnetworkId: subnetwork._id,
          limit: 400,
        }
      : "skip"
  );

  const createNode = useMutation(api.aiGraph.createNode);
  const updateNode = useMutation(api.aiGraph.updateNode);
  const deleteNode = useMutation(api.aiGraph.deleteNode);
  const createEdge = useMutation(api.aiGraph.createEdge);
  const deleteEdge = useMutation(api.aiGraph.deleteEdge);
  const replaceGraphFromSnapshot = useMutation(api.aiGraph.replaceGraphFromSnapshot);
  const generateUploadUrl = useAction(api.storage.generateVideoUploadUrl);
  const launchNode = useMutation(api.aiRuns.launchNode);
  const launchWorkflow = useMutation(api.aiRuns.launchWorkflow);
  const markOutputPinned = useMutation(api.aiOutputs.markPinned);
  const updateSubnetwork = useMutation(api.aiSubnetworks.update);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const importDragDepthRef = useRef(0);

  const [camera, setCamera] = useState<Camera>({ x: 220, y: 120, scale: 1 });
  const cameraRef = useRef(camera);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [dragPayloadType, setDragPayloadType] = useState<"setup" | "image" | "unsupported" | null>(null);
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const [isImportingSnapshot, setIsImportingSnapshot] = useState(false);
  const [isUploadingImageNode, setIsUploadingImageNode] = useState(false);

  const panRef = useRef<PanState | null>(null);
  const dragRef = useRef<DragNodeState | null>(null);
  const dragPendingRef = useRef<{ nodeId: string; position: Vec2 } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const edgeDragCandidateRef = useRef<{ edgeId: string; startClient: Vec2 } | null>(null);
  const connectionRef = useRef<ConnectionDraft | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodeOutputIndexByNodeId, setNodeOutputIndexByNodeId] = useState<Record<string, number>>({});
  const [fullscreenOutputState, setFullscreenOutputState] = useState<{ nodeId: string; index: number } | null>(
    null
  );
  const [nodePositionOverrides, setNodePositionOverrides] = useState<Record<string, Vec2>>({});
  const nodePositionOverridesRef = useRef<Record<string, Vec2>>({});

  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [commandMenu, setCommandMenu] = useState<CommandMenuState | null>(null);
  const [commandSearch, setCommandSearch] = useState("");
  const [creatingNodeType, setCreatingNodeType] = useState<AiNodeType | null>(null);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [nodeDraft, setNodeDraft] = useState<{ title: string; config: Record<string, any> } | null>(
    null
  );
  const [nodeDraftDirty, setNodeDraftDirty] = useState(false);

  useEffect(() => {
    setTitleDraft(subnetwork?.title ?? "");
  }, [subnetwork?._id, subnetwork?.title]);

  useEffect(() => {
    if (!isRenamingTitle) return;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isRenamingTitle]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isDraggingNode && !isPanning) return;
    const previousBodyUserSelect = document.body.style.userSelect;
    const previousHtmlUserSelect = document.documentElement.style.userSelect;
    document.body.style.userSelect = "none";
    document.documentElement.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousBodyUserSelect;
      document.documentElement.style.userSelect = previousHtmlUserSelect;
    };
  }, [isDraggingNode, isPanning]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    nodePositionOverridesRef.current = nodePositionOverrides;
  }, [nodePositionOverrides]);

  const clientToViewportPoint = useCallback((clientX: number, clientY: number): Vec2 => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  }, []);

  const viewportToWorldPoint = useCallback((point: Vec2, cam: Camera = cameraRef.current): Vec2 => {
    return {
      x: (point.x - cam.x) / cam.scale,
      y: (point.y - cam.y) / cam.scale,
    };
  }, []);

  const worldToViewportPoint = useCallback((point: Vec2): Vec2 => {
    return {
      x: point.x * camera.scale + camera.x,
      y: point.y * camera.scale + camera.y,
    };
  }, [camera.scale, camera.x, camera.y]);

  const clientToWorldPoint = useCallback(
    (clientX: number, clientY: number) =>
      viewportToWorldPoint(clientToViewportPoint(clientX, clientY), cameraRef.current),
    [clientToViewportPoint, viewportToWorldPoint]
  );

  const openCommandMenu = useCallback(
    (viewportPoint: Vec2, worldPoint: Vec2) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const height = rect?.height ?? window.innerHeight;
      const menuWidth = 360;
      const menuHeight = 320;
      const x = clamp(viewportPoint.x, 12, Math.max(12, width - menuWidth - 12));
      const y = clamp(viewportPoint.y, 12, Math.max(12, height - menuHeight - 12));

      setCommandMenu({ x, y, worldPoint });
      setCommandSearch("");
      setSelectedEdgeId(null);
    },
    []
  );

  const closeCommandMenu = useCallback(() => {
    setCommandMenu(null);
    setCommandSearch("");
  }, []);

  useEffect(() => {
    if (!commandMenu) return;

    const frame = window.requestAnimationFrame(() => {
      commandInputRef.current?.focus();
      commandInputRef.current?.select();
    });

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && commandMenuRef.current?.contains(target)) return;
      closeCommandMenu();
    };

    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [commandMenu, closeCommandMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isEditableElement(event.target);

      if (event.code === "Space" && !typing) {
        event.preventDefault();
        setIsSpacePressed(true);
      }

      if (!canWrite || typing) return;

      if (event.key === "Tab") {
        event.preventDefault();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;

        const viewportCenter = { x: rect.width / 2 - 180, y: rect.height / 2 - 140 };
        const worldCenter = viewportToWorldPoint(
          {
            x: rect.width / 2,
            y: rect.height / 2,
          },
          cameraRef.current
        );
        openCommandMenu(viewportCenter, worldCenter);
      } else if (event.key === "Escape") {
        if (connectionRef.current) {
          connectionRef.current = null;
          setConnectionDraft(null);
        }
        closeCommandMenu();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedEdgeId) {
          event.preventDefault();
          void deleteEdge({ edgeId: selectedEdgeId as Id<"aiEdges"> });
          setSelectedEdgeId(null);
          return;
        }
        if (selectedNodeId) {
          event.preventDefault();
          void deleteNode({ nodeId: selectedNodeId as Id<"aiNodes"> });
          setSelectedNodeId(null);
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    canWrite,
    closeCommandMenu,
    deleteEdge,
    deleteNode,
    openCommandMenu,
    selectedEdgeId,
    selectedNodeId,
    viewportToWorldPoint,
  ]);

  const graphNodes = graph?.nodes ?? [];
  const graphEdges = graph?.edges ?? [];

  const disconnectEdges = useCallback(
    async (edgeIds: string[]) => {
      if (!canWrite || edgeIds.length === 0) return;
      const uniqueEdgeIds = [...new Set(edgeIds)];
      try {
        await Promise.all(
          uniqueEdgeIds.map((edgeId) =>
            deleteEdge({
              edgeId: edgeId as Id<"aiEdges">,
            })
          )
        );
        if (selectedEdgeId && uniqueEdgeIds.includes(selectedEdgeId)) {
          setSelectedEdgeId(null);
        }
        toast.success(
          uniqueEdgeIds.length === 1
            ? "Connection removed"
            : `${uniqueEdgeIds.length} connections removed`
        );
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [canWrite, deleteEdge, selectedEdgeId]
  );

  const startDraftFromExistingEdge = useCallback(
    (edgeId: string, pointer: Vec2) => {
      if (!canWrite) return;
      const edge = graphEdges.find((candidate: any) => String(candidate._id) === edgeId);
      if (!edge) return;

      const draft: ConnectionDraft = {
        sourceNodeId: String(edge.sourceNodeId),
        sourcePortId: edge.sourcePort,
        pointer,
      };

      connectionRef.current = draft;
      setConnectionDraft(draft);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      closeCommandMenu();

      void deleteEdge({ edgeId: edgeId as Id<"aiEdges"> }).catch((error) => {
        toast.error(getErrorMessage(error));
        connectionRef.current = null;
        setConnectionDraft(null);
      });
    },
    [canWrite, closeCommandMenu, deleteEdge, graphEdges]
  );

  const handleSaveSetup = useCallback(() => {
    if (!subnetwork) return;

    const payload = {
      version: SNAPSHOT_VERSION,
      exportedAt: Date.now(),
      subnetwork: {
        boardId,
        subnetworkId: String(subnetwork._id),
        title: subnetwork.title,
      },
      nodes: graphNodes.map((node: any) => ({
        id: String(node._id),
        type: node.type,
        title: node.title,
        position: node.position,
        size: node.size,
        config: node.config,
        inputs: node.inputs,
        outputs: node.outputs,
        runPolicy: node.runPolicy,
      })),
      edges: graphEdges.map((edge: any) => ({
        sourceNodeId: String(edge.sourceNodeId),
        sourcePort: edge.sourcePort,
        targetNodeId: String(edge.targetNodeId),
        targetPort: edge.targetPort,
      })),
    };

    try {
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = (subnetwork.title || "subnetwork")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      a.href = url;
      a.download = `${safeTitle || "subnetwork"}-setup.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Setup saved");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [boardId, graphEdges, graphNodes, subnetwork]);

  const loadSetupFromFile = useCallback(
    async (file: File) => {
      if (!canWrite || !subnetwork) return;
      if (!file.name.toLowerCase().endsWith(".json")) {
        toast.error("Only .json snapshot files are supported.");
        return;
      }

      if (
        graphNodes.length > 0 &&
        !window.confirm("Loading this setup will replace current nodes and connections. Continue?")
      ) {
        return;
      }

      try {
        setIsImportingSnapshot(true);
        const text = await file.text();
        const parsed = JSON.parse(text);
        const { nodes, edges } = parseSnapshotPayload(parsed);

        await replaceGraphFromSnapshot({
          subnetworkId: subnetwork._id,
          nodes,
          edges,
        });

        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        closeCommandMenu();
        toast.success(`Setup loaded: ${nodes.length} nodes, ${edges.length} connections.`);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : getErrorMessage(error);
        toast.error(message);
      } finally {
        setIsImportingSnapshot(false);
      }
    },
    [canWrite, closeCommandMenu, graphNodes.length, replaceGraphFromSnapshot, subnetwork]
  );

  const onLoadInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      void loadSetupFromFile(file);
    },
    [loadSetupFromFile]
  );

  const resolveDraggedPayloadType = useCallback((dataTransfer: DataTransfer) => {
    const items = Array.from(dataTransfer.items ?? []);
    let hasJson = false;
    let hasImage = false;

    for (const item of items) {
      if (item.kind !== "file") continue;
      const mime = (item.type || "").toLowerCase();
      if (mime.includes("json")) hasJson = true;
      if (mime.startsWith("image/")) hasImage = true;
    }

    if (!hasJson && !hasImage) {
      const files = Array.from(dataTransfer.files ?? []);
      for (const file of files) {
        const mime = (file.type || "").toLowerCase();
        const name = (file.name || "").toLowerCase();
        if (mime.includes("json") || name.endsWith(".json")) hasJson = true;
        if (mime.startsWith("image/")) hasImage = true;
      }
    }

    if (hasJson) return "setup" as const;
    if (hasImage) return "image" as const;
    return "unsupported" as const;
  }, []);

  const createImageNodeFromFile = useCallback(
    async (file: File, worldPoint: Vec2) => {
      if (!canWrite || !subnetwork) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Only image files can create an image node.");
        return;
      }

      try {
        setIsUploadingImageNode(true);
        setCreatingNodeType("image_reference");

        const uploadMeta = await generateUploadUrl({
          contentType: file.type || "application/octet-stream",
          fileName: file.name,
          context: "board",
          contextId: boardId,
        });

        const uploadResponse = await fetch(uploadMeta.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Image upload failed.");
        }

        const dimensions = await getImageDimensions(file);
        const template = getTemplateForType("image_reference");
        const nodeSize = { width: 300, height: 250 };
        const baseTitle = file.name.replace(/\.[^/.]+$/, "").trim() || "Image Reference";

        const nodeId = await createNode({
          subnetworkId: subnetwork._id,
          type: "image_reference",
          title: baseTitle,
          position: {
            x: worldPoint.x - nodeSize.width / 2,
            y: worldPoint.y - 34,
          },
          size: nodeSize,
          config: {
            ...clonePlain(template.defaultConfig),
            urlsText: uploadMeta.publicUrl,
            images: [
              {
                url: uploadMeta.publicUrl,
                title: file.name,
                mimeType: file.type,
                width: dimensions.width,
                height: dimensions.height,
                storageKey: uploadMeta.storageKey,
              },
            ],
          },
        });

        setSelectedNodeId(String(nodeId));
        toast.success("Image node created");
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : getErrorMessage(error);
        toast.error(message);
      } finally {
        setIsUploadingImageNode(false);
        setCreatingNodeType(null);
      }
    },
    [boardId, canWrite, createNode, generateUploadUrl, subnetwork]
  );

  const handleViewportDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canWrite || isImportingSnapshot || isUploadingImageNode) return;
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      importDragDepthRef.current += 1;
      setIsImportDragActive(true);
      setDragPayloadType(resolveDraggedPayloadType(event.dataTransfer));
    },
    [canWrite, isImportingSnapshot, isUploadingImageNode, resolveDraggedPayloadType]
  );

  const handleViewportDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canWrite || isImportingSnapshot || isUploadingImageNode) return;
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!isImportDragActive) {
        setIsImportDragActive(true);
      }
      setDragPayloadType(resolveDraggedPayloadType(event.dataTransfer));
    },
    [canWrite, isImportDragActive, isImportingSnapshot, isUploadingImageNode, resolveDraggedPayloadType]
  );

  const handleViewportDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    importDragDepthRef.current = Math.max(0, importDragDepthRef.current - 1);
    if (importDragDepthRef.current === 0) {
      setIsImportDragActive(false);
      setDragPayloadType(null);
    }
  }, []);

  const handleViewportDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canWrite || isImportingSnapshot || isUploadingImageNode) return;
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      importDragDepthRef.current = 0;
      setIsImportDragActive(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) {
        setDragPayloadType(null);
        return;
      }

      const jsonFile = files.find((file) => {
        const mime = (file.type || "").toLowerCase();
        const name = (file.name || "").toLowerCase();
        return mime.includes("json") || name.endsWith(".json");
      });
      const imageFile = files.find((file) => (file.type || "").toLowerCase().startsWith("image/"));

      setDragPayloadType(null);

      if (jsonFile) {
        void loadSetupFromFile(jsonFile);
        return;
      }

      if (imageFile) {
        const viewportPoint = clientToViewportPoint(event.clientX, event.clientY);
        const worldPoint = viewportToWorldPoint(viewportPoint, cameraRef.current);
        void createImageNodeFromFile(imageFile, worldPoint);
        return;
      }

      toast.error("Unsupported file type. Drop a JSON setup or an image.");
    },
    [
      canWrite,
      clientToViewportPoint,
      createImageNodeFromFile,
      isImportingSnapshot,
      isUploadingImageNode,
      loadSetupFromFile,
      viewportToWorldPoint,
    ]
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (panRef.current) {
        event.preventDefault();
        const pan = panRef.current;
        if (event.pointerId !== pan.pointerId) return;
        const dx = event.clientX - pan.lastClient.x;
        const dy = event.clientY - pan.lastClient.y;
        panRef.current = {
          ...pan,
          lastClient: { x: event.clientX, y: event.clientY },
        };
        setCamera((current) => ({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        }));
      }

      if (edgeDragCandidateRef.current) {
        const candidate = edgeDragCandidateRef.current;
        const dx = event.clientX - candidate.startClient.x;
        const dy = event.clientY - candidate.startClient.y;
        const moved = Math.hypot(dx, dy);
        if (moved > 4) {
          edgeDragCandidateRef.current = null;
          const pointer = clientToViewportPoint(event.clientX, event.clientY);
          startDraftFromExistingEdge(candidate.edgeId, pointer);
        }
      }

      if (dragRef.current) {
        event.preventDefault();
        const drag = dragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = clientToWorldPoint(event.clientX, event.clientY);
        const nextPosition = {
          x: world.x - drag.offset.x,
          y: world.y - drag.offset.y,
        };
        dragPendingRef.current = { nodeId: drag.nodeId, position: nextPosition };

        if (dragFrameRef.current === null) {
          dragFrameRef.current = window.requestAnimationFrame(() => {
            dragFrameRef.current = null;
            const pending = dragPendingRef.current;
            if (!pending) return;
            setNodePositionOverrides((current) => {
              const previous = current[pending.nodeId];
              if (previous && previous.x === pending.position.x && previous.y === pending.position.y) {
                return current;
              }
              return {
                ...current,
                [pending.nodeId]: pending.position,
              };
            });
          });
        }
      }

      if (connectionRef.current) {
        const viewportPoint = clientToViewportPoint(event.clientX, event.clientY);
        const draft = {
          ...connectionRef.current,
          pointer: viewportPoint,
        };
        connectionRef.current = draft;
        setConnectionDraft(draft);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (panRef.current && event.pointerId === panRef.current.pointerId) {
        panRef.current = null;
        setIsPanning(false);
      }

      edgeDragCandidateRef.current = null;

      if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
        event.preventDefault();
        const drag = dragRef.current;
        dragRef.current = null;
        setIsDraggingNode(false);

        if (dragFrameRef.current !== null) {
          window.cancelAnimationFrame(dragFrameRef.current);
          dragFrameRef.current = null;
        }
        const pending = dragPendingRef.current;
        if (pending && pending.nodeId === drag.nodeId) {
          setNodePositionOverrides((current) => ({
            ...current,
            [pending.nodeId]: pending.position,
          }));
        }
        dragPendingRef.current = null;

        const finalPosition =
          pending && pending.nodeId === drag.nodeId
            ? pending.position
            : nodePositionOverridesRef.current[drag.nodeId];
        if (finalPosition) {
          void updateNode({
            nodeId: drag.nodeId as Id<"aiNodes">,
            position: finalPosition,
          }).catch((error) => {
            toast.error(getErrorMessage(error));
          });
        }
      }

      if (connectionRef.current) {
        connectionRef.current = null;
        setConnectionDraft(null);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: false });
    window.addEventListener("pointercancel", onPointerUp, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [clientToViewportPoint, clientToWorldPoint, startDraftFromExistingEdge, updateNode]);

  useEffect(() => {
    setNodePositionOverrides((current) => {
      const valid = new Set(graphNodes.map((node: any) => String(node._id)));
      let changed = false;
      const next: Record<string, Vec2> = {};

      for (const [nodeId, point] of Object.entries(current)) {
        if (valid.has(nodeId)) {
          next[nodeId] = point;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [graphNodes]);

  const nodeLayouts = useMemo<NodeLayout[]>(() => {
    return graphNodes.map((node: any) => {
      const id = String(node._id);
      const normalizedType = normalizeSubnetworkNodeType(node.type);
      const normalizedConfig =
        normalizedType === "nano_banana" ? normalizeNanoBananaUiConfig(node.config) : node.config;
      const normalizedNode =
        normalizedType === node.type && normalizedConfig === node.config
          ? node
          : {
              ...node,
              type: normalizedType,
              config: normalizedConfig,
            };
      const template = getTemplateForType(normalizedType);
      const ports = getNodePorts(normalizedType);
      return {
        id,
        node: normalizedNode,
        position: nodePositionOverrides[id] ?? node.position ?? { x: 0, y: 0 },
        size: node.size ?? template.size,
        inputs: ports.inputs,
        outputs: ports.outputs,
        template,
      };
    });
  }, [graphNodes, nodePositionOverrides]);

  const nodeLayoutById = useMemo(() => {
    return new Map(nodeLayouts.map((layout) => [layout.id, layout]));
  }, [nodeLayouts]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!nodeLayoutById.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodeLayoutById, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeId) return;
    if (!graphEdges.some((edge: any) => String(edge._id) === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [graphEdges, selectedEdgeId]);

  const outputsByNode = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const output of outputs ?? []) {
      const key = String(output.nodeId);
      const list = grouped.get(key) ?? [];
      list.push(output);
      grouped.set(key, list);
    }
    for (const [key, list] of grouped.entries()) {
      grouped.set(
        key,
        [...list].sort((a, b) => {
          const byCreatedAt = Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
          if (byCreatedAt !== 0) return byCreatedAt;
          return Number(b.version ?? 0) - Number(a.version ?? 0);
        })
      );
    }
    return grouped;
  }, [outputs]);

  const activeNodeRunByNodeId = useMemo(() => {
    const map = new Map<string, any>();
    const sorted = [...(nodeRuns ?? [])].sort((a: any, b: any) => b.createdAt - a.createdAt);
    for (const run of sorted) {
      const status = String(run.status ?? "").toLowerCase();
      if (status !== "queued" && status !== "processing") continue;
      const key = String(run.nodeId);
      if (!map.has(key)) {
        map.set(key, run);
      }
    }
    return map;
  }, [nodeRuns]);

  const referenceCountByNodeId = useMemo(() => {
    const map = new Map<string, number>();
    const nodeTypeById = new Map(
      nodeLayouts.map((layout) => [layout.id, normalizeSubnetworkNodeType(layout.node.type)])
    );

    for (const edge of graphEdges) {
      if (edge.targetPort !== "references") continue;
      const targetNodeId = String(edge.targetNodeId);
      const sourceNodeId = String(edge.sourceNodeId);
      if (nodeTypeById.get(targetNodeId) !== "nano_banana") continue;
      if (nodeTypeById.get(sourceNodeId) !== "image_reference") continue;
      map.set(targetNodeId, (map.get(targetNodeId) ?? 0) + 1);
    }
    return map;
  }, [graphEdges, nodeLayouts]);

  const selectedNodeLayout = selectedNodeId ? nodeLayoutById.get(selectedNodeId) ?? null : null;
  const selectedNodeType = selectedNodeLayout
    ? normalizeSubnetworkNodeType(selectedNodeLayout.node.type)
    : null;
  const selectedNanoConfig =
    selectedNodeType === "nano_banana"
      ? normalizeNanoBananaUiConfig(nodeDraft?.config ?? selectedNodeLayout?.node?.config)
      : null;
  const selectedNanoCapability = selectedNanoConfig
    ? NANO_BANANA_CAPABILITIES[selectedNanoConfig.modelId]
    : null;
  const selectedNanoReferenceCount = selectedNodeLayout
    ? referenceCountByNodeId.get(selectedNodeLayout.id) ?? 0
    : 0;
  const selectedNanoReferencesLimitExceeded =
    selectedNodeType === "nano_banana" &&
    selectedNanoCapability &&
    selectedNanoReferenceCount > selectedNanoCapability.maxReferences;
  const selectedNanoReferencesWarning =
    selectedNodeType === "nano_banana" &&
    selectedNanoCapability &&
    selectedNanoReferenceCount > selectedNanoCapability.recommendedReferenceWarningThreshold;

  const selectedNodeOutputs = useQuery(
    api.aiOutputs.listNodeVersions,
    selectedNodeLayout
      ? {
          nodeId: selectedNodeLayout.node._id as Id<"aiNodes">,
          limit: 120,
        }
      : "skip"
  );

  const selectedNodeRuns = useMemo(() => {
    if (!selectedNodeLayout) return [];
    return (nodeRuns ?? [])
      .filter((run: any) => String(run.nodeId) === selectedNodeLayout.id)
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .slice(0, 10);
  }, [nodeRuns, selectedNodeLayout]);
  const selectedNodeActiveRun = selectedNodeLayout
    ? activeNodeRunByNodeId.get(selectedNodeLayout.id) ?? null
    : null;
  const selectedNodeActiveRunStatus = selectedNodeActiveRun
    ? String(selectedNodeActiveRun.status ?? "").toLowerCase()
    : null;
  const selectedNodeIsBusy = Boolean(
    (selectedNodeLayout && runningNodeId === selectedNodeLayout.id) || selectedNodeActiveRun
  );

  useEffect(() => {
    setNodeOutputIndexByNodeId((current) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const layout of nodeLayouts) {
        const list = outputsByNode.get(layout.id) ?? [];
        if (list.length === 0) continue;
        const previous = current[layout.id] ?? 0;
        const clamped = clamp(previous, 0, list.length - 1);
        next[layout.id] = clamped;
        if (clamped !== previous || !(layout.id in current)) changed = true;
      }
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [nodeLayouts, outputsByNode]);

  useEffect(() => {
    if (!fullscreenOutputState) return;
    const nodeOutputs = outputsByNode.get(fullscreenOutputState.nodeId) ?? [];
    if (nodeOutputs.length === 0) {
      setFullscreenOutputState(null);
      return;
    }
    const nextIndex = clamp(fullscreenOutputState.index, 0, nodeOutputs.length - 1);
    if (nextIndex !== fullscreenOutputState.index) {
      setFullscreenOutputState({
        nodeId: fullscreenOutputState.nodeId,
        index: nextIndex,
      });
    }
  }, [fullscreenOutputState, outputsByNode]);

  const shiftNodeOutputIndex = useCallback(
    (nodeId: string, delta: -1 | 1) => {
      const list = outputsByNode.get(nodeId) ?? [];
      if (list.length <= 1) return;
      setNodeOutputIndexByNodeId((current) => {
        const currentIndex = current[nodeId] ?? 0;
        const nextIndex = (currentIndex + delta + list.length) % list.length;
        return {
          ...current,
          [nodeId]: nextIndex,
        };
      });
      setFullscreenOutputState((current) => {
        if (!current || current.nodeId !== nodeId) return current;
        const nextIndex = (current.index + delta + list.length) % list.length;
        return {
          ...current,
          index: nextIndex,
        };
      });
    },
    [outputsByNode]
  );

  useEffect(() => {
    if (!fullscreenOutputState) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setFullscreenOutputState(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        shiftNodeOutputIndex(fullscreenOutputState.nodeId, -1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        shiftNodeOutputIndex(fullscreenOutputState.nodeId, 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenOutputState, shiftNodeOutputIndex]);

  const fullscreenNodeOutputs = fullscreenOutputState
    ? outputsByNode.get(fullscreenOutputState.nodeId) ?? []
    : [];
  const fullscreenOutput = fullscreenOutputState
    ? fullscreenNodeOutputs[clamp(fullscreenOutputState.index, 0, Math.max(fullscreenNodeOutputs.length - 1, 0))] ??
      null
    : null;
  const fullscreenNodeLayout = fullscreenOutputState
    ? nodeLayoutById.get(fullscreenOutputState.nodeId) ?? null
    : null;

  const selectedNodeCostSummary = useQuery(
    api.aiCosts.getSummary,
    subnetwork
      ? {
          subnetworkId: subnetwork._id,
          nodeId: selectedNodeLayout ? (selectedNodeLayout.node._id as Id<"aiNodes">) : undefined,
        }
      : "skip"
  );

  useEffect(() => {
    if (!selectedNodeLayout) {
      setNodeDraft(null);
      setNodeDraftDirty(false);
      return;
    }

    setNodeDraft({
      title: selectedNodeLayout.node.title ?? selectedNodeLayout.template.title,
      config:
        selectedNodeType === "nano_banana"
          ? clonePlain(normalizeNanoBananaUiConfig(selectedNodeLayout.node.config))
          : clonePlain((selectedNodeLayout.node.config as Record<string, any>) ?? {}),
    });
    setNodeDraftDirty(false);
  }, [selectedNodeLayout?.id, selectedNodeLayout?.node.updatedAt, selectedNodeType]);

  const edgeRenderData = useMemo(() => {
    return graphEdges
      .map((edge: any) => {
        const source = nodeLayoutById.get(String(edge.sourceNodeId));
        const target = nodeLayoutById.get(String(edge.targetNodeId));
        if (!source || !target) return null;

        const sourceWorld = getPortWorldPoint(source, "output", edge.sourcePort);
        const targetWorld = getPortWorldPoint(target, "input", edge.targetPort);
        const sourceViewport = worldToViewportPoint(sourceWorld);
        const targetViewport = worldToViewportPoint(targetWorld);
        const path = buildEdgePath(sourceViewport, targetViewport);

        return {
          id: String(edge._id),
          sourceNodeId: String(edge.sourceNodeId),
          targetNodeId: String(edge.targetNodeId),
          path,
          sourcePort: edge.sourcePort,
          targetPort: edge.targetPort,
          sourceViewport,
          targetViewport,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      sourceNodeId: string;
      targetNodeId: string;
      path: string;
      sourcePort: string;
      targetPort: string;
      sourceViewport: Vec2;
      targetViewport: Vec2;
    }>;
  }, [graphEdges, nodeLayoutById, worldToViewportPoint]);

  const filteredTemplates = useMemo(() => {
    const query = commandSearch.trim().toLowerCase();
    if (!query) return NODE_TEMPLATES;
    return NODE_TEMPLATES.filter(
      (template) =>
        template.title.toLowerCase().includes(query) ||
        template.type.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query)
    );
  }, [commandSearch]);

  const getDefaultInsertPoint = useCallback((): Vec2 => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 160, y: 120 };
    return viewportToWorldPoint(
      { x: rect.width / 2, y: rect.height / 2 },
      cameraRef.current
    );
  }, [viewportToWorldPoint]);

  const createNodeFromTemplate = useCallback(
    async (template: NodeTemplate, worldPoint?: Vec2) => {
      if (!subnetwork || !canWrite) return;
      const anchor = worldPoint ?? commandMenu?.worldPoint ?? getDefaultInsertPoint();
      const position = {
        x: anchor.x - template.size.width / 2,
        y: anchor.y - 34,
      };

      try {
        setCreatingNodeType(template.type);
        const nodeId = await createNode({
          subnetworkId: subnetwork._id,
          type: template.type,
          title: template.title,
          position,
          size: template.size,
          config: clonePlain(template.defaultConfig),
        });
        setSelectedNodeId(String(nodeId));
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setCreatingNodeType(null);
      }
    },
    [canWrite, commandMenu?.worldPoint, createNode, getDefaultInsertPoint, subnetwork]
  );

  const commitConnection = useCallback(
    async (targetNodeId: string, targetPortId: string) => {
      if (!subnetwork || !canWrite) return;
      const draft = connectionRef.current;
      if (!draft) return;

      const sourceLayout = nodeLayoutById.get(draft.sourceNodeId);
      const targetLayout = nodeLayoutById.get(targetNodeId);
      if (!sourceLayout || !targetLayout) return;

      const sourcePort = sourceLayout.outputs.find((port) => port.id === draft.sourcePortId);
      const targetPort = targetLayout.inputs.find((port) => port.id === targetPortId);
      if (!sourcePort || !targetPort) return;

      if (!kindCompatible(sourcePort.kind, targetPort.kind)) {
        toast.error("Incompatible connection between selected ports.");
        return;
      }

      try {
        await createEdge({
          subnetworkId: subnetwork._id,
          sourceNodeId: draft.sourceNodeId as Id<"aiNodes">,
          sourcePort: draft.sourcePortId,
          targetNodeId: targetNodeId as Id<"aiNodes">,
          targetPort: targetPortId,
        });
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        connectionRef.current = null;
        setConnectionDraft(null);
      }
    },
    [canWrite, createEdge, nodeLayoutById, subnetwork]
  );

  const handleRunNode = useCallback(
    async (nodeId: string) => {
      if (!subnetwork || !canWrite) return;
      try {
        setRunningNodeId(nodeId);
        await launchNode({
          subnetworkId: subnetwork._id,
          nodeId: nodeId as Id<"aiNodes">,
        });
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setRunningNodeId(null);
      }
    },
    [canWrite, launchNode, subnetwork]
  );

  const handleRunWorkflow = useCallback(async () => {
    if (!subnetwork || !canWrite) return;
    try {
      setRunningWorkflow(true);
      await launchWorkflow({ subnetworkId: subnetwork._id });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRunningWorkflow(false);
    }
  }, [canWrite, launchWorkflow, subnetwork]);

  const selectedEdge = useMemo(
    () => edgeRenderData.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edgeRenderData, selectedEdgeId]
  );
  const edgesByInputPort = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graphEdges) {
      const key = `${String(edge.targetNodeId)}:${edge.targetPort}`;
      const list = map.get(key) ?? [];
      list.push(String(edge._id));
      map.set(key, list);
    }
    return map;
  }, [graphEdges]);
  const edgesByOutputPort = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graphEdges) {
      const key = `${String(edge.sourceNodeId)}:${edge.sourcePort}`;
      const list = map.get(key) ?? [];
      list.push(String(edge._id));
      map.set(key, list);
    }
    return map;
  }, [graphEdges]);
  const activeRunsCount = useMemo(
    () =>
      (nodeRuns ?? []).filter((run: any) => {
        const status = String(run.status ?? "").toLowerCase();
        return status === "queued" || status === "processing";
      }).length,
    [nodeRuns]
  );

  const updateNodeDraftConfig = useCallback((patch: Record<string, any>) => {
    setNodeDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        config: {
          ...current.config,
          ...patch,
        },
      };
    });
    setNodeDraftDirty(true);
  }, []);

  const saveNodeDraft = useCallback(async () => {
    if (!selectedNodeLayout || !nodeDraft || !nodeDraftDirty) return;
    try {
      const normalizedNanoConfig = normalizeNanoBananaUiConfig(nodeDraft.config);
      const normalizedConfig =
        selectedNodeType === "nano_banana"
          ? {
              ...normalizedNanoConfig,
              runMode: batchModeEnabled ? normalizedNanoConfig.runMode : "interactive",
            }
          : nodeDraft.config;
      await updateNode({
        nodeId: selectedNodeLayout.node._id as Id<"aiNodes">,
        title: nodeDraft.title.trim() || selectedNodeLayout.template.title,
        config: normalizedConfig,
      });
      setNodeDraftDirty(false);
      toast.success("Node updated");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [nodeDraft, nodeDraftDirty, selectedNodeLayout, selectedNodeType, updateNode]);

  const commitSubnetworkRename = useCallback(async () => {
    if (!subnetwork) return;
    const nextTitle = titleDraft.trim();
    const fallback = "Subnetwork AI";
    const safeTitle = nextTitle.length > 0 ? nextTitle : fallback;
    if (safeTitle === (subnetwork.title ?? fallback)) {
      setIsRenamingTitle(false);
      return;
    }

    try {
      await updateSubnetwork({
        subnetworkId: subnetwork._id,
        title: safeTitle,
      });
      setIsRenamingTitle(false);
      toast.success("Subnetwork renamed");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [subnetwork, titleDraft, updateSubnetwork]);

  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button === 1 || (isSpacePressed && event.button === 0)) {
        event.preventDefault();
        closeCommandMenu();
        setSelectedEdgeId(null);
        setIsDraggingNode(false);
        edgeDragCandidateRef.current = null;
        panRef.current = {
          pointerId: event.pointerId,
          lastClient: {
            x: event.clientX,
            y: event.clientY,
          },
        };
        setIsPanning(true);
        return;
      }

      if (event.button === 0) {
        setIsDraggingNode(false);
        edgeDragCandidateRef.current = null;
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        closeCommandMenu();
      }
    },
    [closeCommandMenu, isSpacePressed]
  );

  const handleViewportContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!canWrite) return;
      const viewportPoint = clientToViewportPoint(event.clientX, event.clientY);
      const worldPoint = viewportToWorldPoint(viewportPoint, cameraRef.current);
      openCommandMenu(viewportPoint, worldPoint);
    },
    [canWrite, clientToViewportPoint, openCommandMenu, viewportToWorldPoint]
  );

  const handleViewportWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();

      const viewportPoint = clientToViewportPoint(event.clientX, event.clientY);
      const currentCamera = cameraRef.current;

      if (event.ctrlKey || event.metaKey) {
        const nextScale = clamp(
          currentCamera.scale * Math.exp(-event.deltaY * 0.0014),
          MIN_ZOOM,
          MAX_ZOOM
        );
        const worldPoint = viewportToWorldPoint(viewportPoint, currentCamera);
        setCamera({
          x: viewportPoint.x - worldPoint.x * nextScale,
          y: viewportPoint.y - worldPoint.y * nextScale,
          scale: nextScale,
        });
      } else {
        setCamera((cameraValue) => ({
          ...cameraValue,
          x: cameraValue.x - event.deltaX,
          y: cameraValue.y - event.deltaY,
        }));
      }
    },
    [clientToViewportPoint, viewportToWorldPoint]
  );

  const backgroundStyle = useMemo(() => {
    const scaledStep = GRID_STEP * camera.scale;
    const px = scaledStep > 0 ? `${scaledStep}px ${scaledStep}px` : `${GRID_STEP}px ${GRID_STEP}px`;
    return {
      backgroundColor: "#f5f6f8",
      backgroundImage:
        "linear-gradient(rgba(15,23,42,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)",
      backgroundSize: px,
      backgroundPosition: `${camera.x}px ${camera.y}px`,
    } as React.CSSProperties;
  }, [camera.scale, camera.x, camera.y]);

  if (permissions.isLoading || subnetwork === undefined || graph === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#eef0f4]">
        <div className="rounded-2xl border border-black/10 bg-white px-6 py-4 text-sm font-medium text-black/65 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          Loading subnetwork...
        </div>
      </div>
    );
  }

  if (!subnetwork) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-black/10 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-semibold text-black">Subnetwork not found</h2>
        <p className="mt-2 text-sm text-black/65">This subnetwork may have been removed.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-black transition hover:border-black/35 hover:bg-black hover:text-white"
        >
          Back to board
        </button>
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-semibold text-amber-900">Editors only</h2>
        <p className="mt-2 text-sm text-amber-800/90">
          Viewer role can inspect outputs on the board, but cannot enter the subnetwork editor.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          Back to board
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-white text-black">
      <PresenceTracker />
      <PresenceLayer />
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onLoadInputChange}
      />

      <div className="flex h-full w-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          <header className="flex h-[72px] items-center justify-between border-b border-black/10 bg-white px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white text-black transition hover:border-black/35 hover:bg-black hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/15 bg-[#fafafa] px-3 text-sm font-semibold text-black shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:border-black/35 hover:bg-white"
                  >
                    <FileText className="h-4 w-4 text-black/70" />
                    File
                    <ChevronDown className="h-3.5 w-3.5 text-black/45" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={10}
                  className="min-w-[230px] rounded-2xl border border-black/15 bg-white p-1.5 text-black shadow-[0_20px_44px_rgba(15,23,42,0.18)]"
                >
                  <DropdownMenuLabel className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-black/45">
                    Setup File
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-black/10" />
                  <DropdownMenuItem
                    className="gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-black focus:bg-black focus:text-white"
                    onSelect={(event) => {
                      event.preventDefault();
                      handleSaveSetup();
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Save
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isImportingSnapshot}
                    className="gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-black focus:bg-black focus:text-white data-[disabled]:text-black/35"
                    onSelect={(event) => {
                      event.preventDefault();
                      importFileInputRef.current?.click();
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    {isImportingSnapshot ? "Loading..." : "Load"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="min-w-0">
                {isRenamingTitle ? (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => void commitSubnetworkRename()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitSubnetworkRename();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setTitleDraft(subnetwork.title);
                        setIsRenamingTitle(false);
                      }
                    }}
                    className={cn(INPUT_CLASS, "h-9 w-[360px] max-w-full font-semibold")}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRenamingTitle(true)}
                    className="group -mx-1 inline-flex max-w-full items-center gap-1 rounded-lg border border-transparent px-1 py-0.5 text-left transition hover:border-black/20"
                    title="Click to rename"
                  >
                    <span className="truncate text-base font-semibold text-black">{subnetwork.title}</span>
                    <SquarePen className="h-3.5 w-3.5 text-black/35 opacity-0 transition group-hover:opacity-100" />
                  </button>
                )}
              </div>
            </div>

            <div className="hidden items-center rounded-xl border border-black/10 bg-white p-1 md:flex">
              <button
                type="button"
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white"
              >
                Editor
              </button>
              <span className="px-3 py-1.5 text-xs font-medium text-black/50">Executions</span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="hidden items-center gap-1.5 rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/60 lg:inline-flex">
                <Command className="h-3.5 w-3.5" />
                Tab to add nodes
              </span>
              <div className="hidden items-center gap-1.5 rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-xs text-black/65 xl:flex">
                <Activity className="h-3.5 w-3.5" />
                <span>{nodeLayouts.length} nodes</span>
                <span className="text-black/30">|</span>
                <span>{activeRunsCount} active</span>
              </div>
              <button
                type="button"
                onClick={() => void handleRunWorkflow()}
                disabled={runningWorkflow || nodeLayouts.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-4 w-4" />
                {runningWorkflow ? "Running Flow..." : "Run Flow"}
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div
              ref={viewportRef}
              className={cn(
                "relative min-w-0 flex-1 overflow-hidden overscroll-none bg-[#f5f6f8]",
                (isDraggingNode || isPanning) && "select-none"
              )}
              style={{
                cursor: isPanning ? "grabbing" : isSpacePressed ? "grab" : "default",
                touchAction: "none",
              }}
              onPointerDown={handleViewportPointerDown}
              onContextMenu={handleViewportContextMenu}
              onWheel={handleViewportWheel}
              onDragEnter={handleViewportDragEnter}
              onDragOver={handleViewportDragOver}
              onDragLeave={handleViewportDragLeave}
              onDrop={handleViewportDrop}
            >
              <div className="absolute inset-0" style={backgroundStyle} />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-white/80 to-transparent" />

              <svg className="absolute inset-0 z-10 h-full w-full overflow-visible">
                {edgeRenderData.map((edge) => {
                  const selected = edge.id === selectedEdgeId;
                  const highlighted =
                    selected || edge.sourceNodeId === selectedNodeId || edge.targetNodeId === selectedNodeId;

                  return (
                    <g key={edge.id}>
                      <path
                        d={edge.path}
                        fill="none"
                        stroke={highlighted ? "rgba(17,24,39,0.86)" : "rgba(100,116,139,0.58)"}
                        strokeWidth={selected ? EDGE_STROKE_WIDTH + 0.5 : EDGE_STROKE_WIDTH}
                      />
                      <path
                        d={edge.path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        className="cursor-pointer"
                        style={{ pointerEvents: "stroke" }}
                        onPointerDown={(event) => {
                          if (event.button === 2) {
                            event.preventDefault();
                            event.stopPropagation();
                            edgeDragCandidateRef.current = null;
                            void disconnectEdges([edge.id]);
                            return;
                          }
                          if (event.button !== 0) return;
                          event.stopPropagation();
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeId(null);
                          closeCommandMenu();
                          edgeDragCandidateRef.current = canWrite
                            ? {
                                edgeId: edge.id,
                                startClient: { x: event.clientX, y: event.clientY },
                              }
                            : null;
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void disconnectEdges([edge.id]);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void disconnectEdges([edge.id]);
                        }}
                      />
                    </g>
                  );
                })}

                {connectionDraft &&
                  (() => {
                    const sourceLayout = nodeLayoutById.get(connectionDraft.sourceNodeId);
                    if (!sourceLayout) return null;
                    const sourceWorld = getPortWorldPoint(
                      sourceLayout,
                      "output",
                      connectionDraft.sourcePortId
                    );
                    const sourceViewport = worldToViewportPoint(sourceWorld);
                    const path = buildEdgePath(sourceViewport, connectionDraft.pointer);
                    return (
                      <path
                        d={path}
                        fill="none"
                        stroke="rgba(17,24,39,0.86)"
                        strokeDasharray="6 4"
                        strokeWidth={2.25}
                      />
                    );
                  })()}
              </svg>

              <div
                className="absolute left-0 top-0 z-20 h-full w-full"
                style={{
                  transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
                  transformOrigin: "0 0",
                }}
              >
                {nodeLayouts.map((layout) => {
                  const selected = selectedNodeId === layout.id;
                  const isLaunching = runningNodeId === layout.id;
                  const outputCount = outputsByNode.get(layout.id)?.length ?? 0;
                  const Icon = layout.template.icon;
                  const nodeType = normalizeSubnetworkNodeType(layout.node.type);
                  const isPromptNode = nodeType === "prompt";
                  const isImageReferenceNode = nodeType === "image_reference";
                  const isNanoBananaNode = nodeType === "nano_banana";
                  const promptText = String((layout.node.config as any)?.text ?? "");
                  const imageItems = extractImageReferenceItems(layout.node.config);
                  const primaryImage = imageItems[0] ?? null;
                  const nodeOutputs = outputsByNode.get(layout.id) ?? [];
                  const activeOutputIndex =
                    nodeOutputs.length > 0
                      ? clamp(nodeOutputIndexByNodeId[layout.id] ?? 0, 0, nodeOutputs.length - 1)
                      : 0;
                  const activeOutput = nodeOutputs[activeOutputIndex] ?? null;
                  const nanoConfig = isNanoBananaNode ? normalizeNanoBananaUiConfig(layout.node.config) : null;
                  const nanoModelCapability = nanoConfig
                    ? NANO_BANANA_CAPABILITIES[nanoConfig.modelId]
                    : null;
                  const connectedReferencesCount = referenceCountByNodeId.get(layout.id) ?? 0;
                  const activeNodeRun = activeNodeRunByNodeId.get(layout.id) ?? null;
                  const activeNodeRunStatus = activeNodeRun
                    ? String(activeNodeRun.status ?? "").toLowerCase()
                    : null;
                  const isNodeQueued = activeNodeRunStatus === "queued";
                  const isNodeProcessing = activeNodeRunStatus === "processing";
                  const isNodeBusy = isLaunching || isNodeQueued || isNodeProcessing;
                  const referencesLimitExceeded =
                    isNanoBananaNode &&
                    nanoModelCapability &&
                    connectedReferencesCount > nanoModelCapability.maxReferences;

                  return (
                    <article
                      key={layout.id}
                      className={cn(
                        "absolute select-none overflow-visible rounded-2xl border bg-white/96 text-black transition-[box-shadow,border-color,background-color] duration-150",
                        selected
                          ? "border-black/55 shadow-[0_0_0_2px_rgba(107,114,128,0.22),0_16px_36px_rgba(107,114,128,0.28)]"
                          : "border-black/15 shadow-[0_10px_26px_rgba(15,23,42,0.1)] hover:border-black/35 hover:shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
                      )}
                      style={{
                        left: layout.position.x,
                        top: layout.position.y,
                        width: layout.size.width,
                        minHeight: layout.size.height,
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        const target = event.target as HTMLElement | null;
                        if (target?.closest("[data-port-handle='true']")) return;
                        if (target && isEditableElement(target)) return;
                        event.stopPropagation();

                        setSelectedNodeId(layout.id);
                        setSelectedEdgeId(null);
                        closeCommandMenu();

                        if (!target?.closest("[data-node-drag-handle='true']")) {
                          return;
                        }

                        event.preventDefault();
                        setIsDraggingNode(true);
                        dragPendingRef.current = null;

                        const world = clientToWorldPoint(event.clientX, event.clientY);
                        dragRef.current = {
                          pointerId: event.pointerId,
                          nodeId: layout.id,
                          offset: {
                            x: world.x - layout.position.x,
                            y: world.y - layout.position.y,
                          },
                        };
                      }}
                    >
                      <div
                        data-node-drag-handle="true"
                        className="flex cursor-grab items-start justify-between rounded-t-2xl border-b border-black/10 bg-gradient-to-b from-white to-[#f8f8f9] px-3.5 py-3 active:cursor-grabbing"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
                            {layout.node.type}
                          </p>
                          <h3 className="truncate text-sm font-semibold text-black">{layout.node.title}</h3>
                          {isNanoBananaNode && nanoConfig ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex rounded-md border border-black/15 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black/75">
                                {nanoConfig.modelId}
                              </span>
                              <span className="inline-flex rounded-md border border-black/15 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black/60">
                                {nanoConfig.runMode === "batch" ? "Batch" : "Interactive"}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            "ml-2 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 bg-white",
                            layout.template.accentClass
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>

                      {isPromptNode ? (
                        <div className="space-y-2 px-3.5 pb-3 pt-2.5 text-xs text-black/70">
                          <textarea
                            key={`${layout.id}:${layout.node.updatedAt ?? ""}`}
                            defaultValue={promptText}
                            rows={5}
                            onPointerDown={(event) => event.stopPropagation()}
                            onFocus={() => {
                              setSelectedNodeId(layout.id);
                              setSelectedEdgeId(null);
                            }}
                            onBlur={(event) => {
                              const nextText = event.target.value;
                              if (nextText === promptText) return;
                              void updateNode({
                                nodeId: layout.node._id as Id<"aiNodes">,
                                config: {
                                  ...(layout.node.config ?? {}),
                                  text: nextText,
                                },
                              }).catch((error) => {
                                toast.error(getErrorMessage(error));
                              });
                            }}
                            placeholder="Write your prompt here..."
                            className="min-h-[112px] w-full resize-y rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black/35"
                          />
                          <p className="px-1 text-[11px] text-black/55">Output: prompt text</p>
                        </div>
                      ) : isImageReferenceNode ? (
                        <div className="space-y-2 px-3.5 pb-3 pt-2.5 text-xs text-black/70">
                          {primaryImage ? (
                            <div className="overflow-hidden rounded-xl border border-black/12 bg-[#f6f7f8]">
                              <img
                                src={primaryImage.url}
                                alt={primaryImage.title ?? layout.node.title ?? "Reference image"}
                                className="h-32 w-full object-cover"
                                draggable={false}
                              />
                            </div>
                          ) : (
                            <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-black/20 bg-[#fafafa] px-3 text-center text-[11px] text-black/50">
                              Drop an image on canvas to create this node.
                            </div>
                          )}
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] text-black/55">
                              {imageItems.length === 0
                                ? "No reference image"
                                : imageItems.length === 1
                                ? "1 reference image"
                                : `${imageItems.length} reference images`}
                            </span>
                            <span className="text-[11px] text-black/45">Output: images</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5 px-3.5 pb-3 pt-2.5 text-xs text-black/70">
                          <div
                            className="relative overflow-hidden rounded-xl border border-black/12 bg-[#f7f7f8]"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            {activeOutput ? (
                              activeOutput.publicUrl && activeOutput.mimeType?.startsWith("image/") ? (
                                <img
                                  src={activeOutput.publicUrl}
                                  alt={activeOutput.title ?? "Output"}
                                  className="h-36 w-full object-cover"
                                  draggable={false}
                                />
                              ) : activeOutput.publicUrl && activeOutput.mimeType?.startsWith("video/") ? (
                                <video
                                  src={activeOutput.publicUrl}
                                  className="h-36 w-full object-cover"
                                  muted
                                  playsInline
                                  autoPlay
                                  loop
                                />
                              ) : (
                                <div className="flex h-36 items-center justify-center text-[11px] text-black/50">
                                  {activeOutput.outputType || "Output"}
                                </div>
                              )
                            ) : (
                              <div className="flex h-36 items-center justify-center text-[11px] text-black/50">
                                No outputs yet
                              </div>
                            )}

                            {activeOutput ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setFullscreenOutputState({
                                    nodeId: layout.id,
                                    index: activeOutputIndex,
                                  });
                                }}
                                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-black/15 bg-white/95 text-black transition hover:bg-black hover:text-white"
                                title="Open fullscreen"
                              >
                                <Expand className="h-3.5 w-3.5" />
                              </button>
                            ) : null}

                            {nodeOutputs.length > 1 ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    shiftNodeOutputIndex(layout.id, -1);
                                  }}
                                  className="absolute left-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-black/15 bg-white/95 text-black transition hover:bg-black hover:text-white"
                                  title="Previous output"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    shiftNodeOutputIndex(layout.id, 1);
                                  }}
                                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-black/15 bg-white/95 text-black transition hover:bg-black hover:text-white"
                                  title="Next output"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </>
                            ) : null}

                            {isNodeBusy ? (
                              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/68 backdrop-blur-[1px]">
                                <div className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-black/70 shadow-[0_8px_18px_rgba(15,23,42,0.12)]">
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" />
                                  {isNodeQueued ? "Queued..." : "Processing..."}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="px-1 text-[11px] text-black/55">
                            <span className="text-black/55">
                              {outputCount === 0
                                ? "No versions"
                                : `v${activeOutput?.version ?? "?"} · ${activeOutputIndex + 1}/${outputCount}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isNodeBusy || Boolean(referencesLimitExceeded)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRunNode(layout.id);
                            }}
                            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white text-xs font-semibold text-black transition hover:border-black/35 hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Play className="h-3.5 w-3.5" />
                            {isNodeQueued ? "Queued..." : isNodeProcessing ? "Running..." : isLaunching ? "Starting..." : "Run Node"}
                          </button>
                        </div>
                      )}

                      {layout.inputs.map((port, index) => {
                        const inputEdgeIds = edgesByInputPort.get(`${layout.id}:${port.id}`) ?? [];
                        const isConnected = inputEdgeIds.length > 0;
                        const compatible = (() => {
                          if (!connectionDraft) return false;
                          const sourceLayout = nodeLayoutById.get(connectionDraft.sourceNodeId);
                          if (!sourceLayout) return false;
                          const sourcePort = sourceLayout.outputs.find(
                            (candidate) => candidate.id === connectionDraft.sourcePortId
                          );
                          if (!sourcePort) return false;
                          return kindCompatible(sourcePort.kind, port.kind);
                        })();

                        return (
                          <button
                            key={`${layout.id}-in-${port.id}`}
                            type="button"
                            data-port-handle="true"
                            className={cn(
                              "absolute z-20 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-[0_0_0_3px_rgba(255,255,255,0.92)] transition",
                              compatible || (isConnected && !connectionDraft)
                                ? "border-black/90 bg-black"
                                : "border-black/35 bg-white hover:border-black/60"
                            )}
                            style={{
                              left: 0,
                              top: 58 + index * 24,
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              if (connectionRef.current) return;
                              if (!canWrite) return;
                              const modifierPressed = event.altKey || event.metaKey || event.ctrlKey;
                              if (modifierPressed) {
                                event.preventDefault();
                                edgeDragCandidateRef.current = null;
                                void disconnectEdges(inputEdgeIds);
                                return;
                              }
                              if (inputEdgeIds.length === 0) return;
                              event.preventDefault();
                              const preferredEdgeId =
                                selectedEdgeId && inputEdgeIds.includes(selectedEdgeId)
                                  ? selectedEdgeId
                                  : inputEdgeIds[inputEdgeIds.length - 1];
                              const pointer = clientToViewportPoint(event.clientX, event.clientY);
                              edgeDragCandidateRef.current = null;
                              startDraftFromExistingEdge(preferredEdgeId, pointer);
                            }}
                            onPointerUp={(event) => {
                              if (!connectionRef.current) return;
                              event.preventDefault();
                              event.stopPropagation();
                              void commitConnection(layout.id, port.id);
                            }}
                            title={`${port.label} (${port.kind})`}
                          />
                        );
                      })}

                      {layout.outputs.map((port, index) => {
                        const outputEdgeIds = edgesByOutputPort.get(`${layout.id}:${port.id}`) ?? [];
                        return (
                          <button
                            key={`${layout.id}-out-${port.id}`}
                            type="button"
                            data-port-handle="true"
                            className="absolute z-20 h-[18px] w-[18px] -translate-y-1/2 translate-x-1/2 rounded-full border border-black/80 bg-black shadow-[0_0_0_3px_rgba(255,255,255,0.92)]"
                            style={{
                              right: 0,
                              top: 58 + index * 24,
                            }}
                            onPointerDown={(event) => {
                              if (connectionRef.current) return;
                              if (!canWrite) return;
                              if ((event.altKey || event.metaKey || event.ctrlKey) && canWrite) {
                                event.preventDefault();
                                event.stopPropagation();
                                edgeDragCandidateRef.current = null;
                                void disconnectEdges(outputEdgeIds);
                                return;
                              }

                              event.preventDefault();
                              event.stopPropagation();
                              const pointer = clientToViewportPoint(event.clientX, event.clientY);
                              const draft: ConnectionDraft = {
                                sourceNodeId: layout.id,
                                sourcePortId: port.id,
                                pointer,
                              };
                              connectionRef.current = draft;
                              setConnectionDraft(draft);
                            }}
                            title={`${port.label} (${port.kind})`}
                          />
                        );
                      })}
                    </article>
                  );
                })}
              </div>

              <div className="absolute left-5 top-5 z-30 rounded-xl border border-black/10 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-black/65 shadow-[0_8px_24px_rgba(15,23,42,0.1)]">
                Drag canvas with <span className="font-semibold text-black">Space</span> + click
              </div>

              {(isImportDragActive || isImportingSnapshot || isUploadingImageNode) && (
                <div className="absolute inset-0 z-[45] flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                  <div className="rounded-2xl border border-black/20 bg-white px-6 py-5 text-center shadow-[0_20px_48px_rgba(15,23,42,0.18)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                      {dragPayloadType === "image" || isUploadingImageNode ? "Image Node" : "Subnetwork Setup"}
                    </p>
                    <p className="mt-1 text-base font-semibold text-black">
                      {isUploadingImageNode
                        ? "Creating image node..."
                        : isImportingSnapshot
                        ? "Load in progress..."
                        : dragPayloadType === "unsupported"
                        ? "Unsupported file type"
                        : dragPayloadType === "image"
                        ? "Drop image to create a node"
                        : "Drop JSON file to load setup"}
                    </p>
                    <p className="mt-1 text-xs text-black/55">
                      {dragPayloadType === "image" || isUploadingImageNode
                        ? "A new image reference node will be added to the canvas."
                        : dragPayloadType === "unsupported"
                        ? "Use a JSON setup file or an image file."
                        : "Existing nodes and connections will be replaced."}
                    </p>
                  </div>
                </div>
              )}

              {fullscreenOutputState && fullscreenOutput && (
                <div
                  className="absolute inset-0 z-[70] flex items-center justify-center bg-black/76 p-5 backdrop-blur-sm"
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    setFullscreenOutputState(null);
                  }}
                >
                  <div className="relative flex h-full w-full max-w-[1360px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#0a0a0b] text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
                    <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {fullscreenNodeLayout?.node.title ?? "Output"}
                        </p>
                        <p className="text-xs text-white/65">
                          {`v${fullscreenOutput.version ?? "?"} · ${fullscreenOutputState.index + 1}/${fullscreenNodeOutputs.length}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFullscreenOutputState(null)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white transition hover:bg-white hover:text-black"
                        title="Close fullscreen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div
                      className="relative flex min-h-0 flex-1 items-center justify-center p-5"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {fullscreenOutput.publicUrl && fullscreenOutput.mimeType?.startsWith("image/") ? (
                        <img
                          src={fullscreenOutput.publicUrl}
                          alt={fullscreenOutput.title ?? "Output"}
                          className="max-h-full max-w-full rounded-xl object-contain"
                          draggable={false}
                        />
                      ) : fullscreenOutput.publicUrl && fullscreenOutput.mimeType?.startsWith("video/") ? (
                        <video
                          src={fullscreenOutput.publicUrl}
                          className="max-h-full max-w-full rounded-xl object-contain"
                          controls
                          autoPlay
                          loop
                          playsInline
                        />
                      ) : (
                        <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/70">
                          {fullscreenOutput.outputType || "Output"}
                        </div>
                      )}

                      {fullscreenNodeOutputs.length > 1 ? (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              shiftNodeOutputIndex(fullscreenOutputState.nodeId, -1);
                            }}
                            className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition hover:bg-white hover:text-black"
                            title="Previous output"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              shiftNodeOutputIndex(fullscreenOutputState.nodeId, 1);
                            }}
                            className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition hover:bg-white hover:text-black"
                            title="Next output"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const rect = viewportRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const viewportPoint = { x: rect.width - 372, y: 80 };
                  const worldPoint = viewportToWorldPoint(
                    { x: rect.width / 2, y: rect.height / 2 },
                    cameraRef.current
                  );
                  openCommandMenu(viewportPoint, worldPoint);
                }}
                className="absolute right-5 top-5 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white/92 text-black shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition hover:border-black/35 hover:bg-black hover:text-white"
                title="Add node"
              >
                <Plus className="h-4 w-4" />
              </button>

              <div className="absolute bottom-5 left-5 z-30 flex items-center gap-1 rounded-xl border border-black/10 bg-white/90 p-1 text-xs text-black shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                <button
                  type="button"
                  onClick={() => {
                    const nextScale = clamp(camera.scale / 1.15, MIN_ZOOM, MAX_ZOOM);
                    setCamera((current) => ({
                      ...current,
                      scale: nextScale,
                    }));
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black hover:text-white"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-16 text-center font-semibold">{Math.round(camera.scale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextScale = clamp(camera.scale * 1.15, MIN_ZOOM, MAX_ZOOM);
                    setCamera((current) => ({
                      ...current,
                      scale: nextScale,
                    }));
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {commandMenu && (
                <div
                  ref={commandMenuRef}
                  className="absolute z-40 w-[360px] overflow-hidden rounded-2xl border border-black/15 bg-white/96 shadow-[0_28px_70px_rgba(15,23,42,0.24)] backdrop-blur"
                  style={{ left: commandMenu.x, top: commandMenu.y }}
                  data-subnetwork-command-menu="true"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onContextMenu={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <div className="border-b border-black/10 p-3">
                    <div className="flex items-center gap-2 rounded-xl border border-black/12 bg-[#fafafa] px-2.5">
                      <Search className="h-4 w-4 text-black/40" />
                      <input
                        ref={commandInputRef}
                        type="text"
                        value={commandSearch}
                        onChange={(event) => setCommandSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            closeCommandMenu();
                            return;
                          }
                          if (event.key === "Enter") {
                            const first = filteredTemplates[0];
                            if (!first) return;
                            event.preventDefault();
                            void createNodeFromTemplate(first, commandMenu.worldPoint);
                            closeCommandMenu();
                          }
                        }}
                        placeholder="Search nodes..."
                        className="h-10 w-full bg-transparent text-sm text-black outline-none placeholder:text-black/35"
                      />
                    </div>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto p-2">
                    {filteredTemplates.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-black/20 px-3 py-6 text-center text-sm text-black/45">
                        No matching nodes.
                      </div>
                    ) : (
                      filteredTemplates.map((template) => {
                        const Icon = template.icon;
                        return (
                          <button
                            key={template.type}
                            type="button"
                            disabled={creatingNodeType === template.type}
                            onClick={() => {
                              void createNodeFromTemplate(template, commandMenu.worldPoint);
                              closeCommandMenu();
                            }}
                            className="mb-1.5 flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-black/15 hover:bg-[#f7f7f8] disabled:opacity-45"
                          >
                            <div
                              className={cn(
                                "mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/12 bg-white",
                                template.accentClass
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-black">{template.title}</p>
                              <p className="text-xs text-black/50">{template.description}</p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <aside className="w-[390px] max-w-[42vw] border-l border-black/10 bg-[#f8f8f9] p-4 overflow-y-auto overscroll-none">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-black">Inspector</p>
                <span className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-black/55">
                  {selectedNodeLayout ? "Node selected" : "Flow overview"}
                </span>
              </div>

              <div className={cn(PANEL_CARD_CLASS, "mb-3")}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">Costs</p>
                <div className="mt-2.5 space-y-1.5 text-xs text-black/70">
                  <p className="flex items-center justify-between rounded-lg border border-black/10 bg-[#fafafa] px-2.5 py-1.5">
                    <span>Selected run</span>
                    <span className="font-semibold text-black">
                      {formatUsd(selectedNodeCostSummary?.selectedRunEstimateUsd)}
                    </span>
                  </p>
                  <p className="flex items-center justify-between rounded-lg border border-black/10 bg-[#fafafa] px-2.5 py-1.5">
                    <span>Subnetwork spent</span>
                    <span className="font-semibold text-black">
                      {formatUsd(selectedNodeCostSummary?.subnetworkTotalUsd)}
                    </span>
                  </p>
                  <p className="flex items-center justify-between rounded-lg border border-black/10 bg-[#fafafa] px-2.5 py-1.5">
                    <span>Monthly total</span>
                    <span className="font-semibold text-black">
                      {formatUsd(selectedNodeCostSummary?.monthlyTotalUsd)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {selectedNodeLayout ? (
                  <div className="space-y-3">
                    <div className={PANEL_CARD_CLASS}>
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-black">Node Details</p>
                        {selectedNodeType !== "prompt" && selectedNodeType !== "image_reference" && (
                          <button
                            type="button"
                            onClick={() => void handleRunNode(selectedNodeLayout.id)}
                            disabled={selectedNodeIsBusy || Boolean(selectedNanoReferencesLimitExceeded)}
                            className="inline-flex h-8 items-center gap-1 rounded-xl border border-black/15 bg-white px-2.5 text-xs font-semibold text-black transition hover:border-black/35 hover:bg-black hover:text-white disabled:opacity-45"
                          >
                            <Play className="h-3.5 w-3.5" />
                            {selectedNodeActiveRunStatus === "queued"
                              ? "Queued..."
                              : selectedNodeActiveRunStatus === "processing"
                              ? "Running..."
                              : runningNodeId === selectedNodeLayout.id
                              ? "Starting..."
                              : "Run"}
                          </button>
                        )}
                      </div>

                      <label className="text-[11px] uppercase tracking-wide text-black/45">Title</label>
                      <input
                        value={nodeDraft?.title ?? ""}
                        onChange={(event) => {
                          setNodeDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  title: event.target.value,
                                }
                              : current
                          );
                          setNodeDraftDirty(true);
                        }}
                        className={cn(INPUT_CLASS, "mt-1")}
                      />

                      <div className="mt-3 space-y-2 text-xs text-black/70">
                        {selectedNodeType === "prompt" && (
                          <div className="rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-[11px] text-black/60">
                            Prompt text is edited directly inside the node.
                          </div>
                        )}

                        {selectedNodeType === "image_reference" && (
                          <div className="rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-[11px] text-black/60">
                            Image references are created by dropping images on the canvas.
                          </div>
                        )}

                        {selectedNodeType === "nano_banana" && selectedNanoConfig && selectedNanoCapability && (
                          <>
                            <label className="text-[11px] uppercase tracking-wide text-black/45">Model</label>
                            <select
                              value={selectedNanoConfig.modelId}
                              onChange={(event) => {
                                const nextModelId = event.target.value;
                                const nextConfig = normalizeNanoBananaUiConfig({
                                  ...(nodeDraft?.config ?? {}),
                                  modelId: nextModelId,
                                });
                                updateNodeDraftConfig(nextConfig);
                              }}
                              className={INPUT_CLASS}
                            >
                              {NANO_BANANA_MODEL_OPTIONS.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.label}
                                </option>
                              ))}
                            </select>

                            <label className="text-[11px] uppercase tracking-wide text-black/45">Run mode</label>
                            <select
                              value={batchModeEnabled ? selectedNanoConfig.runMode : "interactive"}
                              onChange={(event) =>
                                updateNodeDraftConfig({
                                  ...selectedNanoConfig,
                                  runMode: event.target.value === "batch" ? "batch" : "interactive",
                                })
                              }
                              className={INPUT_CLASS}
                            >
                              <option value="interactive">Interactive</option>
                              {batchModeEnabled ? <option value="batch">Batch</option> : null}
                            </select>
                            {!batchModeEnabled && (
                              <p className="text-[11px] text-black/55">
                                Batch mode is disabled by feature flag.
                              </p>
                            )}

                            <label className="text-[11px] uppercase tracking-wide text-black/45">Response mode</label>
                            <select
                              value={selectedNanoConfig.responseMode}
                              onChange={(event) =>
                                updateNodeDraftConfig({
                                  ...selectedNanoConfig,
                                  responseMode:
                                    event.target.value === "text_and_image" ? "text_and_image" : "image_only",
                                })
                              }
                              className={INPUT_CLASS}
                            >
                              <option value="image_only">Image only</option>
                              <option value="text_and_image">Text + image</option>
                            </select>

                            <label className="text-[11px] uppercase tracking-wide text-black/45">Image size</label>
                            <select
                              value={selectedNanoConfig.imageSize}
                              onChange={(event) =>
                                updateNodeDraftConfig({
                                  ...selectedNanoConfig,
                                  imageSize: event.target.value,
                                })
                              }
                              className={INPUT_CLASS}
                            >
                              {selectedNanoCapability.imageSizes.map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>

                            <label className="text-[11px] uppercase tracking-wide text-black/45">Aspect ratio</label>
                            <select
                              value={selectedNanoConfig.aspectRatio}
                              onChange={(event) =>
                                updateNodeDraftConfig({
                                  ...selectedNanoConfig,
                                  aspectRatio: event.target.value,
                                })
                              }
                              className={INPUT_CLASS}
                            >
                              {selectedNanoCapability.aspectRatios.map((ratio) => (
                                <option key={ratio} value={ratio}>
                                  {ratio}
                                </option>
                              ))}
                            </select>

                            {selectedNanoCapability.supportsSearchGrounding ? (
                              <label className="flex items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={selectedNanoConfig.enableSearchGrounding}
                                  onChange={(event) =>
                                    updateNodeDraftConfig({
                                      ...selectedNanoConfig,
                                      enableSearchGrounding: event.target.checked,
                                    })
                                  }
                                />
                                Enable search grounding
                              </label>
                            ) : (
                              <div className="rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-[11px] text-black/60">
                                Search grounding unavailable for this model.
                              </div>
                            )}

                            <div
                              className={cn(
                                "rounded-xl border px-3 py-2 text-[11px]",
                                selectedNanoReferencesLimitExceeded
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : selectedNanoReferencesWarning
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-black/10 bg-[#fafafa] text-black/60"
                              )}
                            >
                              References connected: {selectedNanoReferenceCount}/{selectedNanoCapability.maxReferences}
                            </div>
                          </>
                        )}

                        {selectedNodeType === "veo3" && (
                          <>
                            <label className="text-[11px] uppercase tracking-wide text-black/45">Duration (s)</label>
                            <input
                              type="number"
                              min={3}
                              max={12}
                              value={Number(nodeDraft?.config?.durationSeconds ?? 6)}
                              onChange={(event) =>
                                updateNodeDraftConfig({
                                  durationSeconds: clamp(Number(event.target.value) || 6, 3, 12),
                                })
                              }
                              className={INPUT_CLASS}
                            />

                            <label className="text-[11px] uppercase tracking-wide text-black/45">Resolution</label>
                            <select
                              value={String(nodeDraft?.config?.resolution ?? "1080p")}
                              onChange={(event) => updateNodeDraftConfig({ resolution: event.target.value })}
                              className={INPUT_CLASS}
                            >
                              <option value="720p">720p</option>
                              <option value="1080p">1080p</option>
                              <option value="4k">4K</option>
                            </select>

                            <label className="text-[11px] uppercase tracking-wide text-black/45">Aspect ratio</label>
                            <select
                              value={String(nodeDraft?.config?.aspectRatio ?? "16:9")}
                              onChange={(event) => updateNodeDraftConfig({ aspectRatio: event.target.value })}
                              className={INPUT_CLASS}
                            >
                              <option value="16:9">16:9</option>
                              <option value="9:16">9:16</option>
                              <option value="1:1">1:1</option>
                            </select>
                          </>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!nodeDraftDirty}
                          onClick={() => void saveNodeDraft()}
                          className="inline-flex h-8 items-center rounded-xl border border-black bg-black px-3 text-xs font-semibold text-white transition hover:bg-white hover:text-black disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteNode({ nodeId: selectedNodeLayout.id as Id<"aiNodes"> });
                            setSelectedNodeId(null);
                          }}
                          className="inline-flex h-8 items-center gap-1 rounded-xl border border-black/15 px-2.5 text-xs font-semibold text-black transition hover:border-black/35 hover:bg-black hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className={PANEL_CARD_CLASS}>
                      <p className="mb-2 text-sm font-semibold text-black">I/O Ports</p>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="space-y-1">
                          <p className="font-semibold uppercase tracking-wide text-black/45">Inputs</p>
                          {selectedNodeLayout.inputs.length === 0 ? (
                            <p className="text-black/45">None</p>
                          ) : (
                            selectedNodeLayout.inputs.map((port) => (
                              <p key={port.id} className="text-black/70">
                                {port.label} <span className="text-black/45">({port.kind})</span>
                              </p>
                            ))
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold uppercase tracking-wide text-black/45">Outputs</p>
                          {selectedNodeLayout.outputs.length === 0 ? (
                            <p className="text-black/45">None</p>
                          ) : (
                            selectedNodeLayout.outputs.map((port) => (
                              <p key={port.id} className="text-black/70">
                                {port.label} <span className="text-black/45">({port.kind})</span>
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={PANEL_CARD_CLASS}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-black">Output Versions</p>
                        <span className="text-xs text-black/50">{selectedNodeOutputs?.length ?? 0}</span>
                      </div>
                      <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                        {(selectedNodeOutputs ?? []).map((output: any) => (
                          <div key={output._id} className="rounded-xl border border-black/10 bg-white p-2.5">
                            {output.publicUrl && output.mimeType?.startsWith("image/") ? (
                              <img
                                src={output.publicUrl}
                                alt={output.title ?? "Output"}
                                className="h-24 w-full rounded-lg border border-black/10 object-cover"
                              />
                            ) : output.publicUrl && output.mimeType?.startsWith("video/") ? (
                              <video
                                src={output.publicUrl}
                                className="h-24 w-full rounded-lg border border-black/10 object-cover"
                                muted
                                playsInline
                              />
                            ) : (
                              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-black/20 text-xs text-black/45">
                                {output.outputType}
                              </div>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                              <a
                                href={output.publicUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-black hover:text-black/70"
                              >
                                v{output.version}
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  void markOutputPinned({
                                    outputId: output._id as Id<"aiNodeOutputs">,
                                    pinned: !output.pinned,
                                  })
                                }
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/15 text-black/60 transition hover:text-black"
                                title={output.pinned ? "Unpin output" : "Pin output"}
                              >
                                {output.pinned ? (
                                  <Pin className="h-3.5 w-3.5" />
                                ) : (
                                  <PinOff className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                        {(selectedNodeOutputs ?? []).length === 0 && (
                          <div className="rounded-xl border border-dashed border-black/20 px-3 py-5 text-center text-xs text-black/45">
                            No versions produced yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={PANEL_CARD_CLASS}>
                      <p className="mb-2 text-sm font-semibold text-black">Node Runs</p>
                      <div className="max-h-[190px] space-y-1.5 overflow-y-auto pr-1">
                        {selectedNodeRuns.map((run: any) => (
                          <div key={run._id} className="rounded-xl border border-black/10 bg-white px-2.5 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                                  getRunToneClasses(run.status)
                                )}
                              >
                                {formatStatus(run.status)}
                              </span>
                              <span className="text-black/45">
                                {new Date(run.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {(run.providerModelId || run.executionMode) && (
                              <p className="mt-1 text-[10px] text-black/55">
                                {run.providerModelId ? run.providerModelId : "model n/a"}
                                {run.executionMode ? ` • ${run.executionMode}` : ""}
                              </p>
                            )}
                            {run.providerErrorMessage && (
                              <p className="mt-1 text-rose-600">{run.providerErrorMessage}</p>
                            )}
                            {run.validationError && !run.providerErrorMessage && (
                              <p className="mt-1 text-amber-600">{run.validationError}</p>
                            )}
                          </div>
                        ))}
                        {selectedNodeRuns.length === 0 && (
                          <div className="rounded-xl border border-dashed border-black/20 px-3 py-4 text-center text-xs text-black/45">
                            No runs yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={PANEL_CARD_CLASS}>
                    <p className="mb-2 text-sm font-semibold text-black">No Node Selected</p>
                    <ul className="space-y-1.5 text-xs text-black/70">
                      <li className="flex items-start gap-2">
                        <Search className="mt-0.5 h-3.5 w-3.5 text-black/45" />
                        Add nodes with <span className="font-semibold text-black">Tab</span> and choose from the
                        floating command menu.
                      </li>
                      <li className="flex items-start gap-2">
                        <Link2 className="mt-0.5 h-3.5 w-3.5 text-black/45" />
                        Drag from output ports to input ports to create connections.
                      </li>
                      <li className="flex items-start gap-2">
                        <Play className="mt-0.5 h-3.5 w-3.5 text-black/45" />
                        Run single nodes or entire flow manually.
                      </li>
                    </ul>
                  </div>
                )}

                {selectedEdge && (
                  <div className={PANEL_CARD_CLASS}>
                    <p className="mb-2 text-sm font-semibold text-black">Selected Connection</p>
                    <p className="text-xs text-black/70">
                      {nodeLayoutById.get(selectedEdge.sourceNodeId)?.node.title ?? "Node"} (
                      {selectedEdge.sourcePort}) {"->"}{" "}
                      {nodeLayoutById.get(selectedEdge.targetNodeId)?.node.title ?? "Node"} (
                      {selectedEdge.targetPort})
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteEdge({ edgeId: selectedEdge.id as Id<"aiEdges"> });
                        setSelectedEdgeId(null);
                      }}
                      className="mt-2 inline-flex h-8 items-center gap-1 rounded-xl border border-black/15 px-2.5 text-xs font-semibold text-black transition hover:border-black/35 hover:bg-black hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove connection
                    </button>
                  </div>
                )}

                <div className={PANEL_CARD_CLASS}>
                  <p className="mb-2 text-sm font-semibold text-black">Workflow Runs</p>
                  <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                    {(workflowRuns ?? []).slice(0, 12).map((run: any) => (
                      <div key={run._id} className="rounded-xl border border-black/10 bg-white px-2.5 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-black">
                            {run.runType === "workflow" ? "Flow" : "Node"}
                          </span>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                              getRunToneClasses(run.status)
                            )}
                          >
                            {formatStatus(run.status)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-black/45">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                          <span>{formatUsd(run.estimatedUsd)}</span>
                        </div>
                        {run.error && (
                          <p className="mt-1 inline-flex items-center gap-1 text-rose-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {run.error}
                          </p>
                        )}
                      </div>
                    ))}
                    {(workflowRuns ?? []).length === 0 && (
                      <div className="rounded-xl border border-dashed border-black/20 px-3 py-4 text-center text-xs text-black/45">
                        No workflow runs yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className={PANEL_CARD_CLASS}>
                  <p className="mb-2 text-sm font-semibold text-black">Node Runs Feed</p>
                  <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                    {(nodeRuns ?? []).slice(0, 14).map((run: any) => (
                      <div key={run._id} className="rounded-xl border border-black/10 bg-white px-2.5 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-black">{run.nodeTitle}</span>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                              getRunToneClasses(run.status)
                            )}
                          >
                            {formatStatus(run.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-black/45">{new Date(run.createdAt).toLocaleTimeString()}</p>
                        {(run.providerModelId || run.executionMode) && (
                          <p className="mt-1 text-[10px] text-black/55">
                            {run.providerModelId ? run.providerModelId : "model n/a"}
                            {run.executionMode ? ` • ${run.executionMode}` : ""}
                          </p>
                        )}
                        {(run.providerErrorMessage || run.validationError) && (
                          <p className="mt-1 text-rose-600">{run.providerErrorMessage || run.validationError}</p>
                        )}
                      </div>
                    ))}
                    {(nodeRuns ?? []).length === 0 && (
                      <div className="rounded-xl border border-dashed border-black/20 px-3 py-4 text-center text-xs text-black/45">
                        No node runs yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SubnetworkPage = (props: SubnetworkPageProps) => {
  return (
    <Room
      roomId={`subnetwork:${props.subnetworkId}`}
      fallback={<div className="p-6 text-sm text-neutral-500">Loading collaboration...</div>}
    >
      <EditorSurface {...props} />
    </Room>
  );
};

export default SubnetworkPage;
