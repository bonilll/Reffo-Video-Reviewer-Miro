import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./utils/auth";

const PROVIDER_GOOGLE = "google";
const ACTIVE = "active";
const PAUSED = "paused";
const DELETED = "deleted";
const EXPIRED = "expired";

const gatewayValidator = v.object({
  ts: v.number(),
  nonce: v.string(),
  signature: v.string(),
  payloadHash: v.string(),
});

const modeValidator = v.union(v.literal("session"), v.literal("persistent"));

const textEncoder = new TextEncoder();

const toHex = (input: ArrayBuffer) =>
  Array.from(new Uint8Array(input))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return toHex(digest);
};

const hmacHex = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return toHex(signature);
};

const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const nowTs = () => Date.now();

const keyMetadata = (record: any, mode: "session" | "persistent") => ({
  keyId: String(record._id),
  mode,
  provider: record.provider,
  label: record.label ?? null,
  status: record.status,
  last4: record.last4,
  fingerprint: record.fingerprint,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  lastUsedAt: record.lastUsedAt ?? null,
  lastTestAt: record.lastTestAt ?? null,
  pauseReason: record.pauseReason ?? null,
  expiresAt: mode === "session" ? record.expiresAt ?? null : null,
});

const getGatewaySecret = () => {
  const secret = process.env.AI_KEYS_GATEWAY_SIGNING_SECRET;
  if (!secret) {
    throw new ConvexError("AI_KEYS_GATEWAY_SIGNING_SECRET_MISSING");
  }
  return secret;
};

const assertGatewayRequest = async (
  userId: Id<"users">,
  action: string,
  gateway: {
    ts: number;
    nonce: string;
    signature: string;
    payloadHash: string;
  }
) => {
  const now = nowTs();
  const maxSkewMs = 5 * 60 * 1000;
  if (Math.abs(now - gateway.ts) > maxSkewMs) {
    throw new ConvexError("AI_GATEWAY_SIGNATURE_EXPIRED");
  }

  if (gateway.nonce.trim().length < 10) {
    throw new ConvexError("AI_GATEWAY_NONCE_INVALID");
  }

  const secret = getGatewaySecret();
  const payload = `${String(userId)}:${action}:${gateway.ts}:${gateway.nonce}:${gateway.payloadHash}`;
  const expected = await hmacHex(secret, payload);

  if (!constantTimeEqual(expected, gateway.signature)) {
    throw new ConvexError("AI_GATEWAY_SIGNATURE_INVALID");
  }
};

const consumeProofToken = async (
  ctx: any,
  userId: Id<"users">,
  proofToken: string,
  expectedAction: string
) => {
  const tokenHash = await sha256Hex(proofToken);
  const record = await ctx.db
    .query("aiStepUpProofs")
    .withIndex("byTokenHash", (q: any) => q.eq("tokenHash", tokenHash))
    .first();

  if (!record) {
    throw new ConvexError("AI_STEP_UP_PROOF_INVALID");
  }

  if (record.userId !== userId) {
    throw new ConvexError("AI_STEP_UP_PROOF_FORBIDDEN");
  }

  if (record.action !== expectedAction) {
    throw new ConvexError("AI_STEP_UP_PROOF_SCOPE_INVALID");
  }

  if (record.usedAt) {
    throw new ConvexError("AI_STEP_UP_PROOF_ALREADY_USED");
  }

  if (record.expiresAt <= nowTs()) {
    throw new ConvexError("AI_STEP_UP_PROOF_EXPIRED");
  }

  await ctx.db.patch(record._id, {
    usedAt: nowTs(),
  });
};

const loadGoogleKeyRecord = async (
  ctx: any,
  userId: Id<"users">,
  mode: "session" | "persistent",
  keyId: string
) => {
  if (mode === "persistent") {
    const key = await ctx.db.get(keyId as Id<"aiProviderKeys">);
    if (!key || key.userId !== userId || key.provider !== PROVIDER_GOOGLE) {
      throw new ConvexError("AI_KEY_NOT_FOUND");
    }
    return key;
  }

  const key = await ctx.db.get(keyId as Id<"aiProviderKeySessions">);
  if (!key || key.userId !== userId || key.provider !== PROVIDER_GOOGLE) {
    throw new ConvexError("AI_KEY_NOT_FOUND");
  }
  return key;
};

