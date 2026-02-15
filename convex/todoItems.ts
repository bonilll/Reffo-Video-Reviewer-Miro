import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserDoc } from "./utils/auth";

const ensureListOwner = async (ctx: any, listId: any) => {
  const user = await getCurrentUserDoc(ctx);
  if (!user) throw new Error("NOT_AUTHENTICATED");

  const list = await ctx.db.get(listId);
  if (!list || list.ownerId !== user._id) throw new Error("FORBIDDEN");

  return { user, list };
};

export const getByList = query({
  args: { listId: v.id("todoLists") },
  handler: async (ctx, args) => {
    await ensureListOwner(ctx, args.listId);
    const items = await ctx.db
      .query("todoItems")
      .withIndex("byList", (q) => q.eq("listId", args.listId))
      .collect();
    return items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  },
});

export const create = mutation({
  args: { listId: v.id("todoLists"), text: v.string(), groupId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ensureListOwner(ctx, args.listId);
    const id = await ctx.db.insert("todoItems", {
      listId: args.listId,
      text: args.text,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      groupId: args.groupId,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("todoItems"),
    text: v.optional(v.string()),
    completed: v.optional(v.boolean()),
    groupId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("NOT_FOUND");

    await ensureListOwner(ctx, item.listId);
    await ctx.db.patch(args.id, {
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.completed !== undefined ? { completed: args.completed } : {}),
      ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("todoItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("NOT_FOUND");

    await ensureListOwner(ctx, item.listId);
    await ctx.db.delete(args.id);
    return args.id;
  },
});
