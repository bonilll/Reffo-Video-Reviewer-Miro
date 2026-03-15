import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

type BoardRole = "owner" | "editor" | "viewer";
type BoardColor = { r: number; g: number; b: number };

type BoardAccess = {
  board: any;
  role: BoardRole;
};

const clampColorChannel = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)));

const normalizeColor = (color: BoardColor): BoardColor => ({
  r: clampColorChannel(color.r),
  g: clampColorChannel(color.g),
  b: clampColorChannel(color.b),
});

const colorsEqual = (a: BoardColor, b: BoardColor) =>
  a.r === b.r && a.g === b.g && a.b === b.b;

const normalizePalette = (colors: BoardColor[] | undefined) => {
  if (!Array.isArray(colors)) return [] as BoardColor[];
  const palette: BoardColor[] = [];
  for (const color of colors) {
    const normalized = normalizeColor(color);
    if (!palette.some((entry) => colorsEqual(entry, normalized))) {
      palette.push(normalized);
    }
  }
  return palette;
};

async function getBoardAccess(
  ctx: any,
  boardId: Id<"boards">,
  user: { _id: Id<"users">; email?: string | null }
): Promise<BoardAccess | null> {
  const board = await ctx.db.get(boardId);
  if (!board) return null;

  if (board.ownerId === user._id) {
    return { board, role: "owner" };
  }

  const byUser = await ctx.db
    .query("boardSharing")
    .withIndex("byBoardUser", (q: any) =>
      q.eq("boardId", boardId).eq("userId", user._id)
    )
    .first();

  const byEmail = user.email
    ? await ctx.db
        .query("boardSharing")
        .withIndex("byBoardEmail", (q: any) =>
          q.eq("boardId", boardId).eq("userEmail", user.email)
        )
        .first()
    : null;

  const sharing = byUser ?? byEmail;
  if (!sharing) return null;

  const role = (sharing.role as BoardRole) ?? "viewer";
  return { board, role };
}

export const get = query({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) return null;
    if (board.isPublicMural) return board;

    const user = await getCurrentUserDoc(ctx);
    if (!user) return null;
    const access = await getBoardAccess(ctx, args.id, user);
    return access?.board ?? null;
  },
});

export const updateImage = mutation({
  args: {
    id: v.id("boards"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const access = await getBoardAccess(ctx, args.id, user);
    if (!access) throw new ConvexError("FORBIDDEN");

    if (!args.imageUrl.startsWith("data:image/")) {
      throw new ConvexError("INVALID_IMAGE_FORMAT");
    }

    await ctx.db.patch(args.id, {
      imageUrl: args.imageUrl,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const getBoardCamera = query({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) return null;
    if (board.isPublicMural) {
      return board.camera ?? { x: 0, y: 0, scale: 1 };
    }

    const user = await getCurrentUserDoc(ctx);
    if (!user) return null;
    const access = await getBoardAccess(ctx, args.id, user);
    if (!access) return null;
    return access.board.camera ?? { x: 0, y: 0, scale: 1 };
  },
});

export const saveBoardCamera = mutation({
  args: {
    id: v.id("boards"),
    camera: v.object({
      x: v.number(),
      y: v.number(),
      scale: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (board.isPublicMural) {
      await ctx.db.patch(args.id, {
        camera: args.camera,
        updatedAt: Date.now(),
      });
      return { success: true };
    }

    const user = await getCurrentUserOrThrow(ctx);
    const access = await getBoardAccess(ctx, args.id, user);
    if (!access) throw new ConvexError("FORBIDDEN");

    await ctx.db.patch(args.id, {
      camera: args.camera,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const getCustomColors = query({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) return [];
    if (board.isPublicMural) {
      return normalizePalette(board.customColors as BoardColor[] | undefined);
    }

    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    const access = await getBoardAccess(ctx, args.id, user);
    if (!access) return [];

    return normalizePalette(access.board.customColors as BoardColor[] | undefined);
  },
});

export const addCustomColor = mutation({
  args: {
    id: v.id("boards"),
    color: v.object({
      r: v.number(),
      g: v.number(),
      b: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (!board.isPublicMural) {
      const user = await getCurrentUserOrThrow(ctx);
      const access = await getBoardAccess(ctx, args.id, user);
      if (!access) throw new ConvexError("FORBIDDEN");
      if (access.role === "viewer") throw new ConvexError("FORBIDDEN");
    }

    const normalized = normalizeColor(args.color);
    const existing = normalizePalette(board.customColors as BoardColor[] | undefined);
    const nextPalette = [
      normalized,
      ...existing.filter((color) => !colorsEqual(color, normalized)),
    ];

    await ctx.db.patch(args.id, {
      customColors: nextPalette,
      updatedAt: Date.now(),
    });

    return nextPalette;
  },
});

export const removeCustomColor = mutation({
  args: {
    id: v.id("boards"),
    color: v.object({
      r: v.number(),
      g: v.number(),
      b: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (!board.isPublicMural) {
      const user = await getCurrentUserOrThrow(ctx);
      const access = await getBoardAccess(ctx, args.id, user);
      if (!access) throw new ConvexError("FORBIDDEN");
      if (access.role === "viewer") throw new ConvexError("FORBIDDEN");
    }

    const normalized = normalizeColor(args.color);
    const existing = normalizePalette(board.customColors as BoardColor[] | undefined);
    const nextPalette = existing.filter((color) => !colorsEqual(color, normalized));

    await ctx.db.patch(args.id, {
      customColors: nextPalette,
      updatedAt: Date.now(),
    });

    return nextPalette;
  },
});

export const updateCustomColor = mutation({
  args: {
    id: v.id("boards"),
    previousColor: v.object({
      r: v.number(),
      g: v.number(),
      b: v.number(),
    }),
    nextColor: v.object({
      r: v.number(),
      g: v.number(),
      b: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (!board.isPublicMural) {
      const user = await getCurrentUserOrThrow(ctx);
      const access = await getBoardAccess(ctx, args.id, user);
      if (!access) throw new ConvexError("FORBIDDEN");
      if (access.role === "viewer") throw new ConvexError("FORBIDDEN");
    }

    const previous = normalizeColor(args.previousColor);
    const next = normalizeColor(args.nextColor);
    const existing = normalizePalette(board.customColors as BoardColor[] | undefined);

    let replaced = false;
    const updated = existing.map((color) => {
      if (!replaced && colorsEqual(color, previous)) {
        replaced = true;
        return next;
      }
      return color;
    });

    const deduped: BoardColor[] = [];
    for (const color of updated) {
      if (!deduped.some((entry) => colorsEqual(entry, color))) {
        deduped.push(color);
      }
    }

    const nextPalette = replaced ? deduped : [next, ...deduped];

    await ctx.db.patch(args.id, {
      customColors: nextPalette,
      updatedAt: Date.now(),
    });

    return nextPalette;
  },
});

export const remove = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");
    if (board.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    const sharingRecords = await ctx.db
      .query("boardSharing")
      .withIndex("byBoard", (q: any) => q.eq("boardId", args.id))
      .collect();

    for (const record of sharingRecords) {
      await ctx.db.delete(record._id);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const archive = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");
    if (board.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    await ctx.db.patch(args.id, {
      isArchived: true,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const unarchive = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");
    if (board.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    await ctx.db.patch(args.id, {
      isArchived: false,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});
