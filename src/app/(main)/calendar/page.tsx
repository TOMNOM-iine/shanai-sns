'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Event, Profile } from '@/types/database'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { ja } from 'date-fns/locale'

interface EventWithUser extends Event {
  profiles: Profile
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<EventWithUser[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
  })
  const [user, setUser] = useState<Profile | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchUser()
    fetchEvents()
  }, [currentDate])

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

  const fetchEvents = async () => {
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)

    const { data } = await supabase
      .from('events')
      .select('*, profiles(*)')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .order('start_time', { ascending: true })

    if (data) setEvents(data as EventWithUser[])
  }

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newEvent.title || !newEvent.start_time) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('events') as any).insert({
      title: newEvent.title,
      description: newEvent.description,
      start_time: newEvent.start_time,
      end_time: newEvent.end_time || newEvent.start_time,
      created_by: user.id,
    })

    if (!error) {
      setShowModal(false)
      setNewEvent({ title: '', description: '', start_time: '', end_time: '' })
      fetchEvents()
    }
  }

  const deleteEvent = async (eventId: string) => {
    if (!confirm('このイベントを削除しますか？')) return
    await supabase.from('events').delete().eq('id', eventId)
    fetchEvents()
  }

  // カレンダーの日付を生成
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.start_time), day))
  }

  const openNewEventModal = (date: Date) => {
    setSelectedDate(date)
    setNewEvent({
      ...newEvent,
      start_time: format(date, "yyyy-MM-dd'T'HH:mm"),
      end_time: format(date, "yyyy-MM-dd'T'HH:mm"),
    })
    setShowModal(true)
  }

  return (
    <div className="h-full flex flex-col p-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="ut-textbox">
          <h1 className="text-2xl font-pixel">* カレンダー</h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="pixel-btn px-4"
          >
            ←
          </button>
          <span className="font-pixel text-xl">
            {format(currentDate, 'yyyy年 M月', { locale: ja })}
          </span>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="pixel-btn px-4"
          >
            →
          </button>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="flex-1 sketch-border bg-white p-4 overflow-hidden flex flex-col">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
            <div
              key={day}
              className={`text-center font-pixel py-2 ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-1 flex-1">
          {days.map((day) => {
            const dayEvents = getEventsForDay(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={day.toISOString()}
                onClick={() => openNewEventModal(day)}
                className={`border-2 border-black p-1 cursor-pointer hover:bg-gray-100 transition-colors ${
                  !isCurrentMonth ? 'opacity-30' : ''
                } ${isToday ? 'bg-yellow-100' : ''}`}
              >
                <div
                  className={`font-pixel text-sm ${
                    day.getDay() === 0
                      ? 'text-red-500'
                      : day.getDay() === 6
                      ? 'text-blue-500'
                      : ''
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-1 mt-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (event.created_by === user?.id) {
                          deleteEvent(event.id)
                        }
                      }}
                      className="text-xs bg-black text-white px-1 py-0.5 truncate cursor-pointer hover:bg-red-600"
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-gray-500">
                      +{dayEvents.length - 2}件
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 新規イベントモーダル */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-pixel text-xl mb-4">* 新しいイベント</h2>

            <form onSubmit={createEvent} className="space-y-4">
              <div>
                <label className="block font-pixel mb-1">タイトル</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, title: e.target.value })
                  }
                  className="hand-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block font-pixel mb-1">説明</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, description: e.target.value })
                  }
                  className="hand-input w-full h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-pixel mb-1">開始</label>
                  <input
                    type="datetime-local"
                    value={newEvent.start_time}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, start_time: e.target.value })
                    }
                    className="hand-input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block font-pixel mb-1">終了</label>
                  <input
                    type="datetime-local"
                    value={newEvent.end_time}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, end_time: e.target.value })
                    }
                    className="hand-input w-full"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="pixel-btn flex-1">
                  <span className="text-red-500">♥</span> 作成
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="pixel-btn flex-1 bg-gray-200"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
