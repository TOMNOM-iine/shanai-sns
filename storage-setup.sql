-- =============================================
-- Supabase Storage バケット設定
-- Supabase ダッシュボード → Storage で実行
-- =============================================

-- 方法1: ダッシュボードから手動作成（推奨）
-- 1. Supabase ダッシュボードにログイン
-- 2. Storage セクションに移動
-- 3. "New Bucket" をクリック
-- 4. 以下の設定で作成:
--    - Name: files
--    - Public bucket: OFF（プライベート）
--    - File size limit: 50MB
--    - Allowed MIME types: (空欄 = すべて許可)

-- 方法2: SQL で作成（SQL Editor で実行）

-- ストレージバケット作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'files',
  'files',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "auth_users_upload" ON storage.objects;
DROP POLICY IF EXISTS "auth_users_select" ON storage.objects;
DROP POLICY IF EXISTS "owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "owner_update" ON storage.objects;

-- ストレージポリシー: 認証済みユーザーはアップロード可能
CREATE POLICY "auth_users_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'files');

-- ストレージポリシー: 認証済みユーザーは閲覧可能
CREATE POLICY "auth_users_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'files');

-- ストレージポリシー: 自分のファイルは削除可能
CREATE POLICY "owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'files' AND auth.uid()::text = (storage.foldername(name))[2]);

-- ストレージポリシー: 自分のファイルは更新可能
CREATE POLICY "owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'files' AND auth.uid()::text = (storage.foldername(name))[2]);
