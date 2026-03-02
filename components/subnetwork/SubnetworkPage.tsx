import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Cable,
  ChevronLeft,
  ImageIcon,
  Link2,
  Pin,
  PinOff,
  Play,
  Search,
  Sparkles,
  TextCursorInput,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Room } from "@/components/room";
import { useOthersMapped, useUpdateMyPresence } from "@/liveblocks.config";
import { useResourcePermissions } from "@/hooks/use-resource-permissions";
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
  type: AiNodeType;
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
    accentClass: "text-black",
    borderClass: "border-cyan-500/50",
    glowClass: "shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_8px_24px_rgba(8,145,178,0.25)]",
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
    accentClass: "text-emerald-300",
    borderClass: "border-emerald-500/50",
    glowClass: "shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_8px_24px_rgba(5,150,105,0.25)]",
    size: { width: 272, height: 168 },
    defaultConfig: {
      urlsText: "",
    },
  },
  {
    type: "nano_banana_pro",
    title: "Nano Banana Pro",
    description: "Google image generation node with prompt + references",
    icon: Sparkles,
    accentClass: "text-amber-300",
    borderClass: "border-amber-500/50",
    glowClass: "shadow-[0_0_0_1px_rgba(245,158,11,0.45),0_8px_24px_rgba(217,119,6,0.25)]",
    size: { width: 286, height: 178 },
    defaultConfig: {
      resolution: "1024x1024",
      variations: 1,
      stylePreset: "",
    },
  },
  {
    type: "veo3",
    title: "Veo3",
    description: "Google video generation node from prompt and optional frames",
    icon: Video,
    accentClass: "text-rose-300",
    borderClass: "border-rose-500/50",
    glowClass: "shadow-[0_0_0_1px_rgba(251,113,133,0.45),0_8px_24px_rgba(225,29,72,0.25)]",
    size: { width: 286, height: 192 },
    defaultConfig: {
      durationSeconds: 6,
      resolution: "1080p",
      aspectRatio: "16:9",
    },
  },
];

