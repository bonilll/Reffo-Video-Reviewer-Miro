import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserDoc } from "./utils/auth";

const defaultCategories = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export const getConsent = query({
  args: {
    visitorId: v.string(),
  },
  async handler(ctx, { visitorId }) {
    const currentUser = await getCurrentUserDoc(ctx);
    let consent = await ctx.db
      .query("cookieConsents")
      .withIndex("byVisitor", (q) => q.eq("visitorId", visitorId))
      .order("desc")
      .first();
    if (!consent && currentUser?._id) {
      consent = await ctx.db
        .query("cookieConsents")
        .withIndex("byUser", (q) => q.eq("userId", currentUser._id))
        .order("desc")
        .first();
    }
    if (!consent) return null;
    return {
      consentGiven: consent.consentGiven,
      categories: consent.categories,
      consentVersion: consent.consentVersion,
      updatedAt: consent.updatedAt,
    };
  },
});

export const upsertConsent = mutation({
  args: {
    visitorId: v.string(),
    consentVersion: v.string(),
    categories: v.object({
      necessary: v.boolean(),
      preferences: v.boolean(),
      analytics: v.boolean(),
      marketing: v.boolean(),
    }),
    consentGiven: v.boolean(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const currentUser = await getCurrentUserDoc(ctx);
    const now = Date.now();
    const doc = {
      userId: currentUser?._id ?? undefined,
      visitorId: args.visitorId,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      locale: args.locale,
      consentGiven: args.consentGiven,
      categories: args.categories,
      consentVersion: args.consentVersion,
      createdAt: now,
      updatedAt: now,
    };
    // Data minimization: remove undefined optional fields
    if (!doc.ipAddress) delete doc.ipAddress;
    if (!doc.userAgent) delete doc.userAgent;
    if (!doc.locale) delete doc.locale;
    await ctx.db.insert("cookieConsents", doc as any);
  },
});

export const getLegalAcceptances = query({
  args: {
    visitorId: v.optional(v.string()),
  },
  async handler(ctx, { visitorId }) {
    const currentUser = await getCurrentUserDoc(ctx);
    const results: Record<string, { documentVersion: string; acceptedAt: number }> = {};
    if (currentUser?._id) {
      const rows = await ctx.db
        .query("legalAcceptances")
        .withIndex("byUserAndDoc", (q) => q.eq("userId", currentUser._id))
        .collect();
      for (const row of rows) {
        results[row.documentType] = { documentVersion: row.documentVersion, acceptedAt: row.acceptedAt };
      }
    }
    if (visitorId) {
      const rows = await ctx.db
        .query("legalAcceptances")
        .withIndex("byVisitorAndDoc", (q) => q.eq("visitorId", visitorId))
        .collect();
      for (const row of rows) {
        if (!results[row.documentType] || row.acceptedAt > results[row.documentType].acceptedAt) {
          results[row.documentType] = { documentVersion: row.documentVersion, acceptedAt: row.acceptedAt };
        }
      }
    }
    return results;
  },
});

export const acceptLegalDocument = mutation({
  args: {
    documentType: v.string(),
    documentVersion: v.string(),
    visitorId: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const currentUser = await getCurrentUserDoc(ctx);
    const now = Date.now();
    const toInsert = {
      userId: currentUser?._id ?? undefined,
      visitorId: args.visitorId,
      documentType: args.documentType,
      documentVersion: args.documentVersion,
      acceptedAt: now,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    };
    if (!toInsert.userId) delete toInsert.userId;
    if (!toInsert.visitorId) delete toInsert.visitorId;
    if (!toInsert.ipAddress) delete toInsert.ipAddress;
    if (!toInsert.userAgent) delete toInsert.userAgent;
    await ctx.db.insert("legalAcceptances", toInsert as any);
  },
});
