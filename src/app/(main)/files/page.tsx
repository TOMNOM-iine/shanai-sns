'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'
import dynamic from 'next/dynamic'

// PDFビューアを動的インポート
const FilePreview = dynamic(() => import('@/components/files/FilePreview'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <p className="font-pixel loading-text">読み込み中</p>
    </div>
  ),
})

interface FileRecord {
  id: string
  name: string
  path: string
  size: number
  mime_type: string
  uploaded_by: string
  channel_id?: string
  created_at: string
  profiles?: Profile
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<Profile | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'document' | 'image' | 'other'>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchUser()
    fetchFiles()
  }, [])

  const fetchUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      setUser(data)
    }
  }

  const fetchFiles = async () => {
    const { data } = await supabase
      .from('files')
      .select('*, profiles:uploaded_by(*)')
      .order('created_at', { ascending: false })
    if (data) setFiles(data as FileRecord[])
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)

    // Supabase Storageにアップロード
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
    const filePath = `uploads/${user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      alert('アップロードに失敗しました。Supabase Storageのバケット設定を確認してください。')
      setUploading(false)
      return
    }

    // DBに記録
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase.from('files') as any).insert({
      name: file.name,
      path: filePath,
      size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    })

    if (!dbError) {
      fetchFiles()
    }

    setUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const deleteFile = async (file: FileRecord) => {
    if (!confirm('このファイルを削除しますか？')) return

    // Storageから削除
    await supabase.storage.from('files').remove([file.path])

    // DBから削除
    await supabase.from('files').delete().eq('id', file.id)
    fetchFiles()

    if (selectedFile?.id === file.id) {
      setSelectedFile(null)
      setPreviewUrl(null)
    }
  }

  const openPreview = async (file: FileRecord) => {
    setSelectedFile(file)

    // 署名付きURLを取得
    const { data } = await supabase.storage
      .from('files')
      .createSignedUrl(file.path, 3600) // 1時間有効

    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl)
    }
  }

  const closePreview = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
  }

  const downloadFile = async (file: FileRecord) => {
    const { data } = await supabase.storage
      .from('files')
      .createSignedUrl(file.path, 60)

    if (data?.signedUrl) {
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = file.name
      link.click()
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼'
    if (mimeType.startsWith('video/')) return '🎬'
    if (mimeType.startsWith('audio/')) return '🎵'
    if (mimeType.includes('pdf')) return '📄'
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽'
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦'
    if (mimeType.includes('text')) return '📃'
    return '📎'
  }

  const getFileCategory = (mimeType: string): 'document' | 'image' | 'other' => {
    if (mimeType.includes('pdf') || mimeType.includes('word') ||
        mimeType.includes('document') || mimeType.includes('text')) {
      return 'document'
    }
    if (mimeType.startsWith('image/')) {
      return 'image'
    }
    return 'other'
  }

  const filteredFiles = files.filter(file => {
    if (filter === 'all') return true
    return getFileCategory(file.mime_type) === filter
  })

  const canPreview = (mimeType: string) => {
    return mimeType.includes('pdf') ||
           mimeType.includes('word') ||
           mimeType.includes('document') ||
           mimeType.startsWith('image/') ||
           mimeType.includes('text')
  }

  return (
    <div className="h-full flex">
      {/* ファイル一覧 */}
      <div className={`flex-1 flex flex-col p-8 ${selectedFile ? 'w-1/2' : 'w-full'}`}>
        {/* ヘッダー */}
        <div className="ut-textbox mb-6">
          <h1 className="text-2xl font-pixel">* ファイル</h1>
          <p className="mt-2">チームの だいじな ファイルを ほかんしよう</p>
        </div>

        {/* フィルター */}
        <div className="flex gap-2 mb-4">
          {[
            { key: 'all', label: 'すべて' },
            { key: 'document', label: '📄 ドキュメント' },
            { key: 'image', label: '🖼 画像' },
            { key: 'other', label: '📎 その他' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`px-3 py-1 text-sm border-2 border-black ${
                filter === key ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* アップロードエリア */}
        <div className="sketch-border bg-white p-4 mb-6">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            className="hidden"
            id="file-upload"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.xls,.xlsx,.ppt,.pptx"
          />
          <label
            htmlFor="file-upload"
            className={`block cursor-pointer text-center py-6 border-2 border-dashed border-black hover:bg-gray-50 transition-colors ${
              uploading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {uploading ? (
              <span className="font-pixel loading-text">アップロード中</span>
            ) : (
              <>
                <span className="text-3xl block mb-2">📁</span>
                <span className="font-pixel text-sm">
                  クリックして ファイルを アップロード
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  PDF, Word, Excel, 画像ファイル対応
                </span>
              </>
            )}
          </label>
        </div>

        {/* ファイル一覧 */}
        <div className="flex-1 overflow-y-auto">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-pixel text-gray-500">
                * ファイルが ありません
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className={`sketch-border bg-white p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 ${
                    selectedFile?.id === file.id ? 'ring-2 ring-black' : ''
                  }`}
                  onClick={() => canPreview(file.mime_type) && openPreview(file)}
                >
                  <span className="text-2xl">{getFileIcon(file.mime_type)}</span>

                  <div className="flex-1 min-w-0">
                    <p className="font-pixel text-sm truncate">{file.name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{file.profiles?.display_name}</span>
                      <span>{formatDate(file.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {canPreview(file.mime_type) && (
                      <button
                        onClick={() => openPreview(file)}
                        className="pixel-btn text-xs px-2 py-1"
                        title="プレビュー"
                      >
                        👁
                      </button>
                    )}
                    <button
                      onClick={() => downloadFile(file)}
                      className="pixel-btn text-xs px-2 py-1"
                      title="ダウンロード"
                    >
                      ↓
                    </button>
                    {file.uploaded_by === user?.id && (
                      <button
                        onClick={() => deleteFile(file)}
                        className="pixel-btn text-xs px-2 py-1 bg-red-100 hover:bg-red-500 hover:text-white"
                        title="削除"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* プレビューパネル */}
      {selectedFile && previewUrl && (
        <div className="w-1/2 border-l-4 border-black bg-white flex flex-col">
          <div className="p-4 border-b-2 border-black flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{getFileIcon(selectedFile.mime_type)}</span>
              <span className="font-pixel truncate">{selectedFile.name}</span>
            </div>
            <button
              onClick={closePreview}
              className="pixel-btn text-sm px-3 py-1"
            >
              ✕ 閉じる
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <FilePreview
              url={previewUrl}
              fileName={selectedFile.name}
              mimeType={selectedFile.mime_type}
            />
          </div>
        </div>
      )}
    </div>
  )
}
