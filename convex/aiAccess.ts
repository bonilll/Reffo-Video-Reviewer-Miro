import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./utils/auth";

type BoardRole = "owner" | "editor" | "viewer";

type BoardAccess = {
  board: Doc<"boards">;
  user: Doc<"users">;
  role: BoardRole;
};

const resolveBoardRole = async (
  ctx: any,
  boardId: Id<"boards">,
  user: Doc<"users">
): Promise<BoardRole | null> => {
  const board = await ctx.db.get(boardId);
  if (!board) return null;

  if (board.ownerId === user._id) {
    return "owner";
  }

  const byUser = await ctx.db
    .query("boardSharing")
    .withIndex("byBoardUser", (q: any) => q.eq("boardId", boardId).eq("userId", user._id))
    .first();

  if (byUser?.role) {
    return (byUser.role as BoardRole) ?? "viewer";
  }

  if (user.email) {
    const byEmail = await ctx.db
      .query("boardSharing")
      .withIndex("byBoardEmail", (q: any) => q.eq("boardId", boardId).eq("userEmail", user.email))
      .first();

    if (byEmail?.role) {
      return (byEmail.role as BoardRole) ?? "viewer";
    }
  }

  return null;
};

export const requireBoardRead = async (
  ctx: any,
  boardId: Id<"boards">
): Promise<BoardAccess> => {
  const user = await getCurrentUserOrThrow(ctx);
  const board = await ctx.db.get(boardId);
  if (!board) throw new ConvexError("BOARD_NOT_FOUND");

  if (board.isPublicMural) {
    return {
      board,
      user,
      role: "viewer",
    };
  }

  const role = await resolveBoardRole(ctx, boardId, user);
  if (!role) throw new ConvexError("FORBIDDEN");

  return { board, user, role };
};

export const requireBoardWrite = async (
  ctx: any,
  boardId: Id<"boards">
): Promise<BoardAccess> => {
  const access = await requireBoardRead(ctx, boardId);
  if (access.role === "viewer") {
    throw new ConvexError("FORBIDDEN");
  }
  return access;
};

export const requireSubnetworkRead = async (
  ctx: any,
  subnetworkId: Id<"aiSubnetworks">
) => {
  const subnetwork = await ctx.db.get(subnetworkId);
  if (!subnetwork) throw new ConvexError("AI_SUBNETWORK_NOT_FOUND");
  const access = await requireBoardRead(ctx, subnetwork.boardId);
  return {
    ...access,
    subnetwork,
  };
};

export const requireSubnetworkWrite = async (
  ctx: any,
  subnetworkId: Id<"aiSubnetworks">
) => {
  const subnetwork = await ctx.db.get(subnetworkId);
  if (!subnetwork) throw new ConvexError("AI_SUBNETWORK_NOT_FOUND");
  const access = await requireBoardWrite(ctx, subnetwork.boardId);
  return {
    ...access,
    subnetwork,
  };
};
