"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useMutation as useConvexMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
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

type DragPayload =
  | { type: "group"; groupId: string }
  | { type: "task"; groupId: string; taskId: string }
  | { type: "subtask"; groupId: string; taskId: string; subtaskId: string };

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

export const TodoWidget = memo(
  ({ layer, onPropsChange, isSelected }: TodoWidgetProps) => {
    const listId =
      typeof layer.todoListId === "string" && layer.todoListId
        ? (layer.todoListId as Id<"todoLists">)
        : null;

    const listDoc = useQuery(api.todoLists.getById, listId ? { id: listId } : "skip");
    const createList = useConvexMutation(api.todoLists.create);
    const updateGroupsMutation = useConvexMutation(api.todoLists.updateGroups);
    const renameMutation = useConvexMutation(api.todoLists.rename);

    const [isCreatingList, setIsCreatingList] = useState(false);
    const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
    const [draftText, setDraftText] = useState("");
    const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const [groups, setGroups] = useState<TodoWidgetGroup[]>([]);

    const remoteGroups = useMemo(() => normalizeGroups(listDoc?.groups), [listDoc?.groups]);

    useEffect(() => {
      if (!layer.borderColor || typeof layer.borderWidth !== "number") {
        onPropsChange({
          borderColor: layer.borderColor || DEFAULT_BORDER_COLOR,
          borderWidth: typeof layer.borderWidth === "number" ? layer.borderWidth : 1,
        });
      }
      if (typeof layer.showCompleted !== "boolean") {
        onPropsChange({ showCompleted: true });
      }
      if (!layer.title || !layer.title.trim()) {
        onPropsChange({ title: "Todo list" });
      }
    }, [layer.borderColor, layer.borderWidth, layer.showCompleted, layer.title, onPropsChange]);

    useEffect(() => {
      if (!listDoc) return;
      setGroups(remoteGroups);
      if (listDoc.name && listDoc.name !== layer.title) {
        onPropsChange({ title: listDoc.name });
      }
    }, [layer.title, listDoc, onPropsChange, remoteGroups]);

    useEffect(() => {
      if (isCreatingList) return;
      if (listId && listDoc !== null) return;
      let cancelled = false;

      const create = async () => {
        try {
          setIsCreatingList(true);
          const title = layer.title?.trim() || "Todo list";
          const createdId = await createList({ name: title, groups: [] });
          if (cancelled) return;
          onPropsChange({ todoListId: String(createdId), title, groups: [] });
          setGroups([]);
        } catch (error) {
          if (!cancelled) {
            console.error("Failed to create todo list:", error);
            toast.error("Unable to initialize todo widget.");
          }
        } finally {
          if (!cancelled) {
            setIsCreatingList(false);
          }
        }
      };

      void create();
      return () => {
        cancelled = true;
      };
    }, [createList, isCreatingList, layer.title, listDoc, listId, onPropsChange]);

    const persistGroups = useCallback(
      async (nextGroups: TodoWidgetGroup[]) => {
        if (!listId) return;
        try {
          await updateGroupsMutation({ id: listId, groups: nextGroups as any[] });
        } catch (error) {
          console.error("Failed to persist todo groups:", error);
          toast.error("Unable to save changes.");
        }
      },
      [listId, updateGroupsMutation],
    );

    const updateGroups = useCallback(
      (updater: (current: TodoWidgetGroup[]) => TodoWidgetGroup[]) => {
        setGroups((current) => {
          const next = updater(cloneGroups(current));
          void persistGroups(next);
          return next;
        });
      },
      [persistGroups],
    );

    const showCompleted = layer.showCompleted ?? true;
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
      const group = createGroup();
      updateGroups((current) => [...current, group]);
      setEditingTarget({ type: "group", groupId: group.id });
      setDraftText(group.title);
    }, [updateGroups]);

    const addTask = useCallback(
      (groupId: string) => {
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
      [updateGroups],
    );

    const addTaskToFirstGroup = useCallback(() => {
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
    }, [addTask, groups, updateGroups]);

    const addSubtask = useCallback(
      (groupId: string, taskId: string) => {
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
      [updateGroups],
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
      [updateGroups],
    );

    const toggleSubtask = useCallback(
      (groupId: string, taskId: string, subtaskId: string) => {
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
      [updateGroups],
    );

    const moveGroup = useCallback(
      (sourceGroupId: string, targetGroupId: string) => {
        if (sourceGroupId === targetGroupId) return;
        updateGroups((current) => {
          const from = current.findIndex((group) => group.id === sourceGroupId);
          const to = current.findIndex((group) => group.id === targetGroupId);
          if (from < 0 || to < 0) return current;
          const next = [...current];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        });
      },
      [updateGroups],
    );

    const moveTask = useCallback(
      (sourceGroupId: string, taskId: string, targetGroupId: string, targetTaskId?: string) => {
        updateGroups((current) => {
          const source = current.find((group) => group.id === sourceGroupId);
          const target = current.find((group) => group.id === targetGroupId);
          if (!source || !target) return current;

          const fromIndex = source.tasks.findIndex((task) => task.id === taskId);
          if (fromIndex < 0) return current;

          const [movedTask] = source.tasks.splice(fromIndex, 1);
          if (!movedTask) return current;

          let toIndex =
            typeof targetTaskId === "string"
              ? target.tasks.findIndex((task) => task.id === targetTaskId)
              : target.tasks.length;
          if (toIndex < 0) toIndex = target.tasks.length;
          if (sourceGroupId === targetGroupId && fromIndex < toIndex) {
            toIndex -= 1;
          }

          target.tasks.splice(toIndex, 0, movedTask);
          source.updatedAt = nowISO();
          target.updatedAt = source.updatedAt;
          return current;
        });
      },
      [updateGroups],
    );

    const moveSubtask = useCallback(
      (groupId: string, taskId: string, sourceSubtaskId: string, targetSubtaskId?: string) => {
        updateGroups((current) => {
          const group = current.find((entry) => entry.id === groupId);
          if (!group) return current;
          const task = group.tasks.find((entry) => entry.id === taskId);
          if (!task) return current;

          const fromIndex = task.subtasks.findIndex((entry) => entry.id === sourceSubtaskId);
          if (fromIndex < 0) return current;
          const [moved] = task.subtasks.splice(fromIndex, 1);
          if (!moved) return current;

          let toIndex =
            typeof targetSubtaskId === "string"
              ? task.subtasks.findIndex((entry) => entry.id === targetSubtaskId)
              : task.subtasks.length;
          if (toIndex < 0) toIndex = task.subtasks.length;
          if (fromIndex < toIndex) toIndex -= 1;

          task.subtasks.splice(toIndex, 0, moved);
          task.updatedAt = nowISO();
          group.updatedAt = task.updatedAt;
          return current;
        });
      },
      [updateGroups],
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

      if (editingTarget.type === "title") {
        const title = value || "Todo list";
        onPropsChange({ title });
        if (listId) {
          try {
            await renameMutation({ id: listId, name: title });
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
    }, [draftText, editingTarget, listId, onPropsChange, renameMutation, updateGroups]);

    const parseDragPayload = useCallback(
      (event: React.DragEvent): DragPayload | null => {
        if (dragPayload) return dragPayload;
        const raw = event.dataTransfer.getData("application/x-reffo-todo-drag");
        if (!raw) return null;
        try {
          return JSON.parse(raw) as DragPayload;
        } catch {
          return null;
        }
      },
      [dragPayload],
    );

    const startDrag = useCallback((event: React.DragEvent, payload: DragPayload) => {
      event.stopPropagation();
      setDragPayload(payload);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-reffo-todo-drag", JSON.stringify(payload));
    }, []);

    const finishDrag = useCallback(() => {
      setDragPayload(null);
      setDropTarget(null);
    }, []);

    const title = layer.title?.trim() || "Todo list";
    const progress = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
    const isLoadingList = (listId && listDoc === undefined) || isCreatingList;

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
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                onClick={() => onPropsChange({ showCompleted: !showCompleted })}
                title={showCompleted ? "Hide completed" : "Show completed"}
              >
                {showCompleted ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
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
          ) : (
            <>
              <div className="space-y-2.5">
                {visibleGroups.entries.map(({ group, tasks }) => {
                  const groupDropKey = `group-${group.id}`;
                  return (
                    <div
                      key={group.id}
                      data-todo-interactive="true"
                      className={`rounded-xl border border-slate-200/95 bg-white ${
                        dropTarget === groupDropKey ? "ring-2 ring-blue-200" : ""
                      }`}
                      onDragOver={(event) => {
                        const payload = parseDragPayload(event);
                        if (!payload || (payload.type !== "group" && payload.type !== "task")) return;
                        event.preventDefault();
                        setDropTarget(groupDropKey);
                      }}
                      onDrop={(event) => {
                        const payload = parseDragPayload(event);
                        if (!payload) return;
                        event.preventDefault();
                        if (payload.type === "group") {
                          moveGroup(payload.groupId, group.id);
                        } else if (payload.type === "task") {
                          moveTask(payload.groupId, payload.taskId, group.id);
                        }
                        finishDrag();
                      }}
                      onDragLeave={() => {
                        if (dropTarget === groupDropKey) setDropTarget(null);
                      }}
                    >
                      <div className="flex items-center gap-1 border-b border-slate-200/80 px-2.5 py-2">
                        <button
                          type="button"
                          data-todo-interactive="true"
                          draggable
                          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          onDragStart={(event) => startDrag(event, { type: "group", groupId: group.id })}
                          onDragEnd={finishDrag}
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
                            onClick={() => beginEdit({ type: "group", groupId: group.id }, group.title)}
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
                        <div className="space-y-1.5 px-2 py-2">
                          {tasks.length === 0 ? (
                            <button
                              type="button"
                              data-todo-interactive="true"
                              onClick={() => addTask(group.id)}
                              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add first task
                            </button>
                          ) : (
                            tasks.map((task) => {
                              const taskDropKey = `task-${group.id}-${task.id}`;
                              const subtasks = showCompleted
                                ? task.subtasks
                                : task.subtasks.filter((subtask) => !subtask.completed);

                              return (
                                <div
                                  key={task.id}
                                  data-todo-interactive="true"
                                  className={`rounded-lg border px-2 py-2 transition ${
                                    task.completed
                                      ? "border-slate-200 bg-slate-50/80"
                                      : "border-slate-200 bg-white hover:border-slate-300"
                                  } ${dropTarget === taskDropKey ? "ring-2 ring-blue-200" : ""}`}
                                  onDragOver={(event) => {
                                    const payload = parseDragPayload(event);
                                    if (!payload || payload.type !== "task") return;
                                    event.preventDefault();
                                    setDropTarget(taskDropKey);
                                  }}
                                  onDrop={(event) => {
                                    const payload = parseDragPayload(event);
                                    if (!payload || payload.type !== "task") return;
                                    event.preventDefault();
                                    moveTask(payload.groupId, payload.taskId, group.id, task.id);
                                    finishDrag();
                                  }}
                                  onDragLeave={() => {
                                    if (dropTarget === taskDropKey) setDropTarget(null);
                                  }}
                                >
                                  <div className="flex items-start gap-1.5">
                                    <button
                                      type="button"
                                      data-todo-interactive="true"
                                      draggable
                                      className="mt-0.5 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                      onDragStart={(event) =>
                                        startDrag(event, { type: "task", groupId: group.id, taskId: task.id })
                                      }
                                      onDragEnd={finishDrag}
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
                                            task.completed ? "text-slate-400 line-through" : "text-slate-700"
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
                                    <div className="mt-2 space-y-1.5 pl-7">
                                      {subtasks.map((subtask) => {
                                        const subtaskDropKey = `subtask-${group.id}-${task.id}-${subtask.id}`;
                                        return (
                                          <div
                                            key={subtask.id}
                                            data-todo-interactive="true"
                                            className={`flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 ${
                                              dropTarget === subtaskDropKey ? "ring-2 ring-blue-200" : ""
                                            }`}
                                            onDragOver={(event) => {
                                              const payload = parseDragPayload(event);
                                              if (!payload || payload.type !== "subtask") return;
                                              if (
                                                payload.groupId !== group.id ||
                                                payload.taskId !== task.id
                                              ) {
                                                return;
                                              }
                                              event.preventDefault();
                                              setDropTarget(subtaskDropKey);
                                            }}
                                            onDrop={(event) => {
                                              const payload = parseDragPayload(event);
                                              if (!payload || payload.type !== "subtask") return;
                                              if (
                                                payload.groupId !== group.id ||
                                                payload.taskId !== task.id
                                              ) {
                                                return;
                                              }
                                              event.preventDefault();
                                              moveSubtask(group.id, task.id, payload.subtaskId, subtask.id);
                                              finishDrag();
                                            }}
                                            onDragLeave={() => {
                                              if (dropTarget === subtaskDropKey) setDropTarget(null);
                                            }}
                                          >
                                            <button
                                              type="button"
                                              data-todo-interactive="true"
                                              draggable
                                              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                              onDragStart={(event) =>
                                                startDrag(event, {
                                                  type: "subtask",
                                                  groupId: group.id,
                                                  taskId: task.id,
                                                  subtaskId: subtask.id,
                                                })
                                              }
                                              onDragEnd={finishDrag}
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
                                              onClick={() => toggleSubtask(group.id, task.id, subtask.id)}
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
                                                  onChange={(event) => setDraftText(event.target.value)}
                                                  onBlur={() => void commitEdit()}
                                                  onKeyDown={(event) => {
                                                    if (event.key === "Enter") void commitEdit();
                                                    if (event.key === "Escape") cancelEdit();
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
                                              onClick={() => deleteSubtask(group.id, task.id, subtask.id)}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}

                          <button
                            type="button"
                            data-todo-interactive="true"
                            onClick={() => addTask(group.id)}
                            className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add task
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {groups.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                  No tasks yet. Create your first group or task.
                </div>
              )}

              {visibleGroups.isCapped && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
                  Task limit reached in widget view ({maxVisibleTasks}).
                </div>
              )}
            </>
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
