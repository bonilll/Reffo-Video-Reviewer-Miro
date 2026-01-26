import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";

const buildCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export const liveblocksAuth = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let payload: { room?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        details: "Invalid JSON body",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const room = typeof payload?.room === "string" ? payload.room : null;
  if (!room) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        details: "Missing room parameter",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    console.log("liveblocks-auth: missing identity");
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        details: "Authentication required",
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  let permissions: { canRead: boolean; resourceExists: boolean } | null = null;
  try {
    permissions = await ctx.runQuery(api.boards.getBoardPermissions, {
      boardId: room as Id<"boards">,
    });
  } catch (error) {
    console.log("liveblocks-auth: invalid board id", room);
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        details: "Invalid board id",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  if (!permissions?.resourceExists) {
    console.log("liveblocks-auth: board not found", room);
    return new Response(
      JSON.stringify({
        error: "Not Found",
        details: "Board not found",
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  if (!permissions.canRead) {
    console.log("liveblocks-auth: access denied", room, identity.subject);
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        details: "Access denied",
      }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const userName =
    identity.name ??
    identity.nickname ??
    identity.preferredUsername ??
    identity.email ??
    "User";

  try {
    const { status, body } = await ctx.runAction(api.liveblocks.authorize, {
      room,
      user: {
        id: identity.subject,
        name: userName,
        picture: identity.pictureUrl ?? undefined,
      },
    });

    console.log("liveblocks-auth: session authorized", room, identity.subject);
    return new Response(body, {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.log("liveblocks-auth: authorize failed", error);
    return new Response(
      JSON.stringify({
        error: "Liveblocks authorization failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