const NODE_PORTS: Record<AiNodeType, { inputs: PortDefinition[]; outputs: PortDefinition[] }> = {
  prompt: {
    inputs: [],
    outputs: [{ id: "prompt", label: "Prompt", kind: "text" }],
  },
  image_reference: {
    inputs: [],
    outputs: [{ id: "images", label: "Images", kind: "images" }],
  },
  nano_banana_pro: {
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
  const normalized = (type || "").toLowerCase() as AiNodeType;
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
  const normalized = (type || "").toLowerCase() as AiNodeType;
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
  const launchNode = useMutation(api.aiRuns.launchNode);
  const launchWorkflow = useMutation(api.aiRuns.launchWorkflow);
  const markOutputPinned = useMutation(api.aiOutputs.markPinned);
  const updateSubnetwork = useMutation(api.aiSubnetworks.update);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 220, y: 120, scale: 1 });
  const cameraRef = useRef(camera);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const panRef = useRef<PanState | null>(null);
  const dragRef = useRef<DragNodeState | null>(null);
  const connectionRef = useRef<ConnectionDraft | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
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

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (panRef.current) {
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

      if (dragRef.current) {
        const drag = dragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = clientToWorldPoint(event.clientX, event.clientY);
        const nextPosition = {
          x: world.x - drag.offset.x,
          y: world.y - drag.offset.y,
        };
        setNodePositionOverrides((current) => ({
          ...current,
          [drag.nodeId]: nextPosition,
        }));
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

      if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
        const drag = dragRef.current;
        dragRef.current = null;

        const finalPosition = nodePositionOverridesRef.current[drag.nodeId];
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
  }, [clientToViewportPoint, clientToWorldPoint, updateNode]);

  const graphNodes = graph?.nodes ?? [];
  const graphEdges = graph?.edges ?? [];

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
      const template = getTemplateForType(node.type);
      const ports = getNodePorts(node.type);
      return {
        id,
        node,
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
    return grouped;
  }, [outputs]);

  const latestNodeRunByNodeId = useMemo(() => {
    const map = new Map<string, any>();
    const sorted = [...(nodeRuns ?? [])].sort((a: any, b: any) => b.createdAt - a.createdAt);
    for (const run of sorted) {
      const key = String(run.nodeId);
      if (!map.has(key)) {
        map.set(key, run);
      }
    }
    return map;
  }, [nodeRuns]);

  const selectedNodeLayout = selectedNodeId ? nodeLayoutById.get(selectedNodeId) ?? null : null;

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
      config: clonePlain((selectedNodeLayout.node.config as Record<string, any>) ?? {}),
    });
    setNodeDraftDirty(false);
  }, [selectedNodeLayout?.id, selectedNodeLayout?.node.updatedAt]);

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
      await updateNode({
        nodeId: selectedNodeLayout.node._id as Id<"aiNodes">,
        title: nodeDraft.title.trim() || selectedNodeLayout.template.title,
        config: nodeDraft.config,
      });
      setNodeDraftDirty(false);
      toast.success("Node updated");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [nodeDraft, nodeDraftDirty, selectedNodeLayout, updateNode]);

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
      backgroundColor: "#ffffff",
      backgroundImage:
        "radial-gradient(circle at 1px 1px, rgba(23,23,23,0.18) 1px, rgba(0,0,0,0) 0)",
      backgroundSize: px,
      backgroundPosition: `${camera.x}px ${camera.y}px`,
    } as React.CSSProperties;
  }, [camera.scale, camera.x, camera.y]);

  if (permissions.isLoading || subnetwork === undefined || graph === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm font-medium text-neutral-500">Loading subnetwork...</div>
      </div>
    );
  }

  if (!subnetwork) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Subnetwork not found</h2>
        <p className="mt-2 text-sm text-slate-600">This subnetwork may have been removed.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Back to board
        </button>
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Editors only</h2>
        <p className="mt-2 text-sm text-amber-800">
          Viewer role can inspect outputs on the board, but cannot enter the subnetwork editor.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800"
        >
          Back to board
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex h-screen w-screen flex-col overflow-hidden bg-white text-black">
      <PresenceTracker />
      <PresenceLayer />

      <header className="flex items-center justify-between border-b border-black bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center border border-black bg-white text-black hover:bg-black hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Subnetwork</p>
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
                className="h-8 w-[320px] max-w-full border border-black px-2 text-sm font-semibold text-black outline-none focus:ring-1 focus:ring-black"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsRenamingTitle(true)}
                className="truncate border border-transparent px-1 -mx-1 text-left text-sm font-semibold text-black hover:border-black"
                title="Click to rename"
              >
                {subnetwork.title}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="border border-black px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-700">
            Tab to add nodes
          </span>
          <button
            type="button"
            onClick={() => void handleRunWorkflow()}
            disabled={runningWorkflow || nodeLayouts.length === 0}
            className="inline-flex h-9 items-center gap-2 border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="h-4 w-4" />
            {runningWorkflow ? "Running Flow..." : "Run Flow"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={viewportRef}
          className="relative min-w-0 flex-1 overflow-hidden overscroll-none bg-white"
          style={{
            cursor: isPanning ? "grabbing" : isSpacePressed ? "grab" : "default",
          }}
          onPointerDown={handleViewportPointerDown}
          onContextMenu={handleViewportContextMenu}
          onWheel={handleViewportWheel}
        >
          <div className="absolute inset-0" style={backgroundStyle} />

          <svg className="absolute inset-0 z-10 h-full w-full overflow-visible">
            {edgeRenderData.map((edge) => {
              const selected = edge.id === selectedEdgeId;
              const highlighted = selected || edge.sourceNodeId === selectedNodeId || edge.targetNodeId === selectedNodeId;

              return (
                <g key={edge.id}>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={highlighted ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.35)"}
                    strokeWidth={EDGE_STROKE_WIDTH}
                  />
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="cursor-pointer"
                    style={{ pointerEvents: "stroke" }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                      closeCommandMenu();
                    }}
                  />
                </g>
              );
            })}

            {connectionDraft && (() => {
              const sourceLayout = nodeLayoutById.get(connectionDraft.sourceNodeId);
              if (!sourceLayout) return null;
              const sourceWorld = getPortWorldPoint(sourceLayout, "output", connectionDraft.sourcePortId);
              const sourceViewport = worldToViewportPoint(sourceWorld);
              const path = buildEdgePath(sourceViewport, connectionDraft.pointer);
              return (
                <path
                  d={path}
                  fill="none"
                  stroke="rgba(0,0,0,0.88)"
                  strokeDasharray="5 4"
                  strokeWidth={2.5}
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
              const isRunning = runningNodeId === layout.id;
              const outputCount = outputsByNode.get(layout.id)?.length ?? 0;
              const latestRun = latestNodeRunByNodeId.get(layout.id);
              const Icon = layout.template.icon;

              return (
                <article
                  key={layout.id}
                  className={`absolute overflow-visible border bg-white text-black transition ${
                    selected
                      ? "border-black shadow-[0_0_0_1px_rgba(0,0,0,1)]"
                      : "border-black shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
                  }`}
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
                    event.stopPropagation();

                    setSelectedNodeId(layout.id);
                    setSelectedEdgeId(null);
                    closeCommandMenu();

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
                  <div className="flex items-start justify-between border-b border-black px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                        {layout.node.type}
                      </p>
                      <h3 className="truncate text-sm font-semibold text-black">{layout.node.title}</h3>
                    </div>
                    <div className="ml-2 inline-flex h-8 w-8 items-center justify-center border border-black bg-white">
                      <Icon className="h-4 w-4 text-black" />
                    </div>
                  </div>

                  <div className="space-y-2 px-3 py-2 text-xs text-neutral-700">
                    <div className="flex items-center justify-between">
                      <span>Outputs</span>
                      <span className="font-semibold text-black">{outputCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last status</span>
                      <span className="font-semibold text-black">
                        {latestRun ? formatStatus(latestRun.status) : "Idle"}
                      </span>
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRunNode(layout.id);
                        }}
                        className="inline-flex h-8 w-full items-center justify-center gap-1.5 border border-black bg-white text-xs font-semibold text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {isRunning ? "Running..." : "Run Node"}
                      </button>
                    </div>
                  </div>

                  {layout.inputs.map((port, index) => {
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
                        className={`absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                          compatible
                            ? "border-black bg-black shadow-[0_0_0_2px_rgba(0,0,0,0.18)]"
                            : "border-black bg-white"
                        }`}
                        style={{
                          left: 0,
                          top: 58 + index * 24,
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

                  {layout.outputs.map((port, index) => (
                    <button
                      key={`${layout.id}-out-${port.id}`}
                      type="button"
                      data-port-handle="true"
                      className="absolute z-20 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border border-black bg-black shadow-[0_0_0_2px_rgba(0,0,0,0.18)]"
                      style={{
                        right: 0,
                        top: 58 + index * 24,
                      }}
                      onPointerDown={(event) => {
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
                  ))}
                </article>
              );
            })}
          </div>

          <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1 border border-black bg-white p-1 text-xs text-black">
            <button
              type="button"
              onClick={() => {
                const nextScale = clamp(camera.scale / 1.15, MIN_ZOOM, MAX_ZOOM);
                setCamera((current) => ({
                  ...current,
                  scale: nextScale,
                }));
              }}
              className="px-2 py-1 hover:bg-black hover:text-white"
            >
              -
            </button>
            <span className="min-w-14 text-center font-semibold">{Math.round(camera.scale * 100)}%</span>
            <button
              type="button"
              onClick={() => {
                const nextScale = clamp(camera.scale * 1.15, MIN_ZOOM, MAX_ZOOM);
                setCamera((current) => ({
                  ...current,
                  scale: nextScale,
                }));
              }}
              className="px-2 py-1 hover:bg-black hover:text-white"
            >
              +
            </button>
          </div>

          {commandMenu && (
            <div
              ref={commandMenuRef}
              className="absolute z-40 w-[360px] overflow-hidden border border-black bg-white shadow-[0_24px_64px_rgba(0,0,0,0.25)]"
              style={{ left: commandMenu.x, top: commandMenu.y }}
              data-subnetwork-command-menu="true"
              onPointerDown={(event) => {
                // Keep menu interactions local: otherwise viewport onPointerDown
                // closes the menu before item onClick can create a node.
                event.stopPropagation();
              }}
              onContextMenu={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="border-b border-black p-3">
                <div className="flex items-center gap-2 border border-black bg-white px-2">
                  <Search className="h-4 w-4 text-neutral-500" />
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
                    placeholder="Search node types..."
                    className="h-10 w-full bg-transparent text-sm text-black outline-none placeholder:text-neutral-500"
                  />
                </div>
              </div>
              <div className="max-h-[260px] overflow-y-auto p-2">
                {filteredTemplates.length === 0 ? (
                  <div className="border border-dashed border-black px-3 py-6 text-center text-sm text-neutral-500">
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
                        className="mb-1 flex w-full items-start gap-3 border border-transparent px-3 py-2 text-left hover:border-black hover:bg-neutral-100 disabled:opacity-45"
                      >
                        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center border border-black bg-white">
                          <Icon className="h-4 w-4 text-black" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-black">{template.title}</p>
                          <p className="text-xs text-neutral-500">{template.description}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="w-[360px] border-l border-black bg-white p-4 overflow-y-auto overscroll-none">
          <div className="space-y-3">
            <div className="border border-black bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Costs</p>
              <div className="mt-2 space-y-1.5 text-xs text-neutral-700">
                <p className="flex items-center justify-between">
                  <span>Selected run estimate</span>
                  <span className="font-semibold text-black">
                    {formatUsd(selectedNodeCostSummary?.selectedRunEstimateUsd)}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Subnetwork total</span>
                  <span className="font-semibold text-black">
                    {formatUsd(selectedNodeCostSummary?.subnetworkTotalUsd)}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Monthly total</span>
                  <span className="font-semibold text-black">
                    {formatUsd(selectedNodeCostSummary?.monthlyTotalUsd)}
                  </span>
                </p>
              </div>
            </div>

            {selectedNodeLayout ? (
              <div className="space-y-3">
                <div className="border border-black bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-black">Node Details</p>
                    <button
                      type="button"
                      onClick={() => void handleRunNode(selectedNodeLayout.id)}
                      disabled={runningNodeId === selectedNodeLayout.id}
                      className="inline-flex h-8 items-center gap-1 border border-black px-2.5 text-xs font-semibold text-black hover:bg-black hover:text-white disabled:opacity-45"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Run
                    </button>
                  </div>

                  <label className="text-[11px] uppercase tracking-wide text-neutral-500">Title</label>
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
                    className="mt-1 h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
                  />

                  <div className="mt-3 space-y-2 text-xs text-neutral-700">
                    {selectedNodeLayout.node.type === "prompt" && (
                      <>
                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Prompt text</label>
                        <textarea
                          rows={5}
                          value={String(nodeDraft?.config?.text ?? "")}
                          onChange={(event) => updateNodeDraftConfig({ text: event.target.value })}
                          className="w-full rounded-md border border-black bg-white px-2.5 py-2 text-sm text-black outline-none focus:border-black"
                          placeholder="Describe what to generate..."
                        />
                      </>
                    )}

                    {selectedNodeLayout.node.type === "image_reference" && (
                      <>
                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">
                          Reference URLs (one per line)
                        </label>
                        <textarea
                          rows={5}
                          value={String(nodeDraft?.config?.urlsText ?? "")}
                          onChange={(event) => updateNodeDraftConfig({ urlsText: event.target.value })}
                          className="w-full rounded-md border border-black bg-white px-2.5 py-2 text-sm text-black outline-none focus:border-black"
                          placeholder="https://..."
                        />
                      </>
                    )}

                    {selectedNodeLayout.node.type === "nano_banana_pro" && (
                      <>
                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Resolution</label>
                        <select
                          value={String(nodeDraft?.config?.resolution ?? "1024x1024")}
                          onChange={(event) => updateNodeDraftConfig({ resolution: event.target.value })}
                          className="h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
                        >
                          <option value="1024x1024">1024 x 1024</option>
                          <option value="1536x1024">1536 x 1024</option>
                          <option value="1024x1536">1024 x 1536</option>
                        </select>

                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Variations</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={Number(nodeDraft?.config?.variations ?? 1)}
                          onChange={(event) =>
                            updateNodeDraftConfig({ variations: clamp(Number(event.target.value) || 1, 1, 8) })
                          }
                          className="h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
                        />

                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Style preset</label>
                        <input
                          value={String(nodeDraft?.config?.stylePreset ?? "")}
                          onChange={(event) => updateNodeDraftConfig({ stylePreset: event.target.value })}
                          className="h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
                          placeholder="cinematic, realistic..."
                        />
                      </>
                    )}

                    {selectedNodeLayout.node.type === "veo3" && (
                      <>
                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Duration (s)</label>
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
                          className="h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
                        />

                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Resolution</label>
                        <select
                          value={String(nodeDraft?.config?.resolution ?? "1080p")}
                          onChange={(event) => updateNodeDraftConfig({ resolution: event.target.value })}
                          className="h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
                          <option value="4k">4K</option>
                        </select>

                        <label className="text-[11px] uppercase tracking-wide text-neutral-500">Aspect ratio</label>
                        <select
                          value={String(nodeDraft?.config?.aspectRatio ?? "16:9")}
                          onChange={(event) => updateNodeDraftConfig({ aspectRatio: event.target.value })}
                          className="h-9 w-full rounded-md border border-black bg-white px-2.5 text-sm text-black outline-none focus:border-black"
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
                      className="inline-flex h-8 items-center border border-black bg-black px-3 text-xs font-semibold text-white hover:bg-white hover:text-black disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteNode({ nodeId: selectedNodeLayout.id as Id<"aiNodes"> });
                        setSelectedNodeId(null);
                      }}
                      className="inline-flex h-8 items-center gap-1 border border-black px-2.5 text-xs font-semibold text-black hover:bg-black hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="border border-black bg-white p-3">
                  <p className="mb-2 text-sm font-semibold text-black">I/O Ports</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="space-y-1">
                      <p className="font-semibold uppercase tracking-wide text-neutral-500">Inputs</p>
                      {selectedNodeLayout.inputs.length === 0 ? (
                        <p className="text-neutral-500">None</p>
                      ) : (
                        selectedNodeLayout.inputs.map((port) => (
                          <p key={port.id} className="text-neutral-700">
                            {port.label} <span className="text-neutral-500">({port.kind})</span>
                          </p>
                        ))
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold uppercase tracking-wide text-neutral-500">Outputs</p>
                      {selectedNodeLayout.outputs.length === 0 ? (
                        <p className="text-neutral-500">None</p>
                      ) : (
                        selectedNodeLayout.outputs.map((port) => (
                          <p key={port.id} className="text-neutral-700">
                            {port.label} <span className="text-neutral-500">({port.kind})</span>
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="border border-black bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-black">Output Versions</p>
                    <span className="text-xs text-neutral-500">{selectedNodeOutputs?.length ?? 0}</span>
                  </div>
                  <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                    {(selectedNodeOutputs ?? []).map((output: any) => (
                      <div key={output._id} className="rounded-lg border border-black bg-white p-2">
                        {output.publicUrl && output.mimeType?.startsWith("image/") ? (
                          <img
                            src={output.publicUrl}
                            alt={output.title ?? "Output"}
                            className="h-24 w-full rounded-md border border-black object-cover"
                          />
                        ) : output.publicUrl && output.mimeType?.startsWith("video/") ? (
                          <video
                            src={output.publicUrl}
                            className="h-24 w-full rounded-md border border-black object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-black text-xs text-neutral-500">
                            {output.outputType}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <a
                            href={output.publicUrl ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-black hover:text-neutral-700"
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
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-black text-neutral-700 hover:text-black"
                            title={output.pinned ? "Unpin output" : "Pin output"}
                          >
                            {output.pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {(selectedNodeOutputs ?? []).length === 0 && (
                      <div className="rounded-lg border border-dashed border-black px-3 py-5 text-center text-xs text-neutral-500">
                        No versions produced yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-black bg-white p-3">
                  <p className="mb-2 text-sm font-semibold text-black">Node Runs</p>
                  <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                    {selectedNodeRuns.map((run: any) => (
                      <div key={run._id} className="rounded-md border border-black bg-white px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-black">{formatStatus(run.status)}</span>
                          <span className="text-neutral-500">
                            {new Date(run.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {run.providerErrorMessage && (
                          <p className="mt-1 text-rose-300">{run.providerErrorMessage}</p>
                        )}
                        {run.validationError && !run.providerErrorMessage && (
                          <p className="mt-1 text-amber-300">{run.validationError}</p>
                        )}
                      </div>
                    ))}
                    {selectedNodeRuns.length === 0 && (
                      <div className="rounded-md border border-dashed border-black px-3 py-4 text-center text-xs text-neutral-500">
                        No runs yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border border-black bg-white p-3">
                  <p className="mb-2 text-sm font-semibold text-black">No Node Selected</p>
                  <ul className="space-y-1.5 text-xs text-neutral-700">
                    <li className="flex items-start gap-2">
                      <Search className="mt-0.5 h-3.5 w-3.5 text-neutral-500" />
                      Add nodes with <span className="font-semibold text-black">Tab</span> and choose from the
                      floating command menu.
                    </li>
                    <li className="flex items-start gap-2">
                      <Link2 className="mt-0.5 h-3.5 w-3.5 text-neutral-500" />
                      Drag from output ports to input ports to create connections.
                    </li>
                    <li className="flex items-start gap-2">
                      <Play className="mt-0.5 h-3.5 w-3.5 text-neutral-500" />
                      Run single nodes or entire flow manually.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {selectedEdge && (
              <div className="border border-black bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-black">Selected Connection</p>
                <p className="text-xs text-neutral-700">
                  {nodeLayoutById.get(selectedEdge.sourceNodeId)?.node.title ?? "Node"} ({selectedEdge.sourcePort}) {"->"}{" "}
                  {nodeLayoutById.get(selectedEdge.targetNodeId)?.node.title ?? "Node"} ({selectedEdge.targetPort})
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void deleteEdge({ edgeId: selectedEdge.id as Id<"aiEdges"> });
                    setSelectedEdgeId(null);
                  }}
                  className="mt-2 inline-flex h-8 items-center gap-1 border border-black px-2.5 text-xs font-semibold text-black hover:bg-black hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove connection
                </button>
              </div>
            )}

            <div className="border border-black bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-black">Workflow Runs</p>
              <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                {(workflowRuns ?? []).slice(0, 12).map((run: any) => (
                  <div key={run._id} className="rounded-md border border-black bg-white px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-black">{run.runType === "workflow" ? "Flow" : "Node"}</span>
                      <span className="text-neutral-500">{formatStatus(run.status)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-neutral-500">
                      <span>{new Date(run.createdAt).toLocaleString()}</span>
                      <span>{formatUsd(run.estimatedUsd)}</span>
                    </div>
                    {run.error && (
                      <p className="mt-1 inline-flex items-center gap-1 text-rose-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {run.error}
                      </p>
                    )}
                  </div>
                ))}
                {(workflowRuns ?? []).length === 0 && (
                  <div className="rounded-md border border-dashed border-black px-3 py-4 text-center text-xs text-neutral-500">
                    No workflow runs yet.
                  </div>
                )}
              </div>
            </div>

            <div className="border border-black bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-black">Node Runs Feed</p>
              <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                {(nodeRuns ?? []).slice(0, 14).map((run: any) => (
                  <div key={run._id} className="rounded-md border border-black bg-white px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-black">{run.nodeTitle}</span>
                      <span className="text-neutral-500">{formatStatus(run.status)}</span>
                    </div>
                    <p className="mt-1 text-neutral-500">{new Date(run.createdAt).toLocaleTimeString()}</p>
                    {(run.providerErrorMessage || run.validationError) && (
                      <p className="mt-1 text-rose-300">{run.providerErrorMessage || run.validationError}</p>
                    )}
                  </div>
                ))}
                {(nodeRuns ?? []).length === 0 && (
                  <div className="rounded-md border border-dashed border-black px-3 py-4 text-center text-xs text-neutral-500">
                    No node runs yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
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
