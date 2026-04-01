import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')

serve(async (req) => {
  const payload = await req.json()
  
  if (payload.event === 'bot.status_change' && payload.status === 'done') {
    const botId = payload.bot_id
    
    // Fetch transcript from Recall
    const response = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/transcript/`, {
      headers: {
        'Authorization': `Token ${RECALL_API_KEY}`
      }
    })
    
    const transcript = await response.json()
    
    // Insert into transcripts (assuming table exists)
    await supabaseClient
      .from('transcripts')
      .insert({
        bot_id: botId,
        content: transcript.text,
      })
  }

  return new Response('ok')
})
