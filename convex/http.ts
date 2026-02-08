import { httpRouter } from "convex/server";
import { liveblocksAuth } from "./http/liveblocksAuth";
import {
  initMultipartUpload,
  signMultipartUploadPart,
  completeMultipartUploadRequest,
  abortMultipartUploadRequest,
} from "./http/uploadMultipart";
import { deleteMediaByPublicUrl } from "./http/deleteMedia";
import {
  claimJob as claimLibraryJob,
  heartbeat as heartbeatLibraryJob,
  complete as completeLibraryJob,
  fail as failLibraryJob,
} from "./http/libraryWorker";

const http = httpRouter();

http.route({
  path: "/api/liveblocks-auth",
  method: "POST",
  handler: liveblocksAuth,
});

http.route({
  path: "/api/liveblocks-auth",
  method: "OPTIONS",
  handler: liveblocksAuth,
});

http.route({
  path: "/api/upload/multipart/init",
  method: "POST",
  handler: initMultipartUpload,
});

http.route({
  path: "/api/upload/multipart/init",
  method: "OPTIONS",
  handler: initMultipartUpload,
});

http.route({
  path: "/api/upload/multipart/sign-part",
  method: "POST",
  handler: signMultipartUploadPart,
});

http.route({
  path: "/api/upload/multipart/sign-part",
  method: "OPTIONS",
  handler: signMultipartUploadPart,
});

http.route({
  path: "/api/upload/multipart/complete",
  method: "POST",
  handler: completeMultipartUploadRequest,
});

http.route({
  path: "/api/upload/multipart/complete",
  method: "OPTIONS",
  handler: completeMultipartUploadRequest,
});

http.route({
  path: "/api/upload/multipart/abort",
  method: "POST",
  handler: abortMultipartUploadRequest,
});

http.route({
  path: "/api/upload/multipart/abort",
  method: "OPTIONS",
  handler: abortMultipartUploadRequest,
});

http.route({
  path: "/api/delete-media",
  method: "POST",
  handler: deleteMediaByPublicUrl,
});

http.route({
  path: "/api/delete-media",
  method: "OPTIONS",
  handler: deleteMediaByPublicUrl,
});

http.route({
  path: "/api/library-worker/claim",
  method: "POST",
  handler: claimLibraryJob,
});

http.route({
  path: "/api/library-worker/claim",
  method: "OPTIONS",
  handler: claimLibraryJob,
});

http.route({
  path: "/api/library-worker/heartbeat",
  method: "POST",
  handler: heartbeatLibraryJob,
});

http.route({
  path: "/api/library-worker/heartbeat",
  method: "OPTIONS",
  handler: heartbeatLibraryJob,
});

http.route({
  path: "/api/library-worker/complete",
  method: "POST",
  handler: completeLibraryJob,
});

http.route({
  path: "/api/library-worker/complete",
  method: "OPTIONS",
  handler: completeLibraryJob,
});

http.route({
  path: "/api/library-worker/fail",
  method: "POST",
  handler: failLibraryJob,
});

http.route({
  path: "/api/library-worker/fail",
  method: "OPTIONS",
  handler: failLibraryJob,
});

export default http;
