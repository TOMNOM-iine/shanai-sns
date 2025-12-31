'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task, Profile } from '@/types/database'

interface TaskWithUser extends Task {
  profiles: Profile | null
  assignee: Profile | null
}

type TaskStatus = 'todo' | 'in_progress' | 'done'

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithUser[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithUser | null>(null)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
    assignee_id: '',
    due_date: '',
  })
  const [user, setUser] = useState<Profile | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const supabase = createClient()

  useEffect(() => {
    fetchUser()
    fetchTasks()
    fetchUsers()
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

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select(`
        *,
        profiles:created_by(*),
        assignee:assignee_id(*)
      `)
      .order('created_at', { ascending: false })

    if (data) setTasks(data as TaskWithUser[])
  }

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name')
    if (data) setUsers(data)
  }

  const createOrUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newTask.title) return

    if (editingTask) {
      // 更新
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('tasks') as any)
        .update({
          title: newTask.title,
          description: newTask.description,
          status: newTask.status,
          assignee_id: newTask.assignee_id || null,
          due_date: newTask.due_date || null,
        })
        .eq('id', editingTask.id)
    } else {
      // 新規作成
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('tasks') as any).insert({
        title: newTask.title,
        description: newTask.description,
        status: newTask.status,
        assignee_id: newTask.assignee_id || null,
        due_date: newTask.due_date || null,
        created_by: user.id,
      })
    }

    closeModal()
    fetchTasks()
  }

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('tasks') as any).update({ status }).eq('id', taskId)
    fetchTasks()
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('このタスクを削除しますか？')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('tasks') as any).delete().eq('id', taskId)
    fetchTasks()
  }

  const openEditModal = (task: TaskWithUser) => {
    setEditingTask(task)
    setNewTask({
      title: task.title,
      description: task.description || '',
      status: task.status,
      assignee_id: task.assignee_id || '',
      due_date: task.due_date || '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingTask(null)
    setNewTask({
      title: '',
      description: '',
      status: 'todo',
      assignee_id: '',
      due_date: '',
    })
  }

  const getStatusLabel = (status: TaskStatus) => {
    switch (status) {
      case 'todo':
        return '未着手'
      case 'in_progress':
        return '進行中'
      case 'done':
        return '完了'
    }
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'todo':
        return 'bg-gray-200'
      case 'in_progress':
        return 'bg-yellow-200'
      case 'done':
        return 'bg-green-200'
    }
  }

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'mine') {
      return task.assignee_id === user?.id || task.created_by === user?.id
    }
    return true
  })

  const tasksByStatus = {
    todo: filteredTasks.filter((t) => t.status === 'todo'),
    in_progress: filteredTasks.filter((t) => t.status === 'in_progress'),
    done: filteredTasks.filter((t) => t.status === 'done'),
  }

  return (
    <div className="h-full flex flex-col p-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="ut-textbox">
          <h1 className="text-2xl font-pixel">* タスク</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`pixel-btn text-sm ${filter === 'all' ? 'bg-black text-white' : ''}`}
            >
              すべて
            </button>
            <button
              onClick={() => setFilter('mine')}
              className={`pixel-btn text-sm ${filter === 'mine' ? 'bg-black text-white' : ''}`}
            >
              自分の
            </button>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="pixel-btn"
          >
            <span className="text-red-500">♥</span> 新規タスク
          </button>
        </div>
      </div>

      {/* カンバンボード */}
      <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden">
        {(['todo', 'in_progress', 'done'] as const).map((status) => (
          <div key={status} className="flex flex-col sketch-border bg-white p-4 overflow-hidden">
            <div className={`font-pixel text-lg mb-4 p-2 ${getStatusColor(status)}`}>
              {getStatusLabel(status)} ({tasksByStatus[status].length})
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {tasksByStatus[status].map((task) => (
                <div
                  key={task.id}
                  className="border-2 border-black p-3 bg-white hover:shadow-sketch transition-shadow cursor-pointer"
                  onClick={() => openEditModal(task)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-pixel flex-1">{task.title}</h3>
                    {task.created_by === user?.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteTask(task.id)
                        }}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2 text-xs">
                    {task.assignee && (
                      <span className="bg-gray-100 px-2 py-0.5">
                        {task.assignee.display_name}
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-gray-500">
                        〆 {new Date(task.due_date).toLocaleDateString('ja-JP')}
                      </span>
                    )}
                  </div>

                  {/* ステータス変更ボタン */}
                  <div className="flex gap-1 mt-2">
                    {status !== 'todo' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          updateTaskStatus(
                            task.id,
                            status === 'done' ? 'in_progress' : 'todo'
                          )
                        }}
                        className="text-xs bg-gray-200 px-2 py-0.5 hover:bg-gray-300"
                      >
                        ←
                      </button>
                    )}
                    {status !== 'done' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          updateTaskStatus(
                            task.id,
                            status === 'todo' ? 'in_progress' : 'done'
                          )
                        }}
                        className="text-xs bg-gray-200 px-2 py-0.5 hover:bg-gray-300"
                      >
                        →
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {tasksByStatus[status].length === 0 && (
                <p className="text-center text-gray-400 font-pixel py-4">
                  タスクなし
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* タスク作成/編集モーダル */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-pixel text-xl mb-4">
              * {editingTask ? 'タスクを編集' : '新しいタスク'}
            </h2>

            <form onSubmit={createOrUpdateTask} className="space-y-4">
              <div>
                <label className="block font-pixel mb-1">タイトル</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask({ ...newTask, title: e.target.value })
                  }
                  className="hand-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block font-pixel mb-1">説明</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) =>
                    setNewTask({ ...newTask, description: e.target.value })
                  }
                  className="hand-input w-full h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-pixel mb-1">ステータス</label>
                  <select
                    value={newTask.status}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        status: e.target.value as TaskStatus,
                      })
                    }
                    className="hand-input w-full"
                  >
                    <option value="todo">未着手</option>
                    <option value="in_progress">進行中</option>
                    <option value="done">完了</option>
                  </select>
                </div>

                <div>
                  <label className="block font-pixel mb-1">担当者</label>
                  <select
                    value={newTask.assignee_id}
                    onChange={(e) =>
                      setNewTask({ ...newTask, assignee_id: e.target.value })
                    }
                    className="hand-input w-full"
                  >
                    <option value="">未割り当て</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-pixel mb-1">期限</label>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) =>
                    setNewTask({ ...newTask, due_date: e.target.value })
                  }
                  className="hand-input w-full"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="pixel-btn flex-1">
                  <span className="text-red-500">♥</span>{' '}
                  {editingTask ? '更新' : '作成'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
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
