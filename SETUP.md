# 社内SNS セットアップガイド

## 概要
アンダーテイル風デザインの社内コミュニケーションツールです。

### 機能
- チャンネル別チャット（リアルタイム）
- ダイレクトメッセージ
- 共有カレンダー
- タスク管理（カンバン形式）
- ファイルストレージ
- AIチャットアシスタント

---

## 1. Supabaseプロジェクトの設定

### 1.1 プロジェクト作成
1. [Supabase](https://supabase.com) にログイン
2. 「New Project」をクリック
3. プロジェクト名を入力して作成

### 1.2 環境変数の取得
1. Project Settings → API
2. 以下の値をコピー:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 1.3 データベーステーブル作成（publicスキーマ）
1. SQL Editor を開く
2. 以下を順番に実行:
   - `supabase/migrations/002_public_schema.sql`
   - `supabase/migrations/003_unread_and_profile.sql`
   - `supabase/migrations/004_messaging_features.sql`
3. 「Run」を実行

### 1.4 Storage設定
1. Storage → New bucket
2. バケット名: `files`
3. Public bucket: ON
4. 以下のポリシーを追加:

```sql
-- SELECT (読み取り)
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING (bucket_id = 'files');

-- INSERT (アップロード)
CREATE POLICY "Authenticated users can upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'files' AND
  auth.role() = 'authenticated'
);

-- DELETE (削除)
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 1.5 Realtime有効化
1. Database → Replication
2. 以下のテーブルを有効化:
   - `messages`
   - `reactions`
   - `channel_members`

---

## 2. ローカル環境のセットアップ

### 2.1 依存パッケージのインストール
```bash
cd 社内SNS
npm install
```

### 2.2 環境変数ファイルの作成
```bash
cp .env.example .env.local
```

`.env.local` を編集:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=your_openai_api_key  # AIチャット用（オプション）
```

### 2.3 開発サーバーの起動
```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

---

## 3. AIチャット機能（オプション）

AIチャットを使用する場合:

1. [OpenAI](https://platform.openai.com) でAPIキーを取得
2. `.env.local` に `OPENAI_API_KEY` を設定
3. サーバーを再起動

---

## プロジェクト構成

```
社内SNS/
├── src/
│   ├── app/
│   │   ├── (auth)/          # 認証ページ
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (main)/          # メイン機能
│   │   │   ├── channels/    # チャット
│   │   │   ├── dm/          # DM
│   │   │   ├── calendar/    # カレンダー
│   │   │   ├── tasks/       # タスク
│   │   │   ├── files/       # ファイル
│   │   │   └── ai-chat/     # AI
│   │   └── api/             # APIルート
│   ├── components/          # UIコンポーネント
│   ├── lib/                 # ユーティリティ
│   └── types/               # 型定義
├── supabase/
│   └── migrations/          # DBスキーマ
└── public/                  # 静的ファイル
```

---

## デザインコンセプト

### アンダーテイル風要素
- ドット絵フォント（DotGothic16）
- 白黒ベースのカラースキーム
- ハート（♥）アイコン
- 「*」から始まるテキスト
- スケッチ風ボーダー
- ピクセルアート風アバター

### Notion風要素
- シンプルで洗練されたレイアウト
- 手書き風フォント（Klee One）
- ミニマルなデザイン
- 直感的なUI

---

## トラブルシューティング

### ログインできない
- Supabase の Authentication → Settings で Email confirmations を OFF に設定

### リアルタイムが動かない
- Supabase の Database → Replication で該当テーブルが有効か確認

### ファイルアップロードができない
- Storage バケット `files` のポリシーを確認
- バケットが Public になっているか確認

---

楽しい社内コミュニケーションを！ ♥
