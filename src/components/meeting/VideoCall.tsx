'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js'

interface VideoCallProps {
  roomUrl: string
  userName: string
  onLeave: () => void
  minimized?: boolean
  onToggleMinimize?: () => void
}

interface ParticipantInfo {
  id: string
  name: string
  videoTrack: MediaStreamTrack | null
  audioTrack: MediaStreamTrack | null
  isLocal: boolean
  videoOn: boolean
  audioOn: boolean
}

// グローバルなシングルトン管理
let globalCall: DailyCall | null = null
let globalRoomUrl: string | null = null
let isCreating = false
let destroyPromise: Promise<void> | null = null
let retryCount = 0
const MAX_RETRIES = 2

// 安全にコールを破棄（Promise-based lock）
async function destroyCall(): Promise<void> {
  if (destroyPromise) {
    await destroyPromise
    return
  }

  if (!globalCall) {
    return
  }

  const callToDestroy = globalCall
  globalCall = null
  globalRoomUrl = null

  destroyPromise = (async () => {
    try {
      console.log('Destroying Daily call...')
      await callToDestroy.destroy()
      console.log('Daily call destroyed successfully')
    } catch (e) {
      console.error('Error destroying call:', e)
    } finally {
      destroyPromise = null
    }
  })()

  await destroyPromise
}

// ビデオタイルコンポーネント
function VideoTile({ participant }: { participant: ParticipantInfo }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    if (participant.videoTrack && participant.videoOn) {
      const stream = new MediaStream([participant.videoTrack])
      videoEl.srcObject = stream
      videoEl.play().catch(console.error)
    } else {
      videoEl.srcObject = null
    }

    return () => {
      if (videoEl) {
        videoEl.srcObject = null
      }
    }
  }, [participant.videoTrack, participant.videoOn])

  return (
    <div className="bg-gray-700 rounded-lg overflow-hidden aspect-video relative">
      {participant.videoOn && participant.videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-white text-black rounded-full flex items-center justify-center font-pixel text-3xl mx-auto mb-2">
              {participant.name[0]}
            </div>
          </div>
        </div>
      )}
      {/* 名前バッジ */}
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded">
        <span className="text-white text-sm font-pixel">
          {participant.isLocal ? `${participant.name} (自分)` : participant.name}
        </span>
      </div>
      {/* ミュートアイコン */}
      {!participant.audioOn && (
        <div className="absolute top-2 right-2 bg-red-500 p-1 rounded-full">
          <span className="text-white text-sm">🔇</span>
        </div>
      )}
    </div>
  )
}

