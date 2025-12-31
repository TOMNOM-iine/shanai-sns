-- =============================================
-- 社内SNS用スキーマ（snsスキーマで分離）
-- =============================================

-- snsスキーマを作成
CREATE SCHEMA IF NOT EXISTS sns;

-- プロフィールテーブル
CREATE TABLE sns.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- チャンネルテーブル
CREATE TABLE sns.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES sns.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- チャンネルメンバーテーブル
CREATE TABLE sns.channel_members (
  channel_id UUID REFERENCES sns.channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sns.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

-- ダイレクトメッセージテーブル
CREATE TABLE sns.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID REFERENCES sns.profiles(id) ON DELETE CASCADE,
  user2_id UUID REFERENCES sns.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user1_id, user2_id)
);

-- メッセージテーブル
CREATE TABLE sns.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES sns.channels(id) ON DELETE CASCADE,
  dm_id UUID REFERENCES sns.direct_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sns.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (channel_id IS NOT NULL AND dm_id IS NULL) OR
    (channel_id IS NULL AND dm_id IS NOT NULL)
  )
);

-- リアクションテーブル
CREATE TABLE sns.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES sns.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sns.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

-- イベントテーブル（カレンダー）
CREATE TABLE sns.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  channel_id UUID REFERENCES sns.channels(id) ON DELETE SET NULL,
  created_by UUID REFERENCES sns.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- タスクテーブル
CREATE TABLE sns.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assignee_id UUID REFERENCES sns.profiles(id) ON DELETE SET NULL,
  due_date DATE,
  channel_id UUID REFERENCES sns.channels(id) ON DELETE SET NULL,
  created_by UUID REFERENCES sns.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ファイルテーブル
CREATE TABLE sns.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  channel_id UUID REFERENCES sns.channels(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES sns.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_sns_messages_channel_id ON sns.messages(channel_id);
CREATE INDEX idx_sns_messages_dm_id ON sns.messages(dm_id);
CREATE INDEX idx_sns_messages_created_at ON sns.messages(created_at DESC);
CREATE INDEX idx_sns_channel_members_user_id ON sns.channel_members(user_id);
CREATE INDEX idx_sns_tasks_assignee_id ON sns.tasks(assignee_id);
CREATE INDEX idx_sns_tasks_channel_id ON sns.tasks(channel_id);
CREATE INDEX idx_sns_events_start_time ON sns.events(start_time);

-- Row Level Security (RLS)
ALTER TABLE sns.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns.files ENABLE ROW LEVEL SECURITY;

-- プロフィールポリシー
CREATE POLICY "sns_profiles_select" ON sns.profiles
  FOR SELECT USING (true);

CREATE POLICY "sns_profiles_update" ON sns.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "sns_profiles_insert" ON sns.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- チャンネルポリシー
CREATE POLICY "sns_channels_select" ON sns.channels
  FOR SELECT USING (
    NOT is_private OR
    EXISTS (
      SELECT 1 FROM sns.channel_members
      WHERE channel_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "sns_channels_insert" ON sns.channels
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sns_channels_update" ON sns.channels
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sns.channel_members
      WHERE channel_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  );

-- チャンネルメンバーポリシー
CREATE POLICY "sns_channel_members_select" ON sns.channel_members
  FOR SELECT USING (true);

CREATE POLICY "sns_channel_members_insert" ON sns.channel_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sns_channel_members_delete" ON sns.channel_members
  FOR DELETE USING (user_id = auth.uid());

-- DMポリシー
CREATE POLICY "sns_dm_select" ON sns.direct_messages
  FOR SELECT USING (user1_id = auth.uid() OR user2_id = auth.uid());

CREATE POLICY "sns_dm_insert" ON sns.direct_messages
  FOR INSERT WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid());

-- メッセージポリシー
CREATE POLICY "sns_messages_select" ON sns.messages
  FOR SELECT USING (
    (channel_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM sns.channel_members WHERE channel_id = sns.messages.channel_id AND user_id = auth.uid()
    )) OR
    (dm_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM sns.direct_messages WHERE id = sns.messages.dm_id AND (user1_id = auth.uid() OR user2_id = auth.uid())
    ))
  );

CREATE POLICY "sns_messages_insert" ON sns.messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sns_messages_update" ON sns.messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "sns_messages_delete" ON sns.messages
  FOR DELETE USING (auth.uid() = user_id);

-- リアクションポリシー
CREATE POLICY "sns_reactions_select" ON sns.reactions
  FOR SELECT USING (true);

CREATE POLICY "sns_reactions_insert" ON sns.reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sns_reactions_delete" ON sns.reactions
  FOR DELETE USING (auth.uid() = user_id);

-- イベントポリシー
CREATE POLICY "sns_events_select" ON sns.events
  FOR SELECT USING (true);

CREATE POLICY "sns_events_insert" ON sns.events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sns_events_update" ON sns.events
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "sns_events_delete" ON sns.events
  FOR DELETE USING (auth.uid() = created_by);

-- タスクポリシー
CREATE POLICY "sns_tasks_select" ON sns.tasks
  FOR SELECT USING (true);

CREATE POLICY "sns_tasks_insert" ON sns.tasks
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sns_tasks_update" ON sns.tasks
  FOR UPDATE USING (auth.uid() = created_by OR auth.uid() = assignee_id);

CREATE POLICY "sns_tasks_delete" ON sns.tasks
  FOR DELETE USING (auth.uid() = created_by);

-- ファイルポリシー
CREATE POLICY "sns_files_select" ON sns.files
  FOR SELECT USING (true);

CREATE POLICY "sns_files_insert" ON sns.files
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sns_files_delete" ON sns.files
  FOR DELETE USING (auth.uid() = uploaded_by);

-- リアルタイムを有効化（snsスキーマのテーブル）
ALTER PUBLICATION supabase_realtime ADD TABLE sns.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE sns.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE sns.channel_members;

-- 新規ユーザー登録時にプロフィール自動作成
CREATE OR REPLACE FUNCTION sns.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sns.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 既存トリガーがあれば削除してから作成
DROP TRIGGER IF EXISTS on_sns_user_created ON auth.users;
CREATE TRIGGER on_sns_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sns.handle_new_user();

-- デフォルトの一般チャンネルを作成
INSERT INTO sns.channels (name, description, is_private)
VALUES ('general', 'みんなの雑談チャンネル', false);
