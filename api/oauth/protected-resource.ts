/**
 * RFC 9728 Protected Resource Metadata. Reached through the vercel.json rewrite
 * from /.well-known/oauth-protected-resource (and the path-suffixed form that
 * clients probe first for a resource with a path).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { protectedResourceMetadata } from "../_oauth/metadata.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json(protectedResourceMetadata());
}
