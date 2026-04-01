import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts"

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')
const RECALL_BASE_URL = 'https://ap-northeast-1.recall.ai/api/v1'
const WEBHOOK_URL = 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/recall-webhook'

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCorsPrelight(req)
  if (corsResponse) return corsResponse
  
  const origin = req.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  try {
    if (!RECALL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Recall API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { meeting_url, bot_name, language } = await req.json()

    if (!meeting_url) {
      return new Response(
        JSON.stringify({ error: "meeting_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log("Starting bot for meeting:", meeting_url)

    const response = await fetch(`${RECALL_BASE_URL}/bot/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${RECALL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url,
        bot_name: bot_name || "EchoBrief Notetaker",
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error("Recall API error:", data)
      return new Response(
        JSON.stringify({ error: data.detail || data.error || "Failed to start bot", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log("Bot started successfully:", data.id)
    
    return new Response(
      JSON.stringify({ success: true, bot_id: data.id, status: data.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("start-bot error:", error)
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
