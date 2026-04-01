import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')
const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const { meeting_url, bot_name, language } = await req.json()

  const response = await fetch(`${RECALL_BASE_URL}/bot/`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${RECALL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meeting_url,
      bot_name,
      language,
      webhook_url: 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/recall-webhook'
    })
  })

  const data = await response.json()
  
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
