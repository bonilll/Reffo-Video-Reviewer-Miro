import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const PUBLIC_MURAL_SYSTEM_CLERK_ID = "__public_mural_system__";
const PUBLIC_MURAL_SYSTEM_EMAIL = "public-mural@reffo.local";
const PUBLIC_MURAL_SYSTEM_NAME = "Reffo Public Mural";
const PUBLIC_MURAL_TITLE = "The Mural";

const getOrCreateSystemUserId = async (ctx: any): Promise<Id<"users">> => {
  const existing = await ctx.db
    .query("users")
    .withIndex("byClerkId", (q: any) => q.eq("clerkId", PUBLIC_MURAL_SYSTEM_CLERK_ID))
    .unique();

  if (existing) {
    return existing._id;
  }

  const now = Date.now();
  return await ctx.db.insert("users", {
    clerkId: PUBLIC_MURAL_SYSTEM_CLERK_ID,
    email: PUBLIC_MURAL_SYSTEM_EMAIL,
    name: PUBLIC_MURAL_SYSTEM_NAME,
    createdAt: now,
    updatedAt: now,
  });
};

export const getPublicMuralBoard = query({
  args: {},
  handler: async (ctx) => {
    const board = await ctx.db
      .query("boards")
      .withIndex("byPublicMural", (q: any) => q.eq("isPublicMural", true))
      .first();
    return board ?? null;
  },
});

export const ensurePublicMuralBoard = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = (args.title ?? PUBLIC_MURAL_TITLE).trim() || PUBLIC_MURAL_TITLE;

    const existing = await ctx.db
      .query("boards")
      .withIndex("byPublicMural", (q: any) => q.eq("isPublicMural", true))
      .first();

    if (existing) {
      if (existing.title !== title) {
        await ctx.db.patch(existing._id, {
          title,
          updatedAt: Date.now(),
        });
      }
      return existing._id;
    }

    const ownerId = await getOrCreateSystemUserId(ctx);
    const now = Date.now();

    return await ctx.db.insert("boards", {
      title,
      ownerId,
      ownerName: PUBLIC_MURAL_SYSTEM_NAME,
      isPublicMural: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});
