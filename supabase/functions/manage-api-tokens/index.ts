/**
 * Issue, list and revoke MCP personal access tokens.
 *
 * The caller's JWT identifies the user; the service role does the write, because
 * `api_tokens` deliberately has no INSERT policy. If a browser could insert, it
 * could insert a row with somebody else's user_id and mint itself a token for
 * their meetings — RLS on SELECT would not help, since the attacker already
 * knows the plaintext they chose.
 *
 * The plaintext is returned exactly once. Nothing stores it.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { generateToken } from "./token.ts";

const MAX_TOKENS_PER_USER = 10;

serve(async (req) => {
  const preflight = handleCorsPrelight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await admin
        .from("api_tokens")
        .select(
          "id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, expires_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ tokens: data ?? [] });
    }

    if (action === "create") {
      const name = String(body?.name ?? "").trim();
      if (!name || name.length > 60) {
        return json({ error: "name must be 1-60 characters" }, 400);
      }

      const { count, error: countError } = await admin
        .from("api_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_TOKENS_PER_USER) {
        return json(
          {
            error:
              `You already have ${MAX_TOKENS_PER_USER} active tokens. Revoke one first.`,
          },
          409,
        );
      }

      const { token, hash, prefix } = await generateToken();
      const { data, error } = await admin
        .from("api_tokens")
        .insert({ user_id: userId, name, token_hash: hash, token_prefix: prefix })
        .select("id, name, token_prefix, created_at")
        .single();
      if (error) throw error;

      // The one and only time the plaintext exists outside the client's memory.
      return json({ ...data, token });
    }

    if (action === "revoke") {
      const id = String(body?.id ?? "");
      if (!id) return json({ error: "id is required" }, 400);
      const { error } = await admin
        .from("api_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return json({ revoked: true });
    }

    return json({ error: "action must be create, list or revoke" }, 400);
  } catch (error) {
    console.error("[manage-api-tokens]", error);
    return json({ error: (error as Error).message }, 500);
  }
});
