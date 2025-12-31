export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          department: string | null
          status: 'online' | 'away' | 'offline'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          department?: string | null
          status?: 'online' | 'away' | 'offline'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          avatar_url?: string | null
          department?: string | null
          status?: 'online' | 'away' | 'offline'
          created_at?: string
          updated_at?: string
        }
      }
      channel_reads: {
        Row: {
          user_id: string
          channel_id: string
          last_read_at: string
        }
        Insert: {
          user_id: string
          channel_id: string
          last_read_at?: string
        }
        Update: {
          user_id?: string
          channel_id?: string
          last_read_at?: string
        }
      }
      dm_reads: {
        Row: {
          user_id: string
          dm_id: string
          last_read_at: string
        }
        Insert: {
          user_id: string
          dm_id: string
          last_read_at?: string
        }
        Update: {
          user_id?: string
          dm_id?: string
          last_read_at?: string
        }
      }
      channels: {
        Row: {
          id: string
          name: string
          description: string | null
          is_private: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          is_private?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          is_private?: boolean
          created_by?: string
          created_at?: string
        }
      }
      channel_members: {
        Row: {
          channel_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          joined_at: string
        }
        Insert: {
          channel_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          joined_at?: string
        }
        Update: {
          channel_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          joined_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          channel_id: string | null
          dm_id: string | null
          user_id: string
          content: string
          file_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          channel_id?: string | null
          dm_id?: string | null
          user_id: string
          content: string
          file_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          channel_id?: string | null
          dm_id?: string | null
          user_id?: string
          content?: string
          file_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      direct_messages: {
        Row: {
          id: string
          user1_id: string
          user2_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user1_id: string
          user2_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user1_id?: string
          user2_id?: string
          created_at?: string
        }
      }
      reactions: {
        Row: {
          id: string
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
      }
      events: {
        Row: {
          id: string
          title: string
          description: string | null
          start_time: string
          end_time: string
          channel_id: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          start_time: string
          end_time: string
          channel_id?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          start_time?: string
          end_time?: string
          channel_id?: string | null
          created_by?: string
          created_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          status: 'todo' | 'in_progress' | 'done'
          assignee_id: string | null
          due_date: string | null
          channel_id: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          assignee_id?: string | null
          due_date?: string | null
          channel_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          assignee_id?: string | null
          due_date?: string | null
          channel_id?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      files: {
        Row: {
          id: string
          name: string
          url: string
          size: number
          mime_type: string
          channel_id: string | null
          uploaded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          url: string
          size: number
          mime_type: string
          channel_id?: string | null
          uploaded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          url?: string
          size?: number
          mime_type?: string
          channel_id?: string | null
          uploaded_by?: string
          created_at?: string
        }
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type DirectMessage = Database['public']['Tables']['direct_messages']['Row']
export type Reaction = Database['public']['Tables']['reactions']['Row']
export type Event = Database['public']['Tables']['events']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type FileRecord = Database['public']['Tables']['files']['Row']
