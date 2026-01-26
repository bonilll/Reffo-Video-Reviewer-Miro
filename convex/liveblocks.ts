"use node";

import { ConvexError, v } from "convex/values";
import { Liveblocks } from "@liveblocks/node";
import { action } from "./_generated/server";

const LIVEBLOCKS_SECRET_KEY = process.env.LIVEBLOCKS_SECRET_KEY;

let liveblocks: Liveblocks | null = null;

const getLiveblocks = () => {
  if (!LIVEBLOCKS_SECRET_KEY) {
    return null;
  }
  if (!liveblocks) {
    liveblocks = new Liveblocks({ secret: LIVEBLOCKS_SECRET_KEY });
  }
  return liveblocks;
};

export const authorize = action({
  args: {
    room: v.string(),
    user: v.object({
      id: v.string(),
      name: v.optional(v.string()),
      picture: v.optional(v.string()),
    }),
  },
  handler: async (_ctx, args) => {
    const client = getLiveblocks();
    if (!client) {
      throw new ConvexError("LIVEBLOCKS_SECRET_KEY_MISSING");
    }

    const session = client.prepareSession(args.user.id, {
      userInfo: {
        name: args.user.name ?? "User",
        picture: args.user.picture ?? undefined,
      },
    });
    session.allow(args.room, session.FULL_ACCESS);

    const { status, body } = await session.authorize();
    return { status, body };
  },
});
