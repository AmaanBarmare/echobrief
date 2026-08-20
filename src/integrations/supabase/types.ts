export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_item_completions: {
        Row: {
          action_item_index: number
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          meeting_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_item_index: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_item_index?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_item_completions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_states: {
        Row: {
          created_at: string
          id: string
          origin: string | null
          return_to: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          origin?: string | null
          return_to?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          origin?: string | null
          return_to?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_insights: {
        Row: {
          action_items: Json | null
          created_at: string
          decisions: Json | null
          follow_ups: Json | null
          id: string
          key_points: Json | null
          meeting_id: string
          meeting_metrics: Json | null
          open_questions: Json | null
          risks: Json | null
          speaker_highlights: Json | null
          strategic_insights: Json | null
          summary_detailed: string | null
          summary_short: string | null
          timeline_entries: Json | null
        }
        Insert: {
          action_items?: Json | null
          created_at?: string
          decisions?: Json | null
          follow_ups?: Json | null
          id?: string
          key_points?: Json | null
          meeting_id: string
          meeting_metrics?: Json | null
          open_questions?: Json | null
          risks?: Json | null
          speaker_highlights?: Json | null
          strategic_insights?: Json | null
          summary_detailed?: string | null
          summary_short?: string | null
          timeline_entries?: Json | null
        }
        Update: {
          action_items?: Json | null
          created_at?: string
          decisions?: Json | null
          follow_ups?: Json | null
          id?: string
          key_points?: Json | null
          meeting_id?: string
          meeting_metrics?: Json | null
          open_questions?: Json | null
          risks?: Json | null
          speaker_highlights?: Json | null
          strategic_insights?: Json | null
          summary_detailed?: string | null
          summary_short?: string | null
          timeline_entries?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_insights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notifications: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          id: string
          meeting_id: string | null
          notification_type: string
          scheduled_for: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          notification_type?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          notification_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: Json | null
          audio_url: string | null
          calendar_event_id: string | null
          created_at: string
          duration_seconds: number | null
          end_time: string | null
          id: string
          meeting_link: string | null
          source: string | null
          start_time: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          audio_url?: string | null
          calendar_event_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          meeting_link?: string | null
          source?: string | null
          start_time?: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          audio_url?: string | null
          calendar_event_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          meeting_link?: string | null
          source?: string | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          calendar_id: string
          created_at: string | null
          description: string | null
          end_time: string | null
          event_id: string
          id: string
          is_recurring: boolean | null
          location: string | null
          meeting_link: string | null
          organizer_email: string | null
          organizer_name: string | null
          raw_data: Json | null
          start_time: string
          sync_status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          calendar_id: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          event_id: string
          id?: string
          is_recurring?: boolean | null
          location?: string | null
          meeting_link?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          raw_data?: Json | null
          start_time: string
          sync_status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendees?: Json | null
          calendar_id?: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          event_id?: string
          id?: string
          is_recurring?: boolean | null
          location?: string | null
          meeting_link?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          raw_data?: Json | null
          start_time?: string
          sync_status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendars: {
        Row: {
          calendar_id: string
          calendar_name: string
          created_at: string | null
          credentials: Json | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          last_synced_at: string | null
          provider: string
          sync_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id: string
          calendar_name: string
          created_at?: string | null
          credentials?: Json | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_synced_at?: string | null
          provider: string
          sync_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string
          calendar_name?: string
          created_at?: string | null
          credentials?: Json | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_synced_at?: string | null
          provider?: string
          sync_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_join_enabled: boolean | null
          avatar_url: string | null
          bot_color: string | null
          created_at: string
          email: string | null
          email_summaries_enabled: boolean | null
          full_name: string | null
          google_calendar_connected: boolean | null
          id: string
          notetaker_name: string | null
          pre_meeting_notification_minutes: number | null
          notification_frequency: string | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          preferred_languages: string[] | null
          recording_preference: string | null
          auto_join_meetings: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_join_enabled?: boolean | null
          avatar_url?: string | null
          bot_color?: string | null
          created_at?: string
          email?: string | null
          email_summaries_enabled?: boolean | null
          full_name?: string | null
          google_calendar_connected?: boolean | null
          id?: string
          notetaker_name?: string | null
          pre_meeting_notification_minutes?: number | null
          notification_frequency?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          preferred_languages?: string[] | null
          recording_preference?: string | null
          auto_join_meetings?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_join_enabled?: boolean | null
          avatar_url?: string | null
          bot_color?: string | null
          created_at?: string
          email?: string | null
          email_summaries_enabled?: boolean | null
          full_name?: string | null
          google_calendar_connected?: boolean | null
          id?: string
          notetaker_name?: string | null
          pre_meeting_notification_minutes?: number | null
          notification_frequency?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          preferred_languages?: string[] | null
          recording_preference?: string | null
          auto_join_meetings?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          content: string
          created_at: string
          id: string
          meeting_id: string
          speakers: Json | null
          word_timestamps: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          meeting_id: string
          speakers?: Json | null
          word_timestamps?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          meeting_id?: string
          speakers?: Json | null
          word_timestamps?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_oauth_tokens: {
        Row: {
          created_at: string
          google_access_token: string | null
          google_refresh_token: string | null
          google_token_expiry: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
