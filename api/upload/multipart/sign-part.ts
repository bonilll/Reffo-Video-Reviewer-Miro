import type { IncomingMessage, ServerResponse } from "node:http";
import { proxyMultipart } from "./_proxy";

export const config = {
  runtime: "nodejs",
};

export default function handler(req: IncomingMessage & any, res: ServerResponse & any) {
  return proxyMultipart(req, res, "/api/upload/multipart/sign-part");
}
