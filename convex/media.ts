import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

type BoardRole = "owner" | "editor" | "viewer";

async function getBoardRole(
  ctx: any,
  boardId: Id<"boards">,
  user: { _id: Id<"users">; email?: string | null }
): Promise<BoardRole | null> {
  const board = await ctx.db.get(boardId);
  if (!board) return null;
  if (board.ownerId === user._id) return "owner";

  const byUser = await ctx.db
    .query("boardSharing")
    .withIndex("byBoardUser", (q: any) =>
      q.eq("boardId", boardId).eq("userId", user._id)
    )
    .first();
  if (byUser) return (byUser.role as BoardRole) ?? "viewer";

  if (user.email) {
    const byEmail = await ctx.db
      .query("boardSharing")
      .withIndex("byBoardEmail", (q: any) =>
        q.eq("boardId", boardId).eq("userEmail", user.email)
      )
      .first();
    if (byEmail) return (byEmail.role as BoardRole) ?? "viewer";
  }

  return null;
}

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    url: v.string(),
    type: v.string(),
    name: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    orgId: v.optional(v.string()),
    isFromLibrary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const role = await getBoardRole(ctx, args.boardId, user);
    if (!role) throw new ConvexError("FORBIDDEN");
    if (role === "viewer") throw new ConvexError("READ_ONLY");

    const now = Date.now();
    const mediaId = await ctx.db.insert("media", {
      boardId: args.boardId,
      url: args.url,
      type: args.type,
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
      orgId: args.orgId,
      isFromLibrary: args.isFromLibrary ?? false,
      userId: user._id,
      userName: user.name ?? undefined,
      userEmail: user.email ?? undefined,
      createdAt: now,
    });

    return mediaId;
  },
});

export const registerLibraryImport = mutation({
  args: {
    boardId: v.id("boards"),
    url: v.string(),
    type: v.string(),
    name: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    orgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const role = await getBoardRole(ctx, args.boardId, user);
    if (!role) throw new ConvexError("FORBIDDEN");
    if (role === "viewer") throw new ConvexError("READ_ONLY");

    const existing = await ctx.db
      .query("media")
      .withIndex("byBoard", (q) => q.eq("boardId", args.boardId))
      .filter((q) => q.eq(q.field("url"), args.url))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const mediaId = await ctx.db.insert("media", {
      boardId: args.boardId,
      url: args.url,
      type: args.type,
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
      orgId: args.orgId,
      isFromLibrary: true,
      userId: user._id,
      userName: user.name ?? undefined,
      userEmail: user.email ?? undefined,
      createdAt: now,
    });

    return mediaId;
  },
});

export const getByBoard = query({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];

    const role = await getBoardRole(ctx, args.boardId, user);
    if (!role) return [];

    return await ctx.db
      .query("media")
      .withIndex("byBoard", (q) => q.eq("boardId", args.boardId))
      .collect();
  },
});

export const deleteByBoard = mutation({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const role = await getBoardRole(ctx, args.boardId, user);
    if (!role) throw new ConvexError("FORBIDDEN");
    if (role !== "owner") throw new ConvexError("FORBIDDEN");

    const mediaFiles = await ctx.db
      .query("media")
      .withIndex("byBoard", (q) => q.eq("boardId", args.boardId))
      .collect();

    for (const media of mediaFiles) {
      await ctx.db.delete(media._id);
    }

    return { deleted: mediaFiles.length };
  },
});
