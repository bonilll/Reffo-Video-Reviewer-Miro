import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserDoc } from "./utils/auth";

export const getLists = query({
  args: { archived: v.optional(v.boolean()), projectId: v.optional(v.id("projects")) },
  handler: async (ctx) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    return [];
  },
});

export const getSharedLists = query({
  args: {},
  handler: async () => {
    return [];
  },
});

export const getById = query({
  args: { id: v.id("todoLists") },
  handler: async () => {
    return null;
  },
});

export const getTodoPermissions = query({
  args: { todoListId: v.id("todoLists") },
  handler: async () => {
    return {
      canRead: false,
      canWrite: false,
      canShare: false,
      canDelete: false,
      canAdmin: false,
      userRole: null,
      resourceExists: false,
    };
  },
});

export const requestTodoAccess = mutation({
  args: { todoListId: v.id("todoLists"), requestedRole: v.string(), message: v.optional(v.string()) },
  handler: async () => {
    return null;
  },
});

export const contactTodoOwner = mutation({
  args: { todoListId: v.id("todoLists"), message: v.string() },
  handler: async () => {
    return null;
  },
});
