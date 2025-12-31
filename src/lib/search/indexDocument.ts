export type SearchSourceType = 'channel_message' | 'dm_message' | 'file' | 'task'

interface IndexPayload {
  sourceType: SearchSourceType
  sourceId: string
  title?: string
  content?: string
  channelId?: string | null
  dmId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown>
}

export async function upsertSearchDocument(payload: IndexPayload) {
  await fetch('/api/search/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', ...payload }),
  })
}

export async function deleteSearchDocument(sourceType: SearchSourceType, sourceId: string) {
  await fetch('/api/search/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', sourceType, sourceId }),
  })
}