export default function VideoCall({ roomUrl, userName, onLeave, minimized = false, onToggleMinimize }: VideoCallProps) {
  const [isJoined, setIsJoined] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [participants, setParticipants] = useState<ParticipantInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(minimized)
  const onLeaveRef = useRef(onLeave)
  const isMountedRef = useRef(true)

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized)
    onToggleMinimize?.()
  }

  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // 参加者情報を更新
  const updateParticipants = useCallback(() => {
    if (!globalCall) return
    try {
      const allParticipants = globalCall.participants()
      const participantList: ParticipantInfo[] = Object.entries(allParticipants).map(
        ([id, p]: [string, DailyParticipant]) => ({
          id,
          name: p.user_name || 'ゲスト',
          videoTrack: p.tracks?.video?.persistentTrack || null,
          audioTrack: p.tracks?.audio?.persistentTrack || null,
          isLocal: p.local || false,
          videoOn: p.tracks?.video?.state === 'playable',
          audioOn: p.tracks?.audio?.state === 'playable',
        })
      )
      setParticipants(participantList)
    } catch (e) {
      console.error('Error updating participants:', e)
    }
  }, [])

  useEffect(() => {
    const initCall = async () => {
      if (destroyPromise) {
        console.log('Waiting for previous call to be destroyed...')
        await destroyPromise
      }

      if (globalCall && globalRoomUrl === roomUrl) {
        console.log('Already connected to this room')
        setIsJoined(true)
        updateParticipants()
        return
      }

      if (isCreating) {
        console.log('Call is being created, waiting...')
        await new Promise(resolve => {
          const checkInterval = setInterval(() => {
            if (!isCreating) {
              clearInterval(checkInterval)
              resolve(null)
            }
          }, 100)
        })
        if (globalCall && globalRoomUrl === roomUrl) {
          setIsJoined(true)
          updateParticipants()
        }
        return
      }

      if (globalCall) {
        console.log('Destroying previous call')
        await destroyCall()
      }

      isCreating = true
      retryCount = 0

      try {
        await new Promise(resolve => setTimeout(resolve, 100))

        console.log('Creating Daily call object...')
        const call = DailyIframe.createCallObject({
          subscribeToTracksAutomatically: true,
          allowMultipleCallInstances: process.env.NODE_ENV === 'development',
        })

        globalCall = call
        globalRoomUrl = roomUrl

        call.on('joined-meeting', () => {
          console.log('Joined meeting successfully')
          retryCount = 0
          if (isMountedRef.current) {
            setIsJoined(true)
            updateParticipants()
          }
        })

        call.on('left-meeting', async () => {
          console.log('Left meeting event')
          await destroyCall()
          if (isMountedRef.current) {
            setIsJoined(false)
            onLeaveRef.current()
          }
        })

        call.on('error', async (e) => {
          console.error('Daily.co error:', e)
          await destroyCall()
          if (isMountedRef.current) {
            setError('ミーティングへの接続に失敗しました')
          }
        })

        // 参加者イベント
        call.on('participant-joined', () => {
          if (isMountedRef.current) updateParticipants()
        })
        call.on('participant-left', () => {
          if (isMountedRef.current) updateParticipants()
        })
        call.on('participant-updated', () => {
          if (isMountedRef.current) updateParticipants()
        })

        // トラックイベント（ビデオ/オーディオの開始・停止）
        call.on('track-started', () => {
          if (isMountedRef.current) updateParticipants()
        })
        call.on('track-stopped', () => {
          if (isMountedRef.current) updateParticipants()
        })

        console.log('Joining room:', roomUrl)
        await call.join({
          url: roomUrl,
          userName: userName,
        })

        isCreating = false
      } catch (err: any) {
        console.error('Failed to join meeting:', err)
        isCreating = false

        if (err?.message?.includes('Duplicate')) {
          retryCount++
          console.log(`Duplicate error - retry ${retryCount}/${MAX_RETRIES}`)

          if (retryCount > MAX_RETRIES) {
            console.log('Max retries reached, giving up')
            retryCount = 0
            if (isMountedRef.current) {
              setError('ミーティングへの接続に失敗しました。ページをリロードしてください。')
            }
            return
          }

          globalCall = null
          globalRoomUrl = null
          destroyPromise = null

          await new Promise(resolve => setTimeout(resolve, 1000))

          if (isMountedRef.current) {
            console.log('Retrying call initialization...')
            initCall()
          }
          return
        }

        await destroyCall()
        if (isMountedRef.current) {
          setError('ミーティングの開始に失敗しました')
        }
      }
    }

    initCall()

    return () => {
      console.log('VideoCall effect cleanup')
    }
  }, [roomUrl, userName, updateParticipants])

  const toggleMute = () => {
    if (!globalCall) return
    const newMuted = !isMuted
    globalCall.setLocalAudio(!newMuted)
    setIsMuted(newMuted)
  }

  const toggleVideo = () => {
    if (!globalCall) return
    const newVideoOff = !isVideoOff
    globalCall.setLocalVideo(!newVideoOff)
    setIsVideoOff(newVideoOff)
  }

  const toggleScreenShare = async () => {
    if (!globalCall) return

    try {
      if (isScreenSharing) {
        await globalCall.stopScreenShare()
      } else {
        await globalCall.startScreenShare()
      }
      setIsScreenSharing(!isScreenSharing)
    } catch (err) {
      console.error('Screen share error:', err)
    }
  }

  const leaveCall = async () => {
    console.log('User clicked leave')
    if (globalCall) {
      try {
        await globalCall.leave()
      } catch (e) {
        console.error('Error leaving call:', e)
        await destroyCall()
        onLeaveRef.current()
      }
    } else {
      onLeaveRef.current()
    }
  }

  const handleClose = async () => {
    await destroyCall()
    onLeaveRef.current()
  }

  // グリッドのカラム数を参加者数に応じて調整
  const getGridCols = () => {
    const count = participants.length
    if (count === 1) return 'grid-cols-1'
    if (count === 2) return 'grid-cols-2'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 6) return 'grid-cols-3'
    return 'grid-cols-4'
  }

  // 最小化モード（フローティングウィンドウ）
  if (isMinimized) {
    const localParticipant = participants.find(p => p.isLocal)

    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 bg-gray-900 rounded-lg shadow-2xl border-2 border-white overflow-hidden">
        {/* ミニヘッダー */}
        <div className="bg-black p-2 flex items-center justify-between">
          <span className="text-white font-pixel text-sm flex items-center gap-1">
            <span className="text-red-500">♥</span>
            {participants.length}人
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMinimize}
              className="p-1 hover:bg-gray-700 rounded"
              title="拡大"
            >
              <span className="text-white text-sm">⬜</span>
            </button>
            <button
              onClick={leaveCall}
              className="p-1 hover:bg-red-600 rounded"
              title="退出"
            >
              <span className="text-white text-sm">✕</span>
            </button>
          </div>
        </div>

        {/* ミニビデオ */}
        <div className="aspect-video bg-gray-800">
          {error ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-red-500 text-sm">エラー</p>
            </div>
          ) : !isJoined ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-white text-sm">接続中...</p>
            </div>
          ) : localParticipant ? (
            <VideoTile participant={localParticipant} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-400 text-sm">参加者なし</p>
            </div>
          )}
        </div>

        {/* ミニコントロール */}
        <div className="bg-black p-2 flex items-center justify-center gap-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-700'}`}
            title={isMuted ? 'ミュート解除' : 'ミュート'}
          >
            <span className="text-white text-sm">{isMuted ? '🔇' : '🎤'}</span>
          </button>
          <button
            onClick={toggleVideo}
            className={`p-2 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'}`}
            title={isVideoOff ? 'ビデオON' : 'ビデオOFF'}
          >
            <span className="text-white text-sm">{isVideoOff ? '📷' : '🎥'}</span>
          </button>
          <button
            onClick={leaveCall}
            className="p-2 rounded-full bg-red-600"
            title="退出"
          >
            <span className="text-white text-sm">📞</span>
          </button>
        </div>
      </div>
    )
  }

  // 通常モード（フルスクリーン）
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-pixel text-lg">
            <span className="text-red-500">♥</span> ミーティング中
          </span>
          <span className="text-gray-400 text-sm">
            {participants.length}人 参加中
          </span>
        </div>
        <div className="flex items-center gap-2">
          {participants.map((p) => (
            <span key={p.id} className="text-white text-sm bg-gray-700 px-2 py-1 rounded">
              {p.name}
            </span>
          ))}
          <button
            onClick={toggleMinimize}
            className="ml-2 p-2 bg-gray-700 hover:bg-gray-600 rounded"
            title="最小化"
          >
            <span className="text-white">⬜</span>
          </button>
        </div>
      </div>

      {/* ビデオエリア */}
      <div className="flex-1 bg-gray-800 overflow-auto p-4">
        {error ? (
          <div className="h-full flex items-center justify-center">
            <div className="ut-textbox text-center">
              <p className="font-pixel text-red-500 mb-4">* エラー</p>
              <p className="text-white mb-4">{error}</p>
              <button
                onClick={handleClose}
                className="pixel-btn bg-red-600 text-white"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : !isJoined ? (
          <div className="h-full flex items-center justify-center">
            <div className="ut-textbox">
              <p className="font-pixel loading-text">接続中</p>
            </div>
          </div>
        ) : (
          <div className={`grid ${getGridCols()} gap-4 h-full auto-rows-fr`}>
            {participants.map((p) => (
              <VideoTile key={p.id} participant={p} />
            ))}
          </div>
        )}
      </div>

      {/* コントロールバー */}
      <div className="bg-gray-900 p-4 flex items-center justify-center gap-4">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full ${
            isMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isMuted ? 'ミュート解除' : 'ミュート'}
        >
          <span className="text-white text-2xl">{isMuted ? '🔇' : '🎤'}</span>
        </button>

        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full ${
            isVideoOff ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isVideoOff ? 'ビデオON' : 'ビデオOFF'}
        >
          <span className="text-white text-2xl">{isVideoOff ? '📷' : '🎥'}</span>
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-4 rounded-full ${
            isScreenSharing ? 'bg-green-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isScreenSharing ? '画面共有を停止' : '画面共有'}
        >
          <span className="text-white text-2xl">🖥️</span>
        </button>

        <button
          onClick={leaveCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-500"
          title="退出"
        >
          <span className="text-white text-2xl">📞</span>
        </button>
      </div>
    </div>
  )
}
