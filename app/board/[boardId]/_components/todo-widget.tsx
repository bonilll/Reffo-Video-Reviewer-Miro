"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { nanoid } from "nanoid";
import { useMutation as useConvexMutation, useQuery } from "convex/react";
import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableSyntheticListeners,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers3,
  ListTodo,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { colorToCSS } from "@/lib/utils";
import type {
  TodoWidgetGroup,
  TodoWidgetLayer,
  TodoWidgetSubtask,
  TodoWidgetTask,
} from "@/types/canvas";

interface TodoWidgetProps {
  widgetId: string;
  layer: TodoWidgetLayer;
  onPropsChange: (props: Partial<TodoWidgetLayer>) => void;
  isSelected: boolean;
  onFocus: () => void;
  camera?: { x: number; y: number; scale: number };
}

type EditingTarget =
  | { type: "title" }
  | { type: "group"; groupId: string }
  | { type: "task"; groupId: string; taskId: string }
  | { type: "subtask"; groupId: string; taskId: string; subtaskId: string };

type TodoDragData =
  | { kind: "group"; groupId: string }
  | { kind: "task"; taskId: string }
  | { kind: "subtask"; subtaskId: string }
  | { kind: "task-container"; groupId: string }
  | { kind: "subtask-container"; taskId: string };

interface SortableShellProps {
  id: UniqueIdentifier;
  data: TodoDragData;
  className?: string;
  children: (args: {
    attributes: Record<string, any>;
    listeners: DraggableSyntheticListeners | undefined;
    isDragging: boolean;
    isOver: boolean;
  }) => React.ReactNode;
}

interface DroppableShellProps {
  id: UniqueIdentifier;
  data: TodoDragData;
  className?: string;
  children: React.ReactNode;
}

const SortableShell = memo(
  ({ id, data, className, children }: SortableShellProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
      useSortable({
        id,
        data,
        transition: {
          duration: 120,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        },
        animateLayoutChanges: (args) =>
          args.isSorting || args.wasDragging ? false : defaultAnimateLayoutChanges(args),
      });

    return (
      <div
        ref={setNodeRef}
        className={`${className || ""}${isDragging ? " opacity-80" : ""}${isOver ? " ring-2 ring-blue-200" : ""}`}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
      >
        {children({
          attributes: attributes as Record<string, any>,
          listeners,
          isDragging,
          isOver,
        })}
      </div>
    );
  },
);

SortableShell.displayName = "SortableShell";

const DroppableShell = memo(({ id, data, className, children }: DroppableShellProps) => {
  const { setNodeRef, isOver } = useDroppable({ id, data });

  return (
    <div ref={setNodeRef} className={`${className || ""}${isOver ? " ring-2 ring-blue-200" : ""}`}>
      {children}
    </div>
  );
});

DroppableShell.displayName = "DroppableShell";

const GROUP_SORTABLE_ID_PREFIX = "todo-group:";
const TASK_SORTABLE_ID_PREFIX = "todo-task:";
const SUBTASK_SORTABLE_ID_PREFIX = "todo-subtask:";
const TASK_CONTAINER_ID_PREFIX = "todo-task-container:";
const SUBTASK_CONTAINER_ID_PREFIX = "todo-subtask-container:";

const groupSortableId = (groupId: string) => `${GROUP_SORTABLE_ID_PREFIX}${groupId}`;
const taskSortableId = (taskId: string) => `${TASK_SORTABLE_ID_PREFIX}${taskId}`;
const subtaskSortableId = (subtaskId: string) => `${SUBTASK_SORTABLE_ID_PREFIX}${subtaskId}`;
const taskContainerId = (groupId: string) => `${TASK_CONTAINER_ID_PREFIX}${groupId}`;
const subtaskContainerId = (taskId: string) => `${SUBTASK_CONTAINER_ID_PREFIX}${taskId}`;

const DEFAULT_BORDER_COLOR = { r: 226, g: 232, b: 240 };
const DEFAULT_FILL = { r: 255, g: 255, b: 255 };

const nowISO = () => new Date().toISOString();

const createGroup = (title = "Group"): TodoWidgetGroup => {
  const now = nowISO();
  return {
    id: `group_${nanoid(8)}`,
    title,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
    tasks: [],
  };
};

const createTask = (text = ""): TodoWidgetTask => {
  const now = nowISO();
  return {
    id: `task_${nanoid(8)}`,
    text,
    completed: false,
    createdAt: now,
    updatedAt: now,
    collapsed: false,
    subtasks: [],
  };
};

const createSubtask = (text = ""): TodoWidgetSubtask => {
  const now = nowISO();
  return {
    id: `sub_${nanoid(8)}`,
    text,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
};

const cloneGroups = (groups: TodoWidgetGroup[]): TodoWidgetGroup[] =>
  groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    })),
  }));

const parseTodoDragData = (raw: unknown): TodoDragData | null => {
  if (!raw || typeof raw !== "object" || !("kind" in raw)) return null;
  const data = raw as Partial<TodoDragData>;
  if (data.kind === "group" && typeof data.groupId === "string") return data as TodoDragData;
  if (data.kind === "task" && typeof data.taskId === "string") return data as TodoDragData;
  if (data.kind === "subtask" && typeof data.subtaskId === "string") return data as TodoDragData;
  if (data.kind === "task-container" && typeof data.groupId === "string") return data as TodoDragData;
  if (data.kind === "subtask-container" && typeof data.taskId === "string") return data as TodoDragData;
  return null;
};

const findTaskLocation = (groups: TodoWidgetGroup[], taskId: string) => {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const taskIndex = groups[groupIndex].tasks.findIndex((task) => task.id === taskId);
    if (taskIndex >= 0) {
      return { groupIndex, taskIndex };
    }
  }
  return null;
};

const findSubtaskLocation = (groups: TodoWidgetGroup[], subtaskId: string) => {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    for (let taskIndex = 0; taskIndex < group.tasks.length; taskIndex += 1) {
      const subtaskIndex = group.tasks[taskIndex].subtasks.findIndex(
        (subtask) => subtask.id === subtaskId,
      );
      if (subtaskIndex >= 0) {
        return { groupIndex, taskIndex, subtaskIndex };
      }
    }
  }
  return null;
};