export const listGoogleKeys = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = nowTs();

    const persistent = await ctx.db
      .query("aiProviderKeys")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();

    const sessions = await ctx.db
      .query("aiProviderKeySessions")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();

    const result = [
      ...persistent
        .filter((item) => item.provider === PROVIDER_GOOGLE && item.status !== DELETED)
        .map((item) => keyMetadata(item, "persistent")),
      ...sessions
        .filter(
          (item) =>
            item.provider === PROVIDER_GOOGLE &&
            item.status !== DELETED &&
            item.status !== EXPIRED &&
            item.expiresAt > now
        )
        .map((item) => keyMetadata(item, "session")),
    ];

    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const resolveActiveGoogleKey = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = nowTs();

    const sessions = await ctx.db
      .query("aiProviderKeySessions")
      .withIndex("byUserProviderStatus", (q) =>
        q.eq("userId", user._id).eq("provider", PROVIDER_GOOGLE).eq("status", ACTIVE)
      )
      .order("desc")
      .collect();

    const activeSession = sessions.find((item) => item.expiresAt > now);
    if (activeSession) {
      return {
        keyId: String(activeSession._id),
        mode: "session" as const,
        status: activeSession.status,
        last4: activeSession.last4,
        fingerprint: activeSession.fingerprint,
        expiresAt: activeSession.expiresAt,
      };
    }

    const persistent = await ctx.db
      .query("aiProviderKeys")
      .withIndex("byUserProviderStatus", (q) =>
        q.eq("userId", user._id).eq("provider", PROVIDER_GOOGLE).eq("status", ACTIVE)
      )
      .order("desc")
      .first();

    if (persistent) {
      return {
        keyId: String(persistent._id),
        mode: "persistent" as const,
        status: persistent.status,
        last4: persistent.last4,
        fingerprint: persistent.fingerprint,
        expiresAt: null,
      };
    }

    return null;
  },
});

export const gatewayIssueStepUpProof = mutation({
  args: {
    action: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    await assertGatewayRequest(user._id, "issue-stepup", args.gateway);

    const now = nowTs();
    const proofId = await ctx.db.insert("aiStepUpProofs", {
      userId: user._id,
      action: args.action,
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      createdAt: now,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "step_up_issued",
      status: "success",
      action: args.action,
      provider: PROVIDER_GOOGLE,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      createdAt: now,
      details: {
        proofId: String(proofId),
      },
    });

    return { ok: true, proofId };
  },
});

export const gatewayStoreGoogleKey = mutation({
  args: {
    mode: modeValidator,
    label: v.optional(v.string()),
    ciphertext: v.string(),
    wrappedDek: v.string(),
    kmsKeyVersion: v.string(),
    fingerprint: v.string(),
    last4: v.string(),
    metadata: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    proofToken: v.string(),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    await assertGatewayRequest(user._id, "store-key", args.gateway);
    await consumeProofToken(ctx, user._id, args.proofToken, "key:add");

    const now = nowTs();

    let keyId: Id<"aiProviderKeys"> | Id<"aiProviderKeySessions">;
    if (args.mode === "persistent") {
      keyId = await ctx.db.insert("aiProviderKeys", {
        userId: user._id,
        provider: PROVIDER_GOOGLE,
        label: args.label,
        mode: "persistent",
        status: ACTIVE,
        ciphertext: args.ciphertext,
        wrappedDek: args.wrappedDek,
        kmsKeyVersion: args.kmsKeyVersion,
        fingerprint: args.fingerprint,
        last4: args.last4,
        metadata: args.metadata,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const expiresAt = args.expiresAt ?? now + 8 * 60 * 60 * 1000;
      keyId = await ctx.db.insert("aiProviderKeySessions", {
        userId: user._id,
        provider: PROVIDER_GOOGLE,
        label: args.label,
        mode: "session",
        status: ACTIVE,
        ciphertext: args.ciphertext,
        wrappedDek: args.wrappedDek,
        kmsKeyVersion: args.kmsKeyVersion,
        fingerprint: args.fingerprint,
        last4: args.last4,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "key_add",
      status: "success",
      action: "key:add",
      provider: PROVIDER_GOOGLE,
      createdAt: now,
      details: {
        keyId: String(keyId),
        mode: args.mode,
      },
    });

    return {
      keyId: String(keyId),
      mode: args.mode,
      status: ACTIVE,
      last4: args.last4,
    };
  },
});

export const gatewayGetEncryptedGoogleKey = query({
  args: {
    mode: modeValidator,
    keyId: v.string(),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertGatewayRequest(user._id, "get-key", args.gateway);

    const key = await loadGoogleKeyRecord(ctx, user._id, args.mode, args.keyId);

    if (key.status === DELETED) {
      throw new ConvexError("AI_KEY_NOT_FOUND");
    }

    if (args.mode === "session" && key.expiresAt <= nowTs()) {
      throw new ConvexError("AI_KEY_EXPIRED");
    }

    return {
      keyId: String(key._id),
      mode: args.mode,
      status: key.status,
      ciphertext: key.ciphertext,
      wrappedDek: key.wrappedDek,
      kmsKeyVersion: key.kmsKeyVersion,
      last4: key.last4,
      fingerprint: key.fingerprint,
      expiresAt: args.mode === "session" ? key.expiresAt : null,
    };
  },
});

export const gatewayDeleteGoogleKey = mutation({
  args: {
    mode: modeValidator,
    keyId: v.string(),
    proofToken: v.string(),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    await assertGatewayRequest(user._id, "delete-key", args.gateway);
    await consumeProofToken(ctx, user._id, args.proofToken, "key:delete");

    const key = await loadGoogleKeyRecord(ctx, user._id, args.mode, args.keyId);

    await ctx.db.patch(key._id, {
      status: DELETED,
      deletedAt: nowTs(),
      updatedAt: nowTs(),
    });

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "key_delete",
      status: "success",
      action: "key:delete",
      provider: PROVIDER_GOOGLE,
      createdAt: nowTs(),
      details: {
        keyId: String(key._id),
        mode: args.mode,
      },
    });

    return { ok: true };
  },
});

export const gatewayPauseGoogleKey = mutation({
  args: {
    mode: modeValidator,
    keyId: v.string(),
    reason: v.optional(v.string()),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertGatewayRequest(user._id, "pause-key", args.gateway);

    const key = await loadGoogleKeyRecord(ctx, user._id, args.mode, args.keyId);

    await ctx.db.patch(key._id, {
      status: PAUSED,
      pauseReason: args.reason,
      updatedAt: nowTs(),
    });

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "key_pause",
      status: "success",
      action: "key:pause",
      provider: PROVIDER_GOOGLE,
      createdAt: nowTs(),
      details: {
        keyId: String(key._id),
        mode: args.mode,
        reason: args.reason,
      },
    });

    return { ok: true };
  },
});

