import { query } from "./_generated/server";
import { v } from "convex/values";

export const getReviewSessionsForAsset = query({
  args: {
    boardId: v.optional(v.id("boards")),
    primaryAssetId: v.string(),
  },
  handler: async () => {
    return [];
  },
});

export const hasAccessibleReviewSessions = query({
  args: {
    boardId: v.optional(v.id("boards")),
    primaryAssetId: v.optional(v.string()),
  },
  handler: async () => {
    return false;
  },
});

export const debugReviewSessionAccess = query({
  args: {
    boardId: v.optional(v.id("boards")),
    primaryAssetId: v.optional(v.string()),
  },
  handler: async () => {
    return { hasAccess: false, reason: "not-configured" };
  },
});
