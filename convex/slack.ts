"use node";

import { action, internalAction } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { randomBytes } from 'node:crypto';

const env = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new ConvexError(`Missing environment variable ${key}`);
  }
  return value;
};

const SLACK_CLIENT_ID = () => env("SLACK_CLIENT_ID");
const SLACK_CLIENT_SECRET = () => env("SLACK_CLIENT_SECRET");
// Public site base URL used to build deep links inside Slack messages
const PUBLIC_SITE_URL = () => env("PUBLIC_SITE_URL");

const DEFAULT_SCOPES = [
  "chat:write",
  "im:write",
  "users:read",
  "users:read.email",
].join(",");

export const status = action({
  args: {},
  async handler(ctx, _args): Promise<any> {
    return await ctx.runQuery(api.slackData.status, {}) as any;
  },
});

export const getAuthUrl = action({
  args: {
    redirectUri: v.optional(v.string()),
  },
  async handler(ctx, { redirectUri }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }
    const userId = await ctx.runMutation("users:ensure" as any, {});
    let baseRedirect = redirectUri ?? process.env.SLACK_REDIRECT_URI ?? `${PUBLIC_SITE_URL()}/profile`;
    if (!/([?&])source=slack/.test(baseRedirect)) {
      baseRedirect += (baseRedirect.includes('?') ? '&' : '?') + 'source=slack';
    }
    // Create and persist CSRF state
    const nonce = randomBytes(16).toString('hex');
    await ctx.runMutation(internal.slackData.createOauthState, { provider: 'slack', userId: userId as Id<'users'>, nonce });
    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID(),
      scope: DEFAULT_SCOPES,
      redirect_uri: baseRedirect,
      state: nonce,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  },
});

export const exchangeCode = action({
  args: {
    code: v.string(),
    redirectUri: v.optional(v.string()),
    state: v.optional(v.string()),
  },
  async handler(ctx, { code, redirectUri, state }) {
    // Validate state if present (preferred for public distribution)
    let targetUserId: Id<'users'> | null = null;
    if (state) {
      const consumed = await ctx.runMutation(internal.slackData.consumeOauthState, { provider: 'slack', nonce: state });
      if (consumed?.userId) targetUserId = consumed.userId as Id<'users'>;
      if (!targetUserId) throw new ConvexError('INVALID_OAUTH_STATE');
    } else {
      // Fallback to current identity (still require auth in this flow)
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new ConvexError('NOT_AUTHENTICATED');
      let userDoc = await ctx.runQuery(api.users.current, {});
      if (!userDoc?._id) {
        await ctx.runMutation(api.users.ensure, {});
        userDoc = await ctx.runQuery(api.users.current, {});
      }
      if (!userDoc?._id) throw new ConvexError('NOT_PROVISIONED');
      targetUserId = userDoc._id as Id<'users'>;
    }

    let baseRedirect = redirectUri ?? process.env.SLACK_REDIRECT_URI ?? `${PUBLIC_SITE_URL()}/profile`;
    if (!/([?&])source=slack/.test(baseRedirect)) {
      baseRedirect += (baseRedirect.includes('?') ? '&' : '?') + 'source=slack';
    }

    const body = new URLSearchParams({
      code,
      client_id: SLACK_CLIENT_ID(),
      client_secret: SLACK_CLIENT_SECRET(),
      redirect_uri: baseRedirect,
    });
    const resp = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await resp.json() as any;
    if (!data?.ok) {
      throw new ConvexError(`Slack OAuth failed: ${data?.error ?? "unknown_error"}`);
    }
    const accessToken: string = data.access_token;
    const team = data.team;
    const authedUser = data.authed_user;
    const botUserId: string = data.bot_user_id ?? "";

    if (!accessToken || !team?.id || !authedUser?.id) {
      throw new ConvexError("Slack OAuth response missing fields");
    }

    await ctx.runMutation(internal.slackData.upsertConnection, {
      userId: targetUserId!,
      teamId: team.id,
      teamName: team.name ?? team.id,
      botUserId: botUserId || "bot",
      slackUserId: authedUser.id,
      accessToken,
    });
    return { ok: true, teamId: team.id, teamName: team.name ?? team.id };
  },
});

