import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";

const buildCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Reffo-Guest-Id",
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

  const isSubnetworkRoom = room.startsWith("subnetwork:");
  const subnetworkId = isSubnetworkRoom ? room.slice("subnetwork:".length) : null;

  let permissions: { canRead: boolean; canWrite: boolean; resourceExists: boolean } | null = null;
  if (isSubnetworkRoom) {
    try {
      permissions = await ctx.runQuery(api.aiSubnetworks.getSubnetworkPermissions, {
        subnetworkId: subnetworkId as Id<"aiSubnetworks">,
      });
    } catch {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          details: "Invalid subnetwork id",
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
  } else {
    try {
      permissions = await ctx.runQuery(api.boards.getBoardPermissions, {
        boardId: room as Id<"boards">,
      });
    } catch {
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
  }

  if (!permissions?.resourceExists) {
    return new Response(
      JSON.stringify({
        error: "Not Found",
        details: isSubnetworkRoom ? "Subnetwork not found" : "Board not found",
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
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        details: isSubnetworkRoom ? "Editors only" : "Access denied",
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

  const identity = await ctx.auth.getUserIdentity();
  const guestHeader = request.headers.get("x-reffo-guest-id");
  const generatedGuestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  const guestId =
    guestHeader && /^[a-zA-Z0-9_-]{6,80}$/.test(guestHeader.trim())
      ? guestHeader.trim()
      : generatedGuestId;

  try {
    let userId = `public-${guestId}`;
    let userName = "Guest";
    let picture: string | undefined;

    if (identity) {
      const currentUser = await ctx.runQuery(api.users.current, {});
      userId = identity.subject;
      userName =
        currentUser?.name ??
        identity.name ??
        identity.nickname ??
        identity.preferredUsername ??
        identity.email ??
        "User";
      picture = currentUser?.avatar ?? identity.pictureUrl ?? undefined;
    }

    const { status, body } = await ctx.runAction(api.liveblocks.authorize, {
      room,
      canWrite: permissions.canWrite,
      user: {
        id: userId,
        name: userName,
        picture,
      },
    });

    return new Response(body, {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
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