const dragDataEntityId = (data: TodoDragData): string => {
  if (data.kind === "group" || data.kind === "task-container") return data.groupId;
  if (data.kind === "task" || data.kind === "subtask-container") return data.taskId;
  return data.subtaskId;
};

const normalizeGroups = (value: unknown): TodoWidgetGroup[] => {
  if (!Array.isArray(value)) return [];
  return value.map((rawGroup, groupIndex) => {
    const group = (rawGroup || {}) as any;
    const createdAt = typeof group.createdAt === "string" ? group.createdAt : nowISO();
    const updatedAt = typeof group.updatedAt === "string" ? group.updatedAt : createdAt;
    const rawTasks = Array.isArray(group.tasks) ? group.tasks : [];
    return {
      id: typeof group.id === "string" && group.id ? group.id : `group_${nanoid(8)}`,
      title:
        typeof group.title === "string" && group.title.trim()
          ? group.title
          : `Group ${groupIndex + 1}`,
      collapsed: Boolean(group.collapsed),
      createdAt,
      updatedAt,
      tasks: rawTasks.map((rawTask: any) => {
        const taskCreatedAt = typeof rawTask?.createdAt === "string" ? rawTask.createdAt : nowISO();
        const taskUpdatedAt = typeof rawTask?.updatedAt === "string" ? rawTask.updatedAt : taskCreatedAt;
        const rawSubtasks = Array.isArray(rawTask?.subtasks) ? rawTask.subtasks : [];
        return {
          id: typeof rawTask?.id === "string" && rawTask.id ? rawTask.id : `task_${nanoid(8)}`,
          text: typeof rawTask?.text === "string" ? rawTask.text : "",
          completed: Boolean(rawTask?.completed),
          createdAt: taskCreatedAt,
          updatedAt: taskUpdatedAt,
          collapsed: Boolean(rawTask?.collapsed),
          subtasks: rawSubtasks.map((rawSubtask: any) => {
            const subtaskCreatedAt =
              typeof rawSubtask?.createdAt === "string" ? rawSubtask.createdAt : nowISO();
            return {
              id:
                typeof rawSubtask?.id === "string" && rawSubtask.id
                  ? rawSubtask.id
                  : `sub_${nanoid(8)}`,
              text: typeof rawSubtask?.text === "string" ? rawSubtask.text : "",
              completed: Boolean(rawSubtask?.completed),
              createdAt: subtaskCreatedAt,
              updatedAt:
                typeof rawSubtask?.updatedAt === "string"
                  ? rawSubtask.updatedAt
                  : subtaskCreatedAt,
            };
          }),
        };
      }),
    };
  });
};

const pendingListCreationByWidget = new Map<string, Promise<Id<"todoLists">>>();
const resolvedListIdByWidget = new Map<string, Id<"todoLists">>();

