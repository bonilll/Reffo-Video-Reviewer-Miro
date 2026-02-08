import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import { effectiveAvatar } from "./utils/avatar";

type BoardRole = "owner" | "editor" | "viewer";

type BoardPermissionResult = {
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
  canDelete: boolean;
  canAdmin: boolean;
  userRole: BoardRole | null;
  resourceExists: boolean;
  projectId: Id<"projects"> | null;
};

const normalizeTitle = (title: string) => title.trim();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const permissionsByRole: Record<
  BoardRole,
  Omit<BoardPermissionResult, "userRole" | "resourceExists" | "projectId">
> = {
  owner: {
    canRead: true,
    canWrite: true,
    canShare: true,
    canDelete: true,
    canAdmin: true,
  },
  editor: {
    canRead: true,
    canWrite: true,
    canShare: false,
    canDelete: false,
    canAdmin: false,
  },
  viewer: {
    canRead: true,
    canWrite: false,
    canShare: false,
    canDelete: false,
    canAdmin: false,
  },
};

async function findBoardSharing(
  ctx: any,
  boardId: Id<"boards">,
  user: { _id: Id<"users">; email?: string | null }
) {
  const byUser = await ctx.db
    .query("boardSharing")
    .withIndex("byBoardUser", (q: any) =>
      q.eq("boardId", boardId).eq("userId", user._id)
    )
    .first();

  if (byUser) return byUser;

  if (user.email) {
    const byEmail = await ctx.db
      .query("boardSharing")
      .withIndex("byBoardEmail", (q: any) =>
        q.eq("boardId", boardId).eq("userEmail", user.email)
      )
      .first();
    return byEmail ?? null;
  }

  return null;
}

export const create = mutation({
  args: {
    title: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const title = normalizeTitle(args.title);

    if (!title) {
      throw new ConvexError("TITLE_REQUIRED");
    }

    if (title.length > 80) {
      throw new ConvexError("TITLE_TOO_LONG");
    }

    const now = Date.now();

    const boardId = await ctx.db.insert("boards", {
      title,
      ownerId: user._id,
      ownerName: user.name ?? user.email ?? "",
      projectId: args.projectId,
      createdAt: now,
      updatedAt: now,
    });

    return boardId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];

    const ownedBoards = await ctx.db
      .query("boards")
      .withIndex("byOwner", (q: any) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    const sharedByUser = await ctx.db
      .query("boardSharing")
      .withIndex("byUser", (q: any) => q.eq("userId", user._id))
      .collect();

    const sharedByEmail = user.email
      ? await ctx.db
          .query("boardSharing")
          .withIndex("byEmail", (q: any) => q.eq("userEmail", user.email))
          .collect()
      : [];

    const sharedRecords = [...sharedByUser, ...sharedByEmail];
    const sharedBoardIds = [
      ...new Set(sharedRecords.map((record: any) => record.boardId)),
    ];

    const sharedBoards = await Promise.all(
      sharedBoardIds.map(async (boardId: Id<"boards">) => {
        const board = await ctx.db.get(boardId);
        const record = sharedRecords.find((r: any) => r.boardId === boardId);
        if (!board || !record) return null;
        return {
          ...board,
          isShared: true,
          sharedRole: record.role,
        };
      })
    );

    const owned = ownedBoards.map((board: any) => ({
      ...board,
      isShared: false,
      sharedRole: null,
    }));

    return [...owned, ...sharedBoards.filter(Boolean)];
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];

    const ownedBoards = await ctx.db
      .query("boards")
      .withIndex("byOwnerProject", (q: any) =>
        q.eq("ownerId", user._id).eq("projectId", args.projectId)
      )
      .order("desc")
      .collect();

    const sharedByUser = await ctx.db
      .query("boardSharing")
      .withIndex("byUser", (q: any) => q.eq("userId", user._id))
      .collect();

    const sharedByEmail = user.email
      ? await ctx.db
          .query("boardSharing")
          .withIndex("byEmail", (q: any) => q.eq("userEmail", user.email))
          .collect()
      : [];

    const sharedRecords = [...sharedByUser, ...sharedByEmail];
    const sharedBoardIds = [
      ...new Set(sharedRecords.map((record: any) => record.boardId)),
    ];

    const sharedBoards = await Promise.all(
      sharedBoardIds.map(async (boardId: Id<"boards">) => {
        const board = await ctx.db.get(boardId);
        const record = sharedRecords.find((r: any) => r.boardId === boardId);
        if (!board || !record) return null;
        if (board.projectId !== args.projectId) return null;
        return {
          ...board,
          isShared: true,
          sharedRole: record.role,
        };
      })
    );

    const owned = ownedBoards.map((board: any) => ({
      ...board,
      isShared: false,
      sharedRole: null,
    }));

    return [...owned, ...sharedBoards.filter(Boolean)];
  },
});

