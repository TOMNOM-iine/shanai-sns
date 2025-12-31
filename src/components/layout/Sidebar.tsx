'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Channel, Profile } from '@/types/database'

interface SidebarProps {
  user: Profile | null
}

interface DmUserWithDmId extends Profile {
  dmId: string
}

export default function Sidebar({ user }: SidebarProps) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [dmUsers, setDmUsers] = useState<DmUserWithDmId[]>([])
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [channelUnreadCounts, setChannelUnreadCounts] = useState<Record<string, number>>({})
  const [dmUnreadCounts, setDmUnreadCounts] = useState<Record<string, number>>({})
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // 未読カウントを取得
  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return

    try {
      // チャンネルの未読数を取得
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: channelReads, error: channelReadsError } = await (supabase.from('channel_reads') as any)
        .select('channel_id, last_read_at')
        .eq('user_id', user.id)

      // テーブルが存在しない場合はスキップ
      if (channelReadsError) {
        // テーブルが存在しない場合は未読機能をスキップ
        return
      }

      const channelReadMap = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (channelReads || []).map((r: any) => [r.channel_id, r.last_read_at])
      )

      // 各チャンネルの未読メッセージ数をカウント
      const channelCounts: Record<string, number> = {}
      for (const channel of channels) {
        const lastRead = channelReadMap.get(channel.id)
        let query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', channel.id)
          .neq('user_id', user.id)

        if (lastRead) {
          query = query.gt('created_at', lastRead)
        }

        const { count } = await query
        if (count && count > 0) {
          channelCounts[channel.id] = count
        }
      }
      setChannelUnreadCounts(channelCounts)

      // DMの未読数を取得
      const { data: dmReads, error: dmReadsError } = await supabase
        .from('dm_reads')
        .select('dm_id, last_read_at')
        .eq('user_id', user.id)

      if (dmReadsError) {
        return
      }

      const dmReadMap = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dmReads || []).map((r: any) => [r.dm_id, r.last_read_at])
      )

      const dmCounts: Record<string, number> = {}
      for (const dmUser of dmUsers) {
        const lastRead = dmReadMap.get(dmUser.dmId)
        let query = supabase
          .from('dm_messages')
          .select('id', { count: 'exact', head: true })
          .eq('dm_id', dmUser.dmId)
          .neq('sender_id', user.id)

        if (lastRead) {
          query = query.gt('created_at', lastRead)
        }

        const { count } = await query
        if (count && count > 0) {
          dmCounts[dmUser.id] = count
        }
      }
      setDmUnreadCounts(dmCounts)
    } catch (error) {
      // マイグレーション未実行時のエラーは無視
      console.log('Unread counts feature not available yet')
    }
  }, [user, channels, dmUsers, supabase])

  useEffect(() => {
    fetchChannels()
    fetchDmUsers()
  }, [user])

  useEffect(() => {
    if (channels.length > 0 || dmUsers.length > 0) {
      fetchUnreadCounts()
    }

    // リアルタイム更新: 新しいメッセージが来たら未読カウントを更新
    const messageSubscription = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchUnreadCounts()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        () => fetchUnreadCounts()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messageSubscription)
    }
  }, [channels, dmUsers, fetchUnreadCounts, supabase])

  const fetchChannels = async () => {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setChannels(data)
  }

  const fetchDmUsers = async () => {
    if (!user) return

    try {
      // まずDMの一覧を取得
      const { data: dms, error: dmError } = await supabase
        .from('direct_messages')
        .select('id, user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)

      if (dmError || !dms) return

      // 相手のユーザーIDを抽出
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const otherUserIds = dms.map((dm: any) =>
        dm.user1_id === user.id ? dm.user2_id : dm.user1_id
      )

      if (otherUserIds.length === 0) {
        setDmUsers([])
        return
      }

      // プロフィールを取得
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherUserIds)

      if (profileError || !profiles) return

      // DMのIDとプロフィールを結合
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usersWithDmId = dms.map((dm: any) => {
        const otherId = dm.user1_id === user.id ? dm.user2_id : dm.user1_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profile = (profiles as any[]).find((p: any) => p.id === otherId)
        return profile ? { ...profile, dmId: dm.id } : null
      }).filter(Boolean) as DmUserWithDmId[]

      setDmUsers(usersWithDmId)
    } catch (error) {
      console.error('Failed to fetch DM users:', error)
    }
  }

  const createChannel = async () => {
    if (!newChannelName.trim() || !user) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('channels') as any)
      .insert({
        name: newChannelName,
        created_by: user.id,
      })
      .select()
      .single()

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('channel_members') as any).insert({
        channel_id: data.id,
        user_id: user.id,
        role: 'owner',
      })
      setChannels([...channels, data])
      setNewChannelName('')
      setShowNewChannel(false)
      router.push(`/channels/${data.id}`)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="w-64 h-screen bg-black text-white flex flex-col border-r-4 border-white">
      {/* ヘッダー */}
      <div className="p-4 border-b-2 border-white">
        <h1 className="font-pixel text-xl flex items-center gap-2">
          <span className="text-red-500">♥</span>
          社内SNS
        </h1>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* メインメニュー */}
        <div className="px-4 mb-4">
          <Link
            href="/channels"
            className={`sidebar-item block ${pathname === '/channels' ? 'active' : ''}`}
          >
            # ホーム
          </Link>
          <Link
            href="/calendar"
            className={`sidebar-item block ${pathname === '/calendar' ? 'active' : ''}`}
          >
            * カレンダー
          </Link>
          <Link
            href="/tasks"
            className={`sidebar-item block ${pathname === '/tasks' ? 'active' : ''}`}
          >
            * タスク
          </Link>
          <Link
            href="/files"
            className={`sidebar-item block ${pathname === '/files' ? 'active' : ''}`}
          >
            * ファイル
          </Link>
          <Link
            href="/ai-chat"
            className={`sidebar-item block ${pathname === '/ai-chat' ? 'active' : ''}`}
          >
            * AIアシスタント
          </Link>
        </div>

        {/* チャンネル */}
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-pixel text-sm text-gray-400">チャンネル</span>
            <button
              onClick={() => setShowNewChannel(!showNewChannel)}
              className="text-gray-400 hover:text-white text-xl"
            >
              +
            </button>
          </div>

          {showNewChannel && (
            <div className="mb-2">
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="チャンネル名"
                className="w-full bg-gray-900 border border-white px-2 py-1 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && createChannel()}
              />
              <button
                onClick={createChannel}
                className="w-full mt-1 bg-white text-black px-2 py-1 text-sm font-pixel"
              >
                作成
              </button>
            </div>
          )}

          {channels.map((channel) => (
            <Link
              key={channel.id}
              href={`/channels/${channel.id}`}
              className={`sidebar-item block flex items-center justify-between ${
                pathname === `/channels/${channel.id}` ? 'active' : ''
              }`}
            >
              <span># {channel.name}</span>
              {channelUnreadCounts[channel.id] && (
                <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {channelUnreadCounts[channel.id]}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* DM */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-pixel text-sm text-gray-400">ダイレクトメッセージ</span>
          </div>

          {dmUsers.map((dmUser) => (
            <Link
              key={dmUser.id}
              href={`/dm/${dmUser.id}`}
              className={`sidebar-item block flex items-center justify-between ${
                pathname === `/dm/${dmUser.id}` ? 'active' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {dmUser.display_name || dmUser.email}
              </span>
              {dmUnreadCounts[dmUser.id] && (
                <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {dmUnreadCounts[dmUser.id]}
                </span>
              )}
            </Link>
          ))}

          <Link
            href="/dm"
            className="sidebar-item block text-gray-400 hover:text-white"
          >
            + 新しいDM
          </Link>
        </div>
      </nav>

      {/* ユーザーメニュー */}
      <div className="p-4 border-t-2 border-white">
        <Link
          href="/profile"
          className="flex items-center gap-3 mb-3 hover:bg-gray-900 p-2 -m-2 rounded transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-pixel text-lg pixel-avatar">
            {user?.display_name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-pixel truncate">
              {user?.display_name || 'ゲスト'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.email}
            </p>
          </div>
          <span className="text-gray-400 text-sm">→</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full pixel-btn bg-black text-white border-white text-sm"
        >
          ログアウト
        </button>
      </div>
    </aside>
  )
}
