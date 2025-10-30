import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type GenericCtx = QueryCtx | MutationCtx;

export async function getIdentityOrThrow(ctx: GenericCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("NOT_AUTHENTICATED");
  }
  return identity;
}

export async function getCurrentUserDoc(ctx: GenericCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function getCurrentUserOrThrow(ctx: GenericCtx) {
  const user = await getCurrentUserDoc(ctx);
  if (!user) {
    throw new ConvexError("USER_NOT_FOUND");
  }
  return user;
}

export function assertOwner<T extends { ownerId: Id<"users"> }>(
  ownerId: Id<"users">,
  userId: Id<"users">
) {
  if (ownerId !== userId) {
    throw new ConvexError("FORBIDDEN");
  }
}

