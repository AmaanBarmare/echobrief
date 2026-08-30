/**
 * RFC 8414 Authorization Server Metadata. Reached through the vercel.json
 * rewrite from /.well-known/oauth-authorization-server.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorizationServerMetadata } from "../_oauth/metadata.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json(authorizationServerMetadata());
}