export const disconnect = action({
  args: { teamId: v.optional(v.string()) },
  async handler(ctx, args) {
    const current = await ctx.runQuery(api.users.current, {});
    if (!current?._id) return;
    await ctx.runMutation(internal.slackData.deleteForUser, { userId: current._id as Id<"users">, teamId: args.teamId });
  },
});

export const testDm = action({
  args: {},
  async handler(ctx) {
    const current = await ctx.runQuery(api.users.current, {});
    if (!current?._id) throw new ConvexError("NOT_AUTHENTICATED");
    const secrets = await ctx.runMutation(internal.slackData.getConnectionSecrets, { userId: current._id as Id<"users"> }) as any[];
    if (!secrets?.length) throw new ConvexError("SLACK_NOT_CONNECTED");
    const base = PUBLIC_SITE_URL().replace(/\/$/, "");
    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: "*Connected to Reffo*" } },
      { type: "section", text: { type: "mrkdwn", text: `You will receive DMs when someone mentions you in comments.\nOpen <${base}/dashboard|Dashboard>` } },
    ];
    for (const s of secrets) {
      await sendDm(s.accessToken, s.slackUserId, { text: "Connected to Reffo", blocks });
    }
    return { ok: true };
  },
});

export const notifyMention = internalAction({
  args: {
    toUserId: v.id("users"),
    videoId: v.id("videos"),
    commentId: v.id("comments"),
  },
  async handler(ctx, { toUserId, videoId, commentId }) {
    const payload = await ctx.runQuery(api.slackData.buildMentionPayload, { toUserId, videoId, commentId });
    if (!payload || !payload.connections?.length) return;
    const base = PUBLIC_SITE_URL().replace(/\/$/, "");
    const reviewUrlBase = `${base}/review/${videoId}?comment=${commentId}`;
    const reviewUrl = typeof payload.comment.frame === "number" ? `${reviewUrlBase}&frame=${payload.comment.frame}` : reviewUrlBase;
    const projectUrl = payload.video.projectId ? `${base}/project/${payload.video.projectId}` : null;

    const authorName = payload.author.name;
    const reviewTitle = payload.video.title;
    const projectName = payload.project?.name;

    const header = `*@${authorName}* mentioned you on *Reffo*`;
    const contextLine = projectUrl
      ? `Review: <${reviewUrl}|${reviewTitle}> · Project: <${projectUrl}|${projectName}>`
      : `Review: <${reviewUrl}|${reviewTitle}>`;

    const blocks: any[] = [
      { type: "section", text: { type: "mrkdwn", text: header } },
      { type: "section", text: { type: "mrkdwn", text: contextLine } },
      { type: "section", text: { type: "mrkdwn", text: payload.comment.text } },
    ];
    if (typeof payload.comment.frame === "number") {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Frame ${payload.comment.frame}` }] });
    }

    for (const c of payload.connections) {
      await sendDm(c.accessToken, c.slackUserId, {
        text: "Reffo mention",
        blocks,
      });
    }
  },
});

async function sendDm(accessToken: string, slackUserId: string, payload: { text: string; blocks?: any[] }) {
  // Open or get IM channel with the user
  const channel = await withRetry(async () => {
    const openResp = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ users: slackUserId }),
    });
    const openData = await openResp.json() as any;
    if (!openData?.ok || !openData?.channel?.id) {
      throw new Error(`Slack conversations.open failed: ${openData?.error ?? "unknown_error"}`);
    }
    return openData.channel.id as string;
  });

  // Post message
  await withRetry(async () => {
    const postResp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ channel, text: payload.text, blocks: payload.blocks }),
    });
    const postData = await postResp.json() as any;
    if (!postData?.ok) {
      throw new Error(`Slack chat.postMessage failed: ${postData?.error ?? "unknown_error"}`);
    }
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 400): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Slack request failed");
}
