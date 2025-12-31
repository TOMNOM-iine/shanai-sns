-- =============================================
-- ミーティング機能用テーブル追加
-- Supabase SQL Editorで実行してください
-- =============================================

-- アクティブミーティング
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  room_url TEXT NOT NULL,
  host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ミーティング招待
CREATE TABLE IF NOT EXISTS public.meeting_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, invitee_id)
);

-- RLS有効化
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_invitations ENABLE ROW LEVEL SECURITY;

-- 既存ポリシー削除
DROP POLICY IF EXISTS "meetings_all" ON public.meetings;
DROP POLICY IF EXISTS "meeting_invitations_select" ON public.meeting_invitations;
DROP POLICY IF EXISTS "meeting_invitations_insert" ON public.meeting_invitations;
DROP POLICY IF EXISTS "meeting_invitations_update" ON public.meeting_invitations;

-- ポリシー作成
CREATE POLICY "meetings_all" ON public.meetings
FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "meeting_invitations_select" ON public.meeting_invitations
FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

CREATE POLICY "meeting_invitations_insert" ON public.meeting_invitations
FOR INSERT WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "meeting_invitations_update" ON public.meeting_invitations
FOR UPDATE USING (auth.uid() = invitee_id);

-- リアルタイム更新を有効化
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_invitations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT 'ミーティングテーブル作成完了!' as message;
