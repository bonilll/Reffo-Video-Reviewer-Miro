import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserDoc } from "./utils/auth";

const countTasksFromGroups = (groups: any[]): { itemCount: number; completedCount: number } => {
  let itemCount = 0;
  let completedCount = 0;

  groups.forEach((group) => {
    const tasks = Array.isArray(group?.tasks) ? group.tasks : [];
    tasks.forEach((task: any) => {
      itemCount += 1;
      if (Boolean(task?.completed)) {
        completedCount += 1;
      }
    });
  });

  return { itemCount, completedCount };
};

const normalizeGroups = (groups: any[] | undefined): any[] => {
  if (!Array.isArray(groups)) return [];
  return groups;
};

export const getLists = query({
  args: { archived: v.optional(v.boolean()), projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];

    const archived = args.archived ?? false;
    const lists = await ctx.db
      .query("todoLists")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    return lists
      .filter((list) => (list.archived ?? false) === archived)
      .filter((list) => (args.projectId ? list.projectId === args.projectId : true))
      .map((list) => {
        const { itemCount, completedCount } = countTasksFromGroups(normalizeGroups(list.groups));
        return {
          ...list,
          itemCount,
          completedCount,
          updatedAt: list.updatedAt ?? list.createdAt,
          isOwned: true,
        };
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },
});

export const getSharedLists = query({
  args: {},
  handler: async () => {
    // Todo sharing is not modeled yet in this schema.
    return [];
  },
});

export const getById = query({
  args: { id: v.id("todoLists") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return null;

    const list = await ctx.db.get(args.id);
    if (!list) return null;
    if (list.ownerId !== user._id) return null;

    const { itemCount, completedCount } = countTasksFromGroups(normalizeGroups(list.groups));
    return {
      ...list,
      itemCount,
      completedCount,
      updatedAt: list.updatedAt ?? list.createdAt,
      groups: normalizeGroups(list.groups),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    groups: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const now = Date.now();
    return await ctx.db.insert("todoLists", {
      ownerId: user._id,
      name: args.name.trim() || "Todo list",
      color: args.color,
      projectId: args.projectId,
      groups: normalizeGroups(args.groups),
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: { id: v.id("todoLists"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const list = await ctx.db.get(args.id);
    if (!list || list.ownerId !== user._id) throw new Error("FORBIDDEN");

    await ctx.db.patch(args.id, {
      name: args.name.trim() || "Todo list",
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const updateGroups = mutation({
  args: { id: v.id("todoLists"), groups: v.array(v.any()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const list = await ctx.db.get(args.id);
    if (!list || list.ownerId !== user._id) throw new Error("FORBIDDEN");

    await ctx.db.patch(args.id, {
      groups: normalizeGroups(args.groups),
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const archive = mutation({
  args: { id: v.id("todoLists") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const list = await ctx.db.get(args.id);
    if (!list || list.ownerId !== user._id) throw new Error("FORBIDDEN");

    await ctx.db.patch(args.id, {
      archived: true,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("todoLists") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) throw new Error("NOT_AUTHENTICATED");

    const list = await ctx.db.get(args.id);
    if (!list || list.ownerId !== user._id) throw new Error("FORBIDDEN");

    const items = await ctx.db
      .query("todoItems")
      .withIndex("byList", (q) => q.eq("listId", args.id))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const getTodoPermissions = query({
  args: { todoListId: v.id("todoLists") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    const list = await ctx.db.get(args.todoListId);

    if (!list) {
      return {
        canRead: false,
        canWrite: false,
        canShare: false,
        canDelete: false,
        canAdmin: false,
        userRole: null,
        resourceExists: false,
      };
    }

    const isOwner = Boolean(user && list.ownerId === user._id);
    return {
      canRead: isOwner,
      canWrite: isOwner,
      canShare: isOwner,
      canDelete: isOwner,
      canAdmin: isOwner,
      userRole: isOwner ? "owner" : null,
      resourceExists: true,
    };
  },
});

export const requestTodoAccess = mutation({
  args: { todoListId: v.id("todoLists"), requestedRole: v.string(), message: v.optional(v.string()) },
  handler: async () => {
    return { success: false, reason: "TODO_SHARING_NOT_IMPLEMENTED" } as const;
  },
});

export const contactTodoOwner = mutation({
  args: { todoListId: v.id("todoLists"), message: v.string() },
  handler: async () => {
    return { success: false, reason: "TODO_SHARING_NOT_IMPLEMENTED" } as const;
  },
});
