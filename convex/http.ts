import { httpRouter } from "convex/server";
import { liveblocksAuth } from "./http/liveblocksAuth";
import {
  initMultipartUpload,
  signMultipartUploadPart,
  completeMultipartUploadRequest,
  abortMultipartUploadRequest,
} from "./http/uploadMultipart";

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

export default http;