export const gatewayResumeGoogleKey = mutation({
  args: {
    mode: modeValidator,
    keyId: v.string(),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertGatewayRequest(user._id, "resume-key", args.gateway);

    const key = await loadGoogleKeyRecord(ctx, user._id, args.mode, args.keyId);

    if (args.mode === "session" && key.expiresAt <= nowTs()) {
      throw new ConvexError("AI_KEY_EXPIRED");
    }

    await ctx.db.patch(key._id, {
      status: ACTIVE,
      pauseReason: undefined,
      updatedAt: nowTs(),
    });

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "key_resume",
      status: "success",
      action: "key:resume",
      provider: PROVIDER_GOOGLE,
      createdAt: nowTs(),
      details: {
        keyId: String(key._id),
        mode: args.mode,
      },
    });

    return { ok: true };
  },
});

export const gatewayMarkGoogleKeyTest = mutation({
  args: {
    mode: modeValidator,
    keyId: v.string(),
    proofToken: v.string(),
    ok: v.boolean(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    await assertGatewayRequest(user._id, "mark-test", args.gateway);
    await consumeProofToken(ctx, user._id, args.proofToken, "key:test");

    const key = await loadGoogleKeyRecord(ctx, user._id, args.mode, args.keyId);

    const patch: any = {
      lastTestAt: nowTs(),
      updatedAt: nowTs(),
    };

    if (args.ok && key.status === PAUSED) {
      patch.status = ACTIVE;
      patch.pauseReason = undefined;
    }

    await ctx.db.patch(key._id, patch);

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "key_test",
      status: args.ok ? "success" : "failed",
      action: "key:test",
      provider: PROVIDER_GOOGLE,
      createdAt: nowTs(),
      details: {
        keyId: String(key._id),
        mode: args.mode,
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
      },
    });

    return { ok: true };
  },
});

export const cleanupExpiredSessionKeys = mutation({
  args: {},
  handler: async (ctx) => {
    const now = nowTs();
    const candidates = await ctx.db
      .query("aiProviderKeySessions")
      .withIndex("byStatusExpiresAt", (q) => q.eq("status", ACTIVE))
      .collect();

    let expiredCount = 0;
    for (const sessionKey of candidates) {
      if (sessionKey.expiresAt <= now) {
        await ctx.db.patch(sessionKey._id, {
          status: EXPIRED,
          updatedAt: now,
        });
        expiredCount += 1;
      }
    }

    return { expiredCount };
  },
});

export const gatewayRecordFailedStepUp = mutation({
  args: {
    action: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    reason: v.optional(v.string()),
    gateway: gatewayValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertGatewayRequest(user._id, "failed-stepup", args.gateway);

    await ctx.db.insert("aiSecurityEvents", {
      userId: user._id,
      eventType: "step_up_failed",
      status: "failed",
      action: args.action,
      provider: PROVIDER_GOOGLE,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      createdAt: nowTs(),
      details: {
        reason: args.reason,
      },
    });

    return { ok: true };
  },
});

export const getStepUpProofStatus = query({
  args: {
    proofToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const tokenHash = await sha256Hex(args.proofToken);
    const record = await ctx.db
      .query("aiStepUpProofs")
      .withIndex("byTokenHash", (q: any) => q.eq("tokenHash", tokenHash))
      .first();

    if (!record || record.userId !== user._id) {
      return null;
    }

    return {
      action: record.action,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt ?? null,
    };
  },
});
