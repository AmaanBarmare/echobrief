-- Ask: persisted conversations.
--
-- Until now a chat lived in React state and died on reload, which is why the
-- Console mockup's "Recent conversations" rail had nothing to list. Two tables,
-- both scoped to their owner: a conversation is a title and a timestamp, and a
-- message is one turn with the citations that were shown with it.
--
-- Citations are stored as written at answer time rather than re-derived on
-- read: a meeting can be deleted or its insights regenerated, and the thread
-- should still show what the user was actually told.

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversations_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  -- [{meeting_id, title, date, quote?, ts?}] exactly as it was rendered.
  citations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  truncated       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The rail reads newest-first per user; a thread reads oldest-first.
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated
  ON public.chat_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages (conversation_id, created_at);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Chat is the one feature where a scoping bug leaks another user's private
-- meeting content, so every policy is the plain auth.uid() = user_id form.
DROP POLICY IF EXISTS "own conversations select" ON public.chat_conversations;
CREATE POLICY "own conversations select" ON public.chat_conversations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own conversations insert" ON public.chat_conversations;
CREATE POLICY "own conversations insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own conversations update" ON public.chat_conversations;
CREATE POLICY "own conversations update" ON public.chat_conversations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own conversations delete" ON public.chat_conversations;
CREATE POLICY "own conversations delete" ON public.chat_conversations
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own messages select" ON public.chat_messages;
CREATE POLICY "own messages select" ON public.chat_messages
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own messages insert" ON public.chat_messages;
CREATE POLICY "own messages insert" ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own messages delete" ON public.chat_messages;
CREATE POLICY "own messages delete" ON public.chat_messages
  FOR DELETE USING (auth.uid() = user_id);
