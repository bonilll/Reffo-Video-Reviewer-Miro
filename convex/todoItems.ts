import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByList = query({
  args: { listId: v.id("todoLists") },
  handler: async () => {
    return [];
  },
});

export const create = mutation({
  args: { listId: v.id("todoLists"), text: v.string(), groupId: v.optional(v.string()) },
  handler: async () => {
    return null;
  },
});

export const update = mutation({
  args: { id: v.id("todoItems"), text: v.optional(v.string()), completed: v.optional(v.boolean()), groupId: v.optional(v.string()) },
  handler: async () => {
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("todoItems") },
  handler: async () => {
    return null;
  },
});