export const TodoWidget = memo(
  ({ widgetId, layer, onPropsChange, isSelected }: TodoWidgetProps) => {
    const debugLog = useCallback((_step: string, _payload?: unknown) => {}, []);

    const layerListId =
      typeof layer.todoListId === "string" && layer.todoListId
        ? (layer.todoListId as Id<"todoLists">)
        : null;
    const [localListId, setLocalListId] = useState<Id<"todoLists"> | null>(null);
    const activeListId = localListId ?? layerListId;

    const listDoc = useQuery(api.todoLists.getById, activeListId ? { id: activeListId } : "skip");
    const createList = useConvexMutation(api.todoLists.create);
    const updateGroupsMutation = useConvexMutation(api.todoLists.updateGroups);
    const renameMutation = useConvexMutation(api.todoLists.rename);

    const [isCreatingList, setIsCreatingList] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
    const [draftText, setDraftText] = useState("");
    const [groups, setGroups] = useState<TodoWidgetGroup[]>([]);
    const [, startTransition] = useTransition();
    const groupsRef = useRef<TodoWidgetGroup[]>([]);
    const dragStartSnapshotRef = useRef<TodoWidgetGroup[] | null>(null);
    const dragChangedRef = useRef(false);
    const dragRafRef = useRef<number | null>(null);
    const pendingProjectionRef = useRef<{ activeData: TodoDragData; overData: TodoDragData } | null>(null);
    const lastProjectionKeyRef = useRef<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<TodoDragData | null>(null);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [hydratedListId, setHydratedListId] = useState<string | null>(null);
    const creatingRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    const remoteGroups = useMemo(() => normalizeGroups(listDoc?.groups), [listDoc?.groups]);

    useEffect(() => {
      groupsRef.current = groups;
    }, [groups]);

    useEffect(() => {
      return () => {
        if (dragRafRef.current != null) {
          cancelAnimationFrame(dragRafRef.current);
        }
      };
    }, []);

    useEffect(() => {
      debugLog("state snapshot", {
        title: layer.title,
        layerListId,
        localListId,
        activeListId,
        listDocState: listDoc === undefined ? "loading" : listDoc === null ? "null" : "ready",
        groupsCount: groups.length,
        remoteGroupsCount: remoteGroups.length,
        hydratedListId,
        isCreatingList,
        initError,
      });
    }, [
      activeListId,
      debugLog,
      groups.length,
      hydratedListId,
      initError,
      isCreatingList,
      layer.title,
      layerListId,
      listDoc,
      localListId,
      remoteGroups.length,
    ]);

    useEffect(() => {
      if (!layer.borderColor || typeof layer.borderWidth !== "number") {
        debugLog("applying default layer styles", {
          hasBorderColor: Boolean(layer.borderColor),
          borderWidth: layer.borderWidth,
        });
        onPropsChange({
          borderColor: layer.borderColor || DEFAULT_BORDER_COLOR,
          borderWidth: typeof layer.borderWidth === "number" ? layer.borderWidth : 1,
        });
      }
      if (typeof layer.showCompleted !== "boolean") {
        debugLog("applying default showCompleted=true");
        onPropsChange({ showCompleted: true });
      }
      if (!layer.title || !layer.title.trim()) {
        debugLog("applying default title");
        onPropsChange({ title: "Todo list" });
      }
    }, [debugLog, layer.borderColor, layer.borderWidth, layer.showCompleted, layer.title, onPropsChange]);

    useEffect(() => {
      if (localListId && layerListId && localListId === layerListId) {
        debugLog("localListId synchronized to layerListId", { localListId, layerListId });
        setLocalListId(null);
      }
    }, [debugLog, layerListId, localListId]);

    useEffect(() => {
      if (!activeListId) {
        debugLog("activeListId cleared, resetting hydration marker");
        setHydratedListId(null);
      }
    }, [activeListId, debugLog]);

    useEffect(() => {
      if (!listDoc || !activeListId) return;
      const isFirstHydrationForList = hydratedListId !== activeListId;
      debugLog("hydration effect", {
        activeListId,
        hydratedListId,
        isFirstHydrationForList,
        remoteGroupsCount: remoteGroups.length,
        currentGroupsCount: groups.length,
      });
      if (isFirstHydrationForList) {
        setGroups((current) => (current.length > 0 ? current : remoteGroups));
        setHydratedListId(activeListId);
      } else if (remoteGroups.length > 0) {
        setGroups((current) => (current.length === 0 ? remoteGroups : current));
      }
      if (listDoc.name && listDoc.name !== layer.title) {
        debugLog("syncing layer title from listDoc", { from: layer.title, to: listDoc.name });
        onPropsChange({ title: listDoc.name });
      }
    }, [activeListId, debugLog, groups.length, hydratedListId, layer.title, listDoc, onPropsChange, remoteGroups]);

    useEffect(() => {
      if (isCreatingList) {
        debugLog("init skipped: already creating");
        return;
      }
      if (initError) {
        debugLog("init skipped: initError present", { initError });
        return;
      }
      if (activeListId && listDoc === undefined) {
        debugLog("init skipped: waiting listDoc loading", { activeListId });
        return;
      }
      if (activeListId && listDoc !== null) {
        debugLog("init skipped: list already exists", { activeListId });
        return;
      }
      if (creatingRef.current) {
        debugLog("init skipped: create already in-flight (ref)");
        return;
      }
      creatingRef.current = true;

      const create = async () => {
        try {
          setIsCreatingList(true);
          setInitError(null);
          const title = layer.title?.trim() || "Todo list";
          debugLog("creating todo list", { title, activeListId, listDoc });

          let createdId: Id<"todoLists">;
          const cachedId = resolvedListIdByWidget.get(widgetId);
          if (cachedId) {
            debugLog("reusing cached list id for widget", { widgetId, cachedId });
            createdId = cachedId;
          } else {
            const pending = pendingListCreationByWidget.get(widgetId);
            if (pending) {
              debugLog("awaiting pending list creation for widget", { widgetId });
              createdId = await pending;
            } else {
              const creationPromise = createList({ name: title, groups: [] });
              pendingListCreationByWidget.set(widgetId, creationPromise);
              try {
                createdId = await creationPromise;
                resolvedListIdByWidget.set(widgetId, createdId);
              } finally {
                pendingListCreationByWidget.delete(widgetId);
              }
            }
          }

          if (!mountedRef.current) return;
          debugLog("created todo list", { createdId });
          setLocalListId(createdId);
          onPropsChange({ todoListId: String(createdId), title, groups: [] });
          setGroups([]);
          setHydratedListId(String(createdId));
        } catch (error) {
          console.error("Failed to create todo list:", error);
          debugLog("create todo list failed", error);
          if (mountedRef.current) {
            setInitError("Unable to initialize todo list.");
            toast.error("Unable to initialize todo widget.");
          }
        } finally {
          creatingRef.current = false;
          setIsCreatingList(false);
        }
      };

      void create();
    }, [
      activeListId,
      createList,
      debugLog,
      initError,
      isCreatingList,
      layer.title,
      listDoc,
      onPropsChange,
      widgetId,
    ]);

    const persistGroups = useCallback(
      async (nextGroups: TodoWidgetGroup[]) => {
        if (!activeListId) {
          debugLog("persist skipped: no activeListId");
          return;
        }
        try {
          debugLog("persist groups start", {
            activeListId,
            groupsCount: nextGroups.length,
          });
          await updateGroupsMutation({ id: activeListId, groups: nextGroups as any[] });
          debugLog("persist groups success", {
            activeListId,
            groupsCount: nextGroups.length,
          });
        } catch (error) {
          console.error("Failed to persist todo groups:", error);
          debugLog("persist groups failed", error);
          toast.error("Unable to save changes.");
        }
      },
      [activeListId, debugLog, updateGroupsMutation],
    );

    const updateGroups = useCallback(
      (updater: (current: TodoWidgetGroup[]) => TodoWidgetGroup[]) => {
        if (!activeListId) {
          debugLog("updateGroups blocked: no activeListId");
          toast.error("Todo list is still initializing.");
          return;
        }
        setGroups((current) => {
          debugLog("updateGroups invoked", {
            currentCount: current.length,
          });
          const next = updater(cloneGroups(current));
          debugLog("updateGroups produced next state", {
            nextCount: next.length,
          });
          groupsRef.current = next;
          void persistGroups(next);
          return next;
        });
      },
      [activeListId, debugLog, persistGroups],
    );

    const showCompleted = true;
    const maxVisibleTasks = Math.max(1, layer.maxVisibleTasks ?? 200);

    const taskStats = useMemo(() => {
      let total = 0;
      let completed = 0;
      groups.forEach((group) => {
        group.tasks.forEach((task) => {
          total += 1;
          if (task.completed) completed += 1;
        });
      });
      return { total, completed };
    }, [groups]);

    const visibleGroups = useMemo(() => {
      let rendered = 0;
      let fullVisibleCount = 0;
      const entries = groups.map((group) => {
        const filtered = showCompleted ? group.tasks : group.tasks.filter((task) => !task.completed);
        fullVisibleCount += filtered.length;
        const capped: TodoWidgetTask[] = [];
        for (const task of filtered) {
          if (rendered >= maxVisibleTasks) break;
          capped.push(task);
          rendered += 1;
        }
        return { group, tasks: capped };
      });
      return { entries, isCapped: fullVisibleCount > maxVisibleTasks };
    }, [groups, maxVisibleTasks, showCompleted]);

    const addGroup = useCallback(() => {
      debugLog("action addGroup clicked", { groupsCount: groups.length, activeListId });
      const group = createGroup();
      updateGroups((current) => [...current, group]);
      setEditingTarget({ type: "group", groupId: group.id });
      setDraftText(group.title);
    }, [activeListId, debugLog, groups.length, updateGroups]);

    const addTask = useCallback(
      (groupId: string) => {
        debugLog("action addTask clicked", { groupId, activeListId });
        const task = createTask();
        updateGroups((current) =>
          current.map((group) =>
            group.id === groupId
              ? { ...group, updatedAt: nowISO(), tasks: [...group.tasks, task] }
              : group,
          ),
        );
        setEditingTarget({ type: "task", groupId, taskId: task.id });
        setDraftText(task.text);
      },
      [activeListId, debugLog, updateGroups],
    );

    const addTaskToFirstGroup = useCallback(() => {
      debugLog("action addTaskToFirstGroup clicked", {
        groupsCount: groups.length,
        activeListId,
      });
      if (groups.length === 0) {
        const group = createGroup("Group 1");
        const task = createTask();
        group.tasks.push(task);
        updateGroups(() => [group]);
        setEditingTarget({ type: "task", groupId: group.id, taskId: task.id });
        setDraftText(task.text);
        return;
      }
      addTask(groups[0].id);
    }, [activeListId, addTask, debugLog, groups, updateGroups]);

    const addSubtask = useCallback(
      (groupId: string, taskId: string) => {
        debugLog("action addSubtask clicked", { groupId, taskId, activeListId });
        const subtask = createSubtask();
        updateGroups((current) =>
          current.map((group) => {
            if (group.id !== groupId) return group;
            return {
              ...group,
              updatedAt: nowISO(),
              tasks: group.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      collapsed: false,
                      updatedAt: nowISO(),
                      subtasks: [...task.subtasks, subtask],
                    }
                  : task,
              ),
            };
          }),
        );
        setEditingTarget({ type: "subtask", groupId, taskId, subtaskId: subtask.id });
        setDraftText(subtask.text);
      },
      [activeListId, debugLog, updateGroups],
    );

    const toggleGroupCollapse = useCallback(
      (groupId: string) => {
        updateGroups((current) =>
          current.map((group) =>
            group.id === groupId
              ? { ...group, collapsed: !group.collapsed, updatedAt: nowISO() }
              : group,
          ),
        );
      },
      [updateGroups],
    );

    const toggleTaskCollapse = useCallback(
      (groupId: string, taskId: string) => {
        updateGroups((current) =>
          current.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  updatedAt: nowISO(),
                  tasks: group.tasks.map((task) =>
                    task.id === taskId
                      ? { ...task, collapsed: !task.collapsed, updatedAt: nowISO() }
                      : task,
                  ),
                }
              : group,
          ),
        );
      },
      [updateGroups],
    );

    const deleteGroup = useCallback(
      (groupId: string) => {
        updateGroups((current) => current.filter((group) => group.id !== groupId));
      },
      [updateGroups],
    );

    const deleteTask = useCallback(
      (groupId: string, taskId: string) => {
        updateGroups((current) =>
          current.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  updatedAt: nowISO(),
                  tasks: group.tasks.filter((task) => task.id !== taskId),
                }
              : group,
          ),
        );
      },
      [updateGroups],
    );

    const deleteSubtask = useCallback(
      (groupId: string, taskId: string, subtaskId: string) => {
        updateGroups((current) =>
          current.map((group) => {
            if (group.id !== groupId) return group;
            return {
              ...group,
              updatedAt: nowISO(),
              tasks: group.tasks.map((task) => {
                if (task.id !== taskId) return task;
                const subtasks = task.subtasks.filter((entry) => entry.id !== subtaskId);
                return {
                  ...task,
                  updatedAt: nowISO(),
                  completed: subtasks.length > 0 && subtasks.every((entry) => entry.completed),
                  subtasks,
                };
              }),
            };
          }),
        );
      },
      [updateGroups],
    );

    const toggleTask = useCallback(
      (groupId: string, taskId: string) => {
        debugLog("action toggleTask", { groupId, taskId });
        updateGroups((current) =>
          current.map((group) => {
            if (group.id !== groupId) return group;
            const updatedAt = nowISO();
            return {
              ...group,
              updatedAt,
              tasks: group.tasks.map((task) => {
                if (task.id !== taskId) return task;
                const completed = !task.completed;
                return {
                  ...task,
                  completed,
                  updatedAt,
                  subtasks: task.subtasks.map((subtask) => ({
                    ...subtask,
                    completed,
                    updatedAt,
                  })),
                };
              }),
            };
          }),
        );
      },
      [debugLog, updateGroups],
    );

    const toggleSubtask = useCallback(
      (groupId: string, taskId: string, subtaskId: string) => {
        debugLog("action toggleSubtask", { groupId, taskId, subtaskId });
        updateGroups((current) =>
          current.map((group) => {
            if (group.id !== groupId) return group;
            return {
              ...group,
              updatedAt: nowISO(),
              tasks: group.tasks.map((task) => {
                if (task.id !== taskId) return task;
                const updatedAt = nowISO();
                const subtasks = task.subtasks.map((subtask) =>
                  subtask.id === subtaskId
                    ? { ...subtask, completed: !subtask.completed, updatedAt }
                    : subtask,
                );
                return {
                  ...task,
                  updatedAt,
                  completed: subtasks.length > 0 && subtasks.every((entry) => entry.completed),
                  subtasks,
                };
              }),
            };
          }),
        );
      },
      [debugLog, updateGroups],
    );

    const projectGroupsForDrag = useCallback(
      (current: TodoWidgetGroup[], activeData: TodoDragData, overData: TodoDragData): TodoWidgetGroup[] => {
        if (activeData.kind === "group") {
          if (overData.kind !== "group") return current;
          const from = current.findIndex((group) => group.id === activeData.groupId);
          const to = current.findIndex((group) => group.id === overData.groupId);
          if (from < 0 || to < 0 || from === to) return current;
          const next = [...current];
          const [moved] = next.splice(from, 1);
          if (!moved) return current;
          next.splice(to, 0, moved);
          return next;
        }

        if (activeData.kind === "task") {
          const source = findTaskLocation(current, activeData.taskId);
          if (!source) return current;

          let targetGroupIndex = -1;
          let targetTaskIndex = -1;
          if (overData.kind === "task") {
            const target = findTaskLocation(current, overData.taskId);
            if (!target) return current;
            targetGroupIndex = target.groupIndex;
            targetTaskIndex = target.taskIndex;
          } else if (overData.kind === "task-container") {
            targetGroupIndex = current.findIndex((group) => group.id === overData.groupId);
            if (targetGroupIndex < 0) return current;
            targetTaskIndex = current[targetGroupIndex].tasks.length;
          } else if (overData.kind === "group") {
            targetGroupIndex = current.findIndex((group) => group.id === overData.groupId);
            if (targetGroupIndex < 0) return current;
            targetTaskIndex = current[targetGroupIndex].tasks.length;
          } else {
            return current;
          }

          let adjustedTargetIndex = targetTaskIndex;
          if (source.groupIndex === targetGroupIndex && source.taskIndex < adjustedTargetIndex) {
            adjustedTargetIndex -= 1;
          }
          if (source.groupIndex === targetGroupIndex && source.taskIndex === adjustedTargetIndex) {
            return current;
          }

          const next = [...current];
          const sourceGroup = current[source.groupIndex];
          const targetGroup = current[targetGroupIndex];
          const sourceTasks = [...sourceGroup.tasks];
          const [movedTask] = sourceTasks.splice(source.taskIndex, 1);
          if (!movedTask) return current;
          const targetTasks =
            source.groupIndex === targetGroupIndex ? sourceTasks : [...targetGroup.tasks];
          targetTasks.splice(adjustedTargetIndex, 0, movedTask);
          const updatedAt = nowISO();
          next[source.groupIndex] = {
            ...sourceGroup,
            updatedAt,
            tasks: source.groupIndex === targetGroupIndex ? targetTasks : sourceTasks,
          };
          if (source.groupIndex !== targetGroupIndex) {
            next[targetGroupIndex] = {
              ...targetGroup,
              updatedAt,
              tasks: targetTasks,
            };
          }
          return next;
        }

        if (activeData.kind === "subtask") {
          const source = findSubtaskLocation(current, activeData.subtaskId);
          if (!source) return current;

          let targetGroupIndex = -1;
          let targetTaskIndex = -1;
          let targetSubtaskIndex = -1;
          if (overData.kind === "subtask") {
            const target = findSubtaskLocation(current, overData.subtaskId);
            if (!target) return current;
            targetGroupIndex = target.groupIndex;
            targetTaskIndex = target.taskIndex;
            targetSubtaskIndex = target.subtaskIndex;
          } else if (overData.kind === "subtask-container") {
            const taskLocation = findTaskLocation(current, overData.taskId);
            if (!taskLocation) return current;
            targetGroupIndex = taskLocation.groupIndex;
            targetTaskIndex = taskLocation.taskIndex;
            targetSubtaskIndex =
              current[targetGroupIndex].tasks[targetTaskIndex].subtasks.length;
          } else {
            return current;
          }

          // Keep subtasks constrained to their parent task.
          if (source.groupIndex !== targetGroupIndex || source.taskIndex !== targetTaskIndex) {
            return current;
          }

          let adjustedTargetIndex = targetSubtaskIndex;
          if (source.subtaskIndex < adjustedTargetIndex) {
            adjustedTargetIndex -= 1;
          }
          if (source.subtaskIndex === adjustedTargetIndex) return current;

          const next = [...current];
          const group = current[source.groupIndex];
          const task = group.tasks[source.taskIndex];
          const subtasks = [...task.subtasks];
          const [movedSubtask] = subtasks.splice(source.subtaskIndex, 1);
          if (!movedSubtask) return current;
          subtasks.splice(adjustedTargetIndex, 0, movedSubtask);
          const updatedAt = nowISO();
          const tasks = [...group.tasks];
          tasks[source.taskIndex] = { ...task, updatedAt, subtasks };
          next[source.groupIndex] = { ...group, updatedAt, tasks };
          return next;
        }

        return current;
      },
      [],
    );

    const applyDragProjection = useCallback(
      (activeData: TodoDragData, overData: TodoDragData) => {
        const current = groupsRef.current;
        const next = projectGroupsForDrag(current, activeData, overData);
        if (next === current) return;
        groupsRef.current = next;
        dragChangedRef.current = true;
        startTransition(() => setGroups(next));
      },
      [projectGroupsForDrag, startTransition],
    );

    const shouldProjectOnDragOver = useCallback(
      (activeData: TodoDragData, overData: TodoDragData, current: TodoWidgetGroup[]) => {
        if (activeData.kind !== "task") return false;
        const source = findTaskLocation(current, activeData.taskId);
        if (!source) return false;

        let targetGroupIndex = -1;
        if (overData.kind === "task") {
          const target = findTaskLocation(current, overData.taskId);
          if (!target) return false;
          targetGroupIndex = target.groupIndex;
        } else if (overData.kind === "task-container") {
          targetGroupIndex = current.findIndex((group) => group.id === overData.groupId);
        } else if (overData.kind === "group") {
          targetGroupIndex = current.findIndex((group) => group.id === overData.groupId);
        } else {
          return false;
        }

        return targetGroupIndex >= 0 && targetGroupIndex !== source.groupIndex;
      },
      [],
    );

    const scheduleProjection = useCallback(
      (activeData: TodoDragData, overData: TodoDragData) => {
        pendingProjectionRef.current = { activeData, overData };
        if (dragRafRef.current != null) return;
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          const pending = pendingProjectionRef.current;
          if (!pending) return;
          pendingProjectionRef.current = null;
          applyDragProjection(pending.activeData, pending.overData);
        });
      },
      [applyDragProjection],
    );

    const collisionDetectionStrategy = useCallback<CollisionDetection>((args) => {
      const pointerIntersections = pointerWithin(args);
      if (pointerIntersections.length > 0) return pointerIntersections;
      const rectIntersections = rectIntersection(args);
      if (rectIntersections.length > 0) return rectIntersections;
      return closestCorners(args);
    }, []);

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 8 },
      }),
    );

    const beginEdit = useCallback((target: EditingTarget, value: string) => {
      setEditingTarget(target);
      setDraftText(value);
    }, []);

    const cancelEdit = useCallback(() => {
      setEditingTarget(null);
      setDraftText("");
    }, []);

    const commitEdit = useCallback(async () => {
      if (!editingTarget) return;
      const value = draftText.trim();
      debugLog("commitEdit", { editingTarget, value });

      if (editingTarget.type === "title") {
        const title = value || "Todo list";
        onPropsChange({ title });
        if (activeListId) {
          try {
            await renameMutation({ id: activeListId, name: title });
          } catch (error) {
            console.error("Failed to rename list:", error);
            toast.error("Unable to rename list.");
          }
        }
        setEditingTarget(null);
        return;
      }

      if (editingTarget.type === "group") {
        updateGroups((current) =>
          current.map((group) =>
            group.id === editingTarget.groupId
              ? { ...group, title: value || "Untitled group", updatedAt: nowISO() }
              : group,
          ),
        );
        setEditingTarget(null);
        return;
      }

      if (editingTarget.type === "task") {
        updateGroups((current) =>
          current.map((group) =>
            group.id === editingTarget.groupId
              ? {
                  ...group,
                  updatedAt: nowISO(),
                  tasks: group.tasks.map((task) =>
                    task.id === editingTarget.taskId
                      ? { ...task, text: value || "Untitled task", updatedAt: nowISO() }
                      : task,
                  ),
                }
              : group,
          ),
        );
        setEditingTarget(null);
        return;
      }

      updateGroups((current) =>
        current.map((group) =>
          group.id === editingTarget.groupId
            ? {
                ...group,
                updatedAt: nowISO(),
                tasks: group.tasks.map((task) =>
                  task.id === editingTarget.taskId
                    ? {
                        ...task,
                        updatedAt: nowISO(),
                        subtasks: task.subtasks.map((subtask) =>
                          subtask.id === editingTarget.subtaskId
                            ? { ...subtask, text: value || "Untitled subtask", updatedAt: nowISO() }
                            : subtask,
                        ),
                      }
                    : task,
                ),
              }
            : group,
        ),
      );
      setEditingTarget(null);
    }, [activeListId, debugLog, draftText, editingTarget, onPropsChange, renameMutation, updateGroups]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
      const activeData = parseTodoDragData(event.active.data.current);
      if (
        !activeData ||
        (activeData.kind !== "group" &&
          activeData.kind !== "task" &&
          activeData.kind !== "subtask")
      ) {
        return;
      }

      dragChangedRef.current = false;
      dragStartSnapshotRef.current = cloneGroups(groupsRef.current);
      lastProjectionKeyRef.current = null;
      pendingProjectionRef.current = null;
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      setActiveDragData(activeData);
      setActiveDragId(String(event.active.id));
    }, []);

    const handleDragOver = useCallback(
      (event: DragOverEvent) => {
        const activeData = parseTodoDragData(event.active.data.current);
        const overData = parseTodoDragData(event.over?.data.current);
        if (
          !activeData ||
          !overData ||
          (activeData.kind !== "group" &&
            activeData.kind !== "task" &&
            activeData.kind !== "subtask")
        ) {
          return;
        }

        if (!shouldProjectOnDragOver(activeData, overData, groupsRef.current)) {
          return;
        }

        const nextKey = `${activeData.kind}:${dragDataEntityId(activeData)}->${overData.kind}:${dragDataEntityId(overData)}`;
        if (nextKey === lastProjectionKeyRef.current) {
          return;
        }

        lastProjectionKeyRef.current = nextKey;
        scheduleProjection(activeData, overData);
      },
      [scheduleProjection, shouldProjectOnDragOver],
    );

    const handleDragCancel = useCallback(() => {
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingProjectionRef.current = null;
      lastProjectionKeyRef.current = null;
      if (dragStartSnapshotRef.current) {
        groupsRef.current = dragStartSnapshotRef.current;
        setGroups(dragStartSnapshotRef.current);
      }
      dragStartSnapshotRef.current = null;
      dragChangedRef.current = false;
      setActiveDragData(null);
      setActiveDragId(null);
    }, []);

    const handleDragEnd = useCallback(
      (event: DragEndEvent) => {
        if (dragRafRef.current != null) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        pendingProjectionRef.current = null;
        lastProjectionKeyRef.current = null;

        const activeData = parseTodoDragData(event.active.data.current);
        const overData = parseTodoDragData(event.over?.data.current);
        const isValidActive =
          !!activeData &&
          (activeData.kind === "group" ||
            activeData.kind === "task" ||
            activeData.kind === "subtask");

        if (isValidActive && activeData && overData) {
          applyDragProjection(activeData, overData);
        }

        if (!overData && dragStartSnapshotRef.current) {
          groupsRef.current = dragStartSnapshotRef.current;
          setGroups(dragStartSnapshotRef.current);
          dragStartSnapshotRef.current = null;
          dragChangedRef.current = false;
          setActiveDragData(null);
          setActiveDragId(null);
          return;
        }

        const shouldPersist = dragChangedRef.current;
        const nextGroups = groupsRef.current;
        dragStartSnapshotRef.current = null;
        dragChangedRef.current = false;
        setActiveDragData(null);
        setActiveDragId(null);
        if (shouldPersist) {
          void persistGroups(nextGroups);
        }
      },
      [applyDragProjection, persistGroups],
    );

    const title = layer.title?.trim() || "Todo list";
    const progress = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
    const isLoadingList = isCreatingList;
    const activeDragLabel = useMemo(() => {
      if (!activeDragData) return null;
      if (activeDragData.kind === "group") {
        const group = groups.find((entry) => entry.id === activeDragData.groupId);
        return group?.title || "Group";
      }
      if (activeDragData.kind === "task") {
        const location = findTaskLocation(groups, activeDragData.taskId);
        if (!location) return "Task";
        const task = groups[location.groupIndex]?.tasks[location.taskIndex];
        return task?.text || "Task";
      }
      if (activeDragData.kind === "subtask") {
        const location = findSubtaskLocation(groups, activeDragData.subtaskId);
        if (!location) return "Subtask";
        const subtask =
          groups[location.groupIndex]?.tasks[location.taskIndex]?.subtasks[location.subtaskIndex];
        return subtask?.text || "Subtask";
      }
      return null;
    }, [activeDragData, groups]);

    return (
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-xl text-slate-800 ${
          isSelected ? "shadow-[0_0_0_1px_rgba(59,130,246,0.22)]" : "shadow-[0_10px_35px_-22px_rgba(15,23,42,0.45)]"
        }`}
        style={{
          backgroundColor: colorToCSS(layer.fill || DEFAULT_FILL),
          borderColor: colorToCSS(layer.borderColor || DEFAULT_BORDER_COLOR),
          borderWidth: Math.max(1, layer.borderWidth || 1),
          borderStyle: "solid",
        }}
      >
        <div className="border-b border-slate-200/90 bg-gradient-to-b from-slate-50 to-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {editingTarget?.type === "title" ? (
                <input
                  data-todo-interactive="true"
                  autoFocus
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitEdit();
                    if (event.key === "Escape") cancelEdit();
                  }}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none ring-blue-300 focus:ring-1"
                />
              ) : (
                <button
                  type="button"
                  data-todo-interactive="true"
                  className="flex items-center gap-1.5 text-left"
                  onClick={() => beginEdit({ type: "title" }, title)}
                >
                  <ListTodo className="h-4 w-4 text-slate-500" />
                  <span className="truncate text-sm font-semibold text-slate-900">{title}</span>
                </button>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                  {taskStats.completed}/{taskStats.total} done
                </span>
                <span>{progress}%</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-todo-interactive="true"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                onClick={addTaskToFirstGroup}
              >
                <Plus className="h-3.5 w-3.5" />
                Task
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
          {isLoadingList ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Initializing todo list...
            </div>
          ) : initError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-xs text-rose-600">{initError}</div>
              <button
                type="button"
                data-todo-interactive="true"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
                onClick={() => setInitError(null)}
              >
                Retry
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetectionStrategy}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={visibleGroups.entries.map(({ group }) => groupSortableId(group.id))}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2.5">
                  {visibleGroups.entries.map(({ group, tasks }) => (
                    <SortableShell
                      key={group.id}
                      id={groupSortableId(group.id)}
                      data={{ kind: "group", groupId: group.id }}
                      className="rounded-xl border border-slate-200/95 bg-white"
                    >
                      {({ attributes, listeners }) => (
                        <div data-todo-interactive="true">
                          <div className="flex items-center gap-1 border-b border-slate-200/80 px-2.5 py-2">
                            <button
                              type="button"
                              data-todo-interactive="true"
                              className={`flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${
                                activeDragId === groupSortableId(group.id) ? "cursor-grabbing" : "cursor-grab"
                              }`}
                              {...attributes}
                              {...listeners}
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              data-todo-interactive="true"
                              className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                              onClick={() => toggleGroupCollapse(group.id)}
                            >
                              {group.collapsed ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {editingTarget?.type === "group" && editingTarget.groupId === group.id ? (
                              <input
                                data-todo-interactive="true"
                                autoFocus
                                value={draftText}
                                onChange={(event) => setDraftText(event.target.value)}
                                onBlur={() => void commitEdit()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void commitEdit();
                                  if (event.key === "Escape") cancelEdit();
                                }}
                                className="h-7 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none ring-blue-300 focus:ring-1"
                              />
                            ) : (
                              <button
                                type="button"
                                data-todo-interactive="true"
                                className="min-w-0 flex-1 truncate text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                                onClick={() =>
                                  beginEdit({ type: "group", groupId: group.id }, group.title)
                                }
                              >
                                {group.title}
                              </button>
                            )}

                            <span className="text-[11px] text-slate-400">
                              {tasks.length}/{group.tasks.length}
                            </span>

                            <button
                              type="button"
                              data-todo-interactive="true"
                              className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                              onClick={() => addTask(group.id)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              data-todo-interactive="true"
                              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-rose-600"
                              onClick={() => deleteGroup(group.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {!group.collapsed && (
                            <DroppableShell
                              id={taskContainerId(group.id)}
                              data={{ kind: "task-container", groupId: group.id }}
                              className="space-y-1.5 rounded-b-xl px-2 py-2"
                            >
                              <SortableContext
                                items={tasks.map((task) => taskSortableId(task.id))}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="space-y-1.5">
                                  {tasks.map((task) => {
                                    const subtasks = showCompleted
                                      ? task.subtasks
                                      : task.subtasks.filter((subtask) => !subtask.completed);

                                    return (
                                      <SortableShell
                                        key={task.id}
                                        id={taskSortableId(task.id)}
                                        data={{ kind: "task", taskId: task.id }}
                                        className={`rounded-lg border px-2 py-2 transition ${
                                          task.completed
                                            ? "border-slate-200 bg-slate-50/80"
                                            : "border-slate-200 bg-white hover:border-slate-300"
                                        }`}
                                      >
                                        {({ attributes, listeners }) => (
                                          <div data-todo-interactive="true">
                                            <div className="flex items-start gap-1.5">
                                              <button
                                                type="button"
                                                data-todo-interactive="true"
                                                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${
                                                  activeDragId === taskSortableId(task.id)
                                                    ? "cursor-grabbing"
                                                    : "cursor-grab"
                                                }`}
                                                {...attributes}
                                                {...listeners}
                                              >
                                                <GripVertical className="h-3.5 w-3.5" />
                                              </button>

                                              <button
                                                type="button"
                                                data-todo-interactive="true"
                                                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${
                                                  task.completed
                                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                                    : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                                                }`}
                                                onClick={() => toggleTask(group.id, task.id)}
                                              >
                                                <Check className="h-3.5 w-3.5" />
                                              </button>

                                                <div className="min-w-0 flex-1">
                                                  {editingTarget?.type === "task" &&
                                                  editingTarget.groupId === group.id &&
                                                  editingTarget.taskId === task.id ? (
                                                    <input
                                                      data-todo-interactive="true"
                                                      autoFocus
                                                      value={draftText}
                                                      onChange={(event) => setDraftText(event.target.value)}
                                                      onBlur={() => void commitEdit()}
                                                      onKeyDown={(event) => {
                                                        if (event.key === "Enter") void commitEdit();
                                                        if (event.key === "Escape") cancelEdit();
                                                      }}
                                                      className="h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none ring-blue-300 focus:ring-1"
                                                    />
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      data-todo-interactive="true"
                                                      className={`block w-full truncate text-left text-sm ${
                                                        task.completed
                                                          ? "text-slate-400 line-through"
                                                          : "text-slate-700"
                                                      }`}
                                                      onClick={() =>
                                                        beginEdit(
                                                          { type: "task", groupId: group.id, taskId: task.id },
                                                          task.text,
                                                        )
                                                      }
                                                    >
                                                      {task.text || "New task"}
                                                    </button>
                                                  )}
                                                </div>

                                                <div className="flex items-center gap-0.5">
                                                  <button
                                                    type="button"
                                                    data-todo-interactive="true"
                                                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                                    onClick={() => addSubtask(group.id, task.id)}
                                                  >
                                                    <Plus className="h-3.5 w-3.5" />
                                                  </button>
                                                  {task.subtasks.length > 0 && (
                                                    <button
                                                      type="button"
                                                      data-todo-interactive="true"
                                                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                                      onClick={() => toggleTaskCollapse(group.id, task.id)}
                                                    >
                                                      {task.collapsed ? (
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                      ) : (
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                      )}
                                                    </button>
                                                  )}
                                                  <button
                                                    type="button"
                                                    data-todo-interactive="true"
                                                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-rose-600"
                                                    onClick={() => deleteTask(group.id, task.id)}
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              </div>

                                              {!task.collapsed && subtasks.length > 0 && (
                                                <DroppableShell
                                                  id={subtaskContainerId(task.id)}
                                                  data={{ kind: "subtask-container", taskId: task.id }}
                                                  className="mt-2 rounded-md pl-7"
                                                >
                                                  <SortableContext
                                                    items={subtasks.map((subtask) =>
                                                      subtaskSortableId(subtask.id),
                                                    )}
                                                    strategy={verticalListSortingStrategy}
                                                  >
                                                    <div className="space-y-1.5">
                                                      {subtasks.map((subtask) => (
                                                        <SortableShell
                                                          key={subtask.id}
                                                          id={subtaskSortableId(subtask.id)}
                                                          data={{ kind: "subtask", subtaskId: subtask.id }}
                                                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1"
                                                        >
                                                          {({ attributes, listeners }) => (
                                                            <>
                                                              <button
                                                                type="button"
                                                                data-todo-interactive="true"
                                                                className={`flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 ${
                                                                  activeDragId ===
                                                                  subtaskSortableId(subtask.id)
                                                                    ? "cursor-grabbing"
                                                                    : "cursor-grab"
                                                                }`}
                                                                {...attributes}
                                                                {...listeners}
                                                              >
                                                                <GripVertical className="h-3 w-3" />
                                                              </button>

                                                              <button
                                                                type="button"
                                                                data-todo-interactive="true"
                                                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                                                  subtask.completed
                                                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                                                    : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                                                                }`}
                                                                onClick={() =>
                                                                  toggleSubtask(group.id, task.id, subtask.id)
                                                                }
                                                              >
                                                                <Check className="h-3 w-3" />
                                                              </button>

                                                              <div className="min-w-0 flex-1">
                                                                {editingTarget?.type === "subtask" &&
                                                                editingTarget.groupId === group.id &&
                                                                editingTarget.taskId === task.id &&
                                                                editingTarget.subtaskId === subtask.id ? (
                                                                  <input
                                                                    data-todo-interactive="true"
                                                                    autoFocus
                                                                    value={draftText}
                                                                    onChange={(event) =>
                                                                      setDraftText(event.target.value)
                                                                    }
                                                                    onBlur={() => void commitEdit()}
                                                                    onKeyDown={(event) => {
                                                                      if (event.key === "Enter") {
                                                                        void commitEdit();
                                                                      }
                                                                      if (event.key === "Escape") {
                                                                        cancelEdit();
                                                                      }
                                                                    }}
                                                                    className="h-6 w-full rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-700 outline-none ring-blue-300 focus:ring-1"
                                                                  />
                                                                ) : (
                                                                  <button
                                                                    type="button"
                                                                    data-todo-interactive="true"
                                                                    className={`block w-full truncate text-left text-xs ${
                                                                      subtask.completed
                                                                        ? "text-slate-400 line-through"
                                                                        : "text-slate-600"
                                                                    }`}
                                                                    onClick={() =>
                                                                      beginEdit(
                                                                        {
                                                                          type: "subtask",
                                                                          groupId: group.id,
                                                                          taskId: task.id,
                                                                          subtaskId: subtask.id,
                                                                        },
                                                                        subtask.text,
                                                                      )
                                                                    }
                                                                  >
                                                                    {subtask.text || "New subtask"}
                                                                  </button>
                                                                )}
                                                              </div>

                                                              <button
                                                                type="button"
                                                                data-todo-interactive="true"
                                                                className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-rose-600"
                                                                onClick={() =>
                                                                  deleteSubtask(group.id, task.id, subtask.id)
                                                                }
                                                              >
                                                                <Trash2 className="h-3 w-3" />
                                                              </button>
                                                            </>
                                                          )}
                                                        </SortableShell>
                                                      ))}
                                                    </div>
                                                  </SortableContext>
                                                </DroppableShell>
                                              )}
                                          </div>
                                        )}
                                      </SortableShell>
                                    );
                                  })}
                                </div>
                              </SortableContext>

                              <button
                                type="button"
                                data-todo-interactive="true"
                                onClick={() => addTask(group.id)}
                                className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add task
                              </button>
                            </DroppableShell>
                          )}
                        </div>
                      )}
                    </SortableShell>
                  ))}
                </div>
              </SortableContext>

              {groups.length === 0 && (
                <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                  No tasks yet. Create your first group or task.
                </div>
              )}

              {visibleGroups.isCapped && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
                  Task limit reached in widget view ({maxVisibleTasks}).
                </div>
              )}

              <DragOverlay dropAnimation={null}>
                {activeDragLabel ? (
                  <div className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-lg">
                    {activeDragLabel}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <div className="border-t border-slate-200/90 bg-slate-50/85 px-2.5 py-2">
          <button
            type="button"
            data-todo-interactive="true"
            onClick={addGroup}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
          >
            <Layers3 className="h-3.5 w-3.5" />
            Add group
          </button>
        </div>
      </div>
    );
  },
);

TodoWidget.displayName = "TodoWidget";

export default TodoWidget;
