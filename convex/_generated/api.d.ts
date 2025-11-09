/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as annotations from "../annotations.js";
import type * as comments from "../comments.js";
import type * as friends from "../friends.js";
import type * as maintenance from "../maintenance.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as settings from "../settings.js";
import type * as shareGroups from "../shareGroups.js";
import type * as shares from "../shares.js";
import type * as storage from "../storage.js";
import type * as users from "../users.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_imageCompression from "../utils/imageCompression.js";
import type * as utils_storage from "../utils/storage.js";
import type * as videos from "../videos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  annotations: typeof annotations;
  comments: typeof comments;
  friends: typeof friends;
  maintenance: typeof maintenance;
  notifications: typeof notifications;
  projects: typeof projects;
  settings: typeof settings;
  shareGroups: typeof shareGroups;
  shares: typeof shares;
  storage: typeof storage;
  users: typeof users;
  "utils/auth": typeof utils_auth;
  "utils/imageCompression": typeof utils_imageCompression;
  "utils/storage": typeof utils_storage;
  videos: typeof videos;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
