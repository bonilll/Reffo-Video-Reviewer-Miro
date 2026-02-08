import { createClient, LiveList, LiveMap, LiveObject } from "@liveblocks/client";
import { createRoomContext, createLiveblocksContext } from "@liveblocks/react";

import type { Layer, Color, CameraState } from "@/types/canvas";

const getConvexAuthToken = async () => {
  if (typeof window === "undefined") return null;
  const clerk = (window as any).Clerk;
  const session = clerk?.session;
  if (!session?.getToken) return null;
  return await session.getToken({ template: "convex" });
};

const getAuthEndpointUrl = () => {
  const env = import.meta.env;
  // Production: prefer same-origin auth (Vercel `/api/*`) to avoid depending on
  // Convex HTTP actions routing (3211 / `.convex.site`) which is often not
  // exposed in self-hosted setups behind reverse proxies.
  if (env.VITE_LIVEBLOCKS_AUTH_URL) {
    return env.VITE_LIVEBLOCKS_AUTH_URL;
  }
  if (env.PROD) {
    return "/api/liveblocks-auth";
  }
  const rawBase =
    env.VITE_CONVEX_HTTP_URL ||
    env.VITE_CONVEX_SELF_HOSTED_URL ||
    env.VITE_CONVEX_URL;
  if (!rawBase) {
    return "/api/liveblocks-auth";
  }
  const base = rawBase.includes(".convex.cloud")
    ? rawBase.replace(".convex.cloud", ".convex.site")
    : rawBase;
  return `${base}/api/liveblocks-auth`;
};

// Configurazione client semplificata per evitare errori di lint
const client = createClient({
  throttle: 16,
  authEndpoint: async (room) => {
    const token = await getConvexAuthToken();
    if (!token) {
      throw new Error(
        "Missing Clerk token for Convex. Check CLERK_JWT_TEMPLATE=convex and Clerk template configuration."
      );
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    headers.Authorization = `Bearer ${token}`;
    const response = await fetch(getAuthEndpointUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ room }),
    });
    if (!response.ok) {
      const message = await response.text();
      const statusLine = `Liveblocks auth failed (${response.status})`;
      throw new Error(message ? `${statusLine}: ${message}` : statusLine);
    }
    return await response.json();
  },
  async resolveUsers({ userIds }) {
    return [];
  },
  async resolveMentionSuggestions({ text }) {
    return [];
  },
  async resolveRoomsInfo({ roomIds }) {
    return [];
  },
});

// Presenza utente nella stanza
type Presence = {
  cursor: { x: number; y: number } | null;
  selection: string[];
  pencilDraft: [x: number, y: number, pressure: number][] | null;
  penColor: Color | null;
  profile?: { name?: string; picture?: string } | null;
};

// Storage persistente nella stanza
type Storage = {
  layers: LiveMap<string, LiveObject<Layer>>;
  layerIds: LiveList<string>;
  cameraPositions: LiveMap<string, LiveObject<CameraState>>;
};

// Metadati utente
type UserMeta = {
  id?: string;
  info?: {
    name?: string;
    picture?: string;
  };
};

// Eventi room
type RoomEvent = {
  // type: "NOTIFICATION",
  // ...
};

// Metadati thread
type ThreadMetadata = {
  [key: string]: string | number | boolean | undefined;
};

// Room-level hooks
export const {
  suspense: {
    RoomProvider,
    useRoom,
    useMyPresence,
    useUpdateMyPresence,
    useSelf,
    useOthers,
    useOthersMapped,
    useOthersConnectionIds,
    useOther,
    useBroadcastEvent,
    useEventListener,
    useErrorListener,
    useStorage,
    useObject,
    useMap,
    useList,
    useBatch,
    useHistory,
    useUndo,
    useRedo,
    useCanUndo,
    useCanRedo,
    useStatus,
    useLostConnectionListener,
    useMutation,

    useThreads,
    useCreateThread,
    useEditThreadMetadata,
    useCreateComment,
    useEditComment,
    useDeleteComment,
    useAddReaction,
    useRemoveReaction,

    // useUser,
    // useRoomInfo,
  },
} = createRoomContext<Presence, Storage, UserMeta, RoomEvent, ThreadMetadata>(client);

// Project-level hooks
export const {
  suspense: {
    LiveblocksProvider,
    useMarkInboxNotificationAsRead,
    useMarkAllInboxNotificationsAsRead,
    useInboxNotifications,
    useUnreadInboxNotificationsCount,

    useUser,
    useRoomInfo,
  },
} = createLiveblocksContext<UserMeta, ThreadMetadata>(client);
