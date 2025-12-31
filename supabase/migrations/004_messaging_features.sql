-- =============================================
-- Messaging features: threads, edits, pins/saves,
-- reactions for DM, archive, search, embeddings
-- =============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Channel archive
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

-- Messages: threads + edits + soft delete
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON public.messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_parent_id ON public.dm_messages(parent_id);

-- Files: updated_at
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update timestamp helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_files_updated_at ON public.files;
CREATE TRIGGER set_files_updated_at
BEFORE UPDATE ON public.files
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pins (channel-level)
CREATE TABLE IF NOT EXISTS public.channel_message_pins (
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, message_id),
  UNIQUE (message_id)
);

-- Saves (personal)
CREATE TABLE IF NOT EXISTS public.saved_channel_messages (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.saved_dm_messages (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  dm_message_id UUID REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, dm_message_id)
);

-- DM reactions (emoji)
CREATE TABLE IF NOT EXISTS public.dm_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_message_id UUID REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dm_message_id, user_id, emoji)
);

-- Search documents (hybrid search + embeddings)
CREATE TABLE IF NOT EXISTS public.search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('channel_message', 'dm_message', 'file', 'task')),
  source_id UUID NOT NULL,
  title TEXT,
  content TEXT,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  dm_id UUID REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_search_documents_embedding
  ON public.search_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_search_documents_content_trgm
  ON public.search_documents USING GIN (content gin_trgm_ops);

-- Trigram indexes for keyword search
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.messages USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dm_messages_content_trgm
  ON public.dm_messages USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_files_name_trgm
  ON public.files USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
  ON public.tasks USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_description_trgm
  ON public.tasks USING GIN (description gin_trgm_ops);

-- Realtime: new tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_message_pins;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS
ALTER TABLE public.channel_message_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_documents ENABLE ROW LEVEL SECURITY;

-- Update channel/message policies to respect privacy + archive
DROP POLICY IF EXISTS "channels_select" ON public.channels;
DROP POLICY IF EXISTS "channels_insert" ON public.channels;
DROP POLICY IF EXISTS "channels_update" ON public.channels;
DROP POLICY IF EXISTS "channels_delete" ON public.channels;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

CREATE POLICY "channels_select" ON public.channels
  FOR SELECT USING (
    NOT is_private OR
    EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "channels_insert" ON public.channels
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "channels_update" ON public.channels
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "channels_delete" ON public.channels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id AND (
        NOT c.is_private OR
        EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id
        AND c.is_archived = FALSE
        AND (
          NOT c.is_private OR
          EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id AND c.is_archived = FALSE
    )
  );

CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id AND c.is_archived = FALSE
    )
  );

-- Pins: only members can view; members can pin; owners/admins or pinner can unpin
CREATE POLICY "channel_message_pins_select" ON public.channel_message_pins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_message_pins.channel_id AND (
        NOT c.is_private OR
        EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "channel_message_pins_insert" ON public.channel_message_pins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_message_pins.channel_id AND (
        NOT c.is_private OR
        EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "channel_message_pins_delete" ON public.channel_message_pins
  FOR DELETE USING (
    pinned_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channel_message_pins.channel_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Saves: user-only
CREATE POLICY "saved_channel_messages_select" ON public.saved_channel_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_channel_messages_insert" ON public.saved_channel_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_channel_messages_delete" ON public.saved_channel_messages
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "saved_dm_messages_select" ON public.saved_dm_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_dm_messages_insert" ON public.saved_dm_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_dm_messages_delete" ON public.saved_dm_messages
  FOR DELETE USING (auth.uid() = user_id);

-- DM reactions: only DM participants
DROP POLICY IF EXISTS "dm_reactions_select" ON public.dm_reactions;
DROP POLICY IF EXISTS "dm_reactions_insert" ON public.dm_reactions;
DROP POLICY IF EXISTS "dm_reactions_delete" ON public.dm_reactions;

CREATE POLICY "dm_reactions_select" ON public.dm_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.dm_messages m
      JOIN public.direct_messages dm ON dm.id = m.dm_id
      WHERE m.id = dm_reactions.dm_message_id
        AND (dm.user1_id = auth.uid() OR dm.user2_id = auth.uid())
    )
  );

CREATE POLICY "dm_reactions_insert" ON public.dm_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1
      FROM public.dm_messages m
      JOIN public.direct_messages dm ON dm.id = m.dm_id
      WHERE m.id = dm_reactions.dm_message_id
        AND (dm.user1_id = auth.uid() OR dm.user2_id = auth.uid())
    )
  );

CREATE POLICY "dm_reactions_delete" ON public.dm_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Search documents: visibility matches source
CREATE POLICY "search_documents_select" ON public.search_documents
  FOR SELECT USING (
    CASE
      WHEN source_type = 'channel_message' THEN EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = search_documents.channel_id AND (
          NOT c.is_private OR
          EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
          )
        )
      )
      WHEN source_type = 'dm_message' THEN EXISTS (
        SELECT 1 FROM public.direct_messages dm
        WHERE dm.id = search_documents.dm_id
          AND (dm.user1_id = auth.uid() OR dm.user2_id = auth.uid())
      )
      WHEN source_type = 'file' THEN auth.role() = 'authenticated'
      WHEN source_type = 'task' THEN auth.role() = 'authenticated'
      ELSE FALSE
    END
  );

CREATE POLICY "search_documents_insert" ON public.search_documents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "search_documents_update" ON public.search_documents
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "search_documents_delete" ON public.search_documents
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grants
GRANT ALL ON public.channel_message_pins TO authenticated;
GRANT ALL ON public.saved_channel_messages TO authenticated;
GRANT ALL ON public.saved_dm_messages TO authenticated;
GRANT ALL ON public.dm_reactions TO authenticated;
GRANT ALL ON public.search_documents TO authenticated;

-- Vector similarity function (RLS applies)
CREATE OR REPLACE FUNCTION public.match_search_documents(
  query_embedding VECTOR(1536),
  match_count INT
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id UUID,
  title TEXT,
  content TEXT,
  channel_id UUID,
  dm_id UUID,
  user_id UUID,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    id,
    source_type,
    source_id,
    title,
    content,
    channel_id,
    dm_id,
    user_id,
    metadata,
    1 - (embedding <-> query_embedding) AS similarity
  FROM public.search_documents
  WHERE embedding IS NOT NULL
  ORDER BY embedding <-> query_embedding
  LIMIT match_count;
$$;