export const get = query({
  args: {
    id: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return null;

    const board = await ctx.db.get(args.id);
    if (!board) return null;

    if (board.ownerId === user._id) {
      return board;
    }

    const sharing = await findBoardSharing(ctx, args.id, user);
    if (sharing) {
      return board;
    }

    return null;
  },
});

export const updateTitle = mutation({
  args: {
    id: v.id("boards"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (board.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const title = normalizeTitle(args.title);
    if (!title) throw new ConvexError("TITLE_REQUIRED");
    if (title.length > 80) throw new ConvexError("TITLE_TOO_LONG");

    await ctx.db.patch(args.id, {
      title,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (board.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const sharingRecords = (await ctx.db
      .query("boardSharing")
      .withIndex("byBoard", (q: any) => q.eq("boardId", args.id))
      .collect()) as Doc<"boardSharing">[];

    for (const record of sharingRecords) {
      await ctx.db.delete(record._id);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const getBoardPermissions = query({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args): Promise<BoardPermissionResult> => {
    const user = await getCurrentUserDoc(ctx);

    if (!user) {
      return {
        canRead: false,
        canWrite: false,
        canShare: false,
        canDelete: false,
        canAdmin: false,
        userRole: null,
        resourceExists: false,
        projectId: null,
      };
    }

    const board = await ctx.db.get(args.boardId);
    if (!board) {
      return {
        canRead: false,
        canWrite: false,
        canShare: false,
        canDelete: false,
        canAdmin: false,
        userRole: null,
        resourceExists: false,
        projectId: null,
      };
    }

    if (board.ownerId === user._id) {
      return {
        ...permissionsByRole.owner,
        userRole: "owner",
        resourceExists: true,
        projectId: board.projectId ?? null,
      };
    }

    const sharing = await findBoardSharing(ctx, args.boardId, user);
    if (!sharing) {
      return {
        canRead: false,
        canWrite: false,
        canShare: false,
        canDelete: false,
        canAdmin: false,
        userRole: null,
        resourceExists: true,
        projectId: board.projectId ?? null,
      };
    }

    const role = (sharing.role as BoardRole) ?? "viewer";

    return {
      ...(permissionsByRole[role] ?? permissionsByRole.viewer),
      userRole: role,
      resourceExists: true,
      projectId: board.projectId ?? null,
    };
  },
});

export const requestBoardAccess = mutation({
  args: {
    boardId: v.id("boards"),
    requestedRole: v.union(v.literal("viewer"), v.literal("editor")),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (board.ownerId === user._id) {
      throw new ConvexError("ALREADY_OWNER");
    }

    const existing = await ctx.db
      .query("boardAccessRequests")
      .withIndex("byBoardStatus", (q: any) =>
        q.eq("boardId", args.boardId).eq("status", "pending")
      )
      .filter((q: any) => q.eq(q.field("requesterId"), user._id))
      .first();

    if (existing) return existing._id;

    const requestId = await ctx.db.insert("boardAccessRequests", {
      boardId: args.boardId,
      requesterId: user._id,
      requesterEmail: user.email,
      requestedRole: args.requestedRole,
      message: args.message?.trim() || undefined,
      status: "pending",
      createdAt: Date.now(),
    });

    return requestId;
  },
});

export const contactBoardOwner = mutation({
  args: {
    boardId: v.id("boards"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (!args.message.trim()) {
      throw new ConvexError("MESSAGE_REQUIRED");
    }

    const requestId = await ctx.db.insert("boardAccessRequests", {
      boardId: args.boardId,
      requesterId: user._id,
      requesterEmail: user.email,
      requestedRole: "viewer",
      message: args.message.trim(),
      status: "message",
      createdAt: Date.now(),
    });

    return requestId;
  },
});

export const shareBoard = mutation({
  args: {
    id: v.id("boards"),
    email: v.string(),
    role: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (board.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const email = normalizeEmail(args.email);
    if (!email) throw new ConvexError("EMAIL_REQUIRED");

    const invitedUser = await ctx.db
      .query("users")
      .withIndex("byEmail", (q: any) => q.eq("email", email))
      .unique();

    const existing = await ctx.db
      .query("boardSharing")
      .withIndex("byBoardEmail", (q: any) =>
        q.eq("boardId", args.id).eq("userEmail", email)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        userId: invitedUser?._id ?? existing.userId,
        userEmail: email,
        acceptedAt: invitedUser ? now : existing.acceptedAt,
      });
      return existing._id;
    }

    const shareId = await ctx.db.insert("boardSharing", {
      boardId: args.id,
      userId: invitedUser?._id,
      userEmail: email,
      role: args.role,
      invitedBy: user._id,
      createdAt: now,
      acceptedAt: invitedUser ? now : undefined,
    });

    return shareId;
  },
});

export const updateBoardMemberRole = mutation({
  args: {
    id: v.id("boards"),
    memberId: v.id("boardSharing"),
    role: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    if (board.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const sharing = await ctx.db.get(args.memberId);
    if (!sharing || sharing.boardId !== args.id) {
      throw new ConvexError("SHARING_NOT_FOUND");
    }

    await ctx.db.patch(args.memberId, {
      role: args.role,
    });

    return args.memberId;
  },
});

export const removeBoardSharing = mutation({
  args: {
    id: v.id("boards"),
    memberId: v.id("boardSharing"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const board = await ctx.db.get(args.id);
    if (!board) throw new ConvexError("BOARD_NOT_FOUND");

    const sharing = await ctx.db.get(args.memberId);
    if (!sharing || sharing.boardId !== args.id) {
      throw new ConvexError("SHARING_NOT_FOUND");
    }

    const isOwner = board.ownerId === user._id;
    const isSelf =
      (sharing.userId && sharing.userId === user._id) ||
      (sharing.userEmail && user.email && sharing.userEmail === user.email);

    if (!isOwner && !isSelf) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.delete(args.memberId);
    return { success: true };
  },
});

export const getBoardSharing = query({
  args: {
    id: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) throw new ConvexError("NOT_AUTHENTICATED");

    const board = await ctx.db.get(args.id);
    if (!board) return null;

    const isOwner = board.ownerId === user._id;
    if (!isOwner) {
      const sharing = await findBoardSharing(ctx, args.id, user);
      if (!sharing) {
        throw new ConvexError("FORBIDDEN");
      }
    }

    const ownerDoc = await ctx.db.get(board.ownerId);

    const sharingRecords = await ctx.db
      .query("boardSharing")
      .withIndex("byBoard", (q: any) => q.eq("boardId", args.id))
      .collect();

    const members = await Promise.all(
      sharingRecords.map(async (record) => {
        let memberUser: Doc<"users"> | null = null;
        if (record.userId) {
          memberUser = await ctx.db.get(record.userId);
        }
        if (!memberUser && record.userEmail) {
          memberUser = await ctx.db
            .query("users")
            .withIndex("byEmail", (q: any) =>
              q.eq("email", record.userEmail)
            )
            .unique();
        }

        return {
          id: record._id,
          userId: record.userId ?? memberUser?._id ?? null,
          name:
            memberUser?.name ??
            memberUser?.email ??
            record.userEmail?.split("@")[0] ??
            "User",
          email: record.userEmail ?? memberUser?.email ?? "",
          imageUrl: effectiveAvatar(memberUser),
          role: (record.role as BoardRole) ?? "viewer",
        };
      })
    );

    return {
      owner: {
        userId: board.ownerId,
        name: ownerDoc?.name ?? ownerDoc?.email ?? "Owner",
        email: ownerDoc?.email ?? "",
        imageUrl: effectiveAvatar(ownerDoc),
        role: "owner" as const,
      },
      members,
      isOwner,
    };
  },
});
