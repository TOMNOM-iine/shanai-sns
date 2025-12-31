-- Add department field to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;

-- Create table for tracking last read message in channels
CREATE TABLE IF NOT EXISTS public.channel_reads (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

-- Create table for tracking last read message in DMs
CREATE TABLE IF NOT EXISTS public.dm_reads (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  dm_id UUID REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, dm_id)
);

-- Enable RLS
ALTER TABLE public.channel_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_reads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for re-runs
DROP POLICY IF EXISTS "channel_reads_select" ON public.channel_reads;
DROP POLICY IF EXISTS "channel_reads_insert" ON public.channel_reads;
DROP POLICY IF EXISTS "channel_reads_update" ON public.channel_reads;
DROP POLICY IF EXISTS "channel_reads_delete" ON public.channel_reads;
DROP POLICY IF EXISTS "dm_reads_select" ON public.dm_reads;
DROP POLICY IF EXISTS "dm_reads_insert" ON public.dm_reads;
DROP POLICY IF EXISTS "dm_reads_update" ON public.dm_reads;
DROP POLICY IF EXISTS "dm_reads_delete" ON public.dm_reads;

-- RLS Policies for channel_reads
CREATE POLICY "channel_reads_select" ON public.channel_reads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "channel_reads_insert" ON public.channel_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "channel_reads_update" ON public.channel_reads
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "channel_reads_delete" ON public.channel_reads
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for dm_reads
CREATE POLICY "dm_reads_select" ON public.dm_reads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "dm_reads_insert" ON public.dm_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dm_reads_update" ON public.dm_reads
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "dm_reads_delete" ON public.dm_reads
  FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.channel_reads TO authenticated;
GRANT ALL ON public.dm_reads TO authenticated;
