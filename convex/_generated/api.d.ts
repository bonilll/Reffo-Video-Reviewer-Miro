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
import type * as assetJobs from "../assetJobs.js";
import type * as assets from "../assets.js";
import type * as board from "../board.js";
import type * as boards from "../boards.js";
import type * as comments from "../comments.js";
import type * as compliance from "../compliance.js";
import type * as edits from "../edits.js";
import type * as friends from "../friends.js";
import type * as http_liveblocksAuth from "../http/liveblocksAuth.js";
import type * as http_uploadMultipart from "../http/uploadMultipart.js";
import type * as http from "../http.js";
import type * as liveblocks from "../liveblocks.js";
import type * as maintenance from "../maintenance.js";
import type * as media from "../media.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as render from "../render.js";
import type * as review from "../review.js";
import type * as settings from "../settings.js";
import type * as shareGroups from "../shareGroups.js";
import type * as shares from "../shares.js";
import type * as slack from "../slack.js";
import type * as slackData from "../slackData.js";
import type * as storage from "../storage.js";
import type * as todoItems from "../todoItems.js";
import type * as todoLists from "../todoLists.js";
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
  assetJobs: typeof assetJobs;
  assets: typeof assets;
  board: typeof board;
  boards: typeof boards;
  comments: typeof comments;
  compliance: typeof compliance;
  edits: typeof edits;
  friends: typeof friends;
  "http/liveblocksAuth": typeof http_liveblocksAuth;
  "http/uploadMultipart": typeof http_uploadMultipart;
  http: typeof http;
  liveblocks: typeof liveblocks;
  maintenance: typeof maintenance;
  media: typeof media;
  notifications: typeof notifications;
  projects: typeof projects;
  render: typeof render;
  review: typeof review;
  settings: typeof settings;
  shareGroups: typeof shareGroups;
  shares: typeof shares;
  slack: typeof slack;
  slackData: typeof slackData;
  storage: typeof storage;
  todoItems: typeof todoItems;
  todoLists: typeof todoLists;
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
