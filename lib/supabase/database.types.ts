// 自動生成ファイル。手で編集しない。
// マイグレーションを変更したら `npm run db:types` で再生成してコミットする(CI が差分を検出する)。
// 仕様書: docs/specs/G-114_Supabaseデータベース型の生成とずれの検出.md

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      google_tokens: {
        Row: {
          created_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pro_interest_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          onboarded_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          onboarded_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          onboarded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh_key: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh_key: string
          timezone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh_key?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_exceptions: {
        Row: {
          created_at: string
          id: string
          occurrence_date: string
          rule_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          occurrence_date: string
          rule_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          occurrence_date?: string
          rule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_exceptions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_exceptions_rule_owner_fk"
            columns: ["rule_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      recurring_rule_pauses: {
        Row: {
          ends_on: string | null
          id: string
          rule_id: string
          starts_on: string
          user_id: string
        }
        Insert: {
          ends_on?: string | null
          id?: string
          rule_id: string
          starts_on: string
          user_id: string
        }
        Update: {
          ends_on?: string | null
          id?: string
          rule_id?: string
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rule_pauses_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          auto_adjust_enabled: boolean
          created_at: string
          end_time: string
          ends_on: string | null
          id: string
          inactivity_since: string
          last_learned_at: string | null
          origin: string
          pattern: string
          pause_review_after: string | null
          start_time: string
          starts_on: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
          weekdays: number[] | null
        }
        Insert: {
          auto_adjust_enabled?: boolean
          created_at?: string
          end_time: string
          ends_on?: string | null
          id?: string
          inactivity_since?: string
          last_learned_at?: string | null
          origin?: string
          pattern: string
          pause_review_after?: string | null
          start_time: string
          starts_on: string
          timezone: string
          title: string
          updated_at?: string
          user_id: string
          weekdays?: number[] | null
        }
        Update: {
          auto_adjust_enabled?: boolean
          created_at?: string
          end_time?: string
          ends_on?: string | null
          id?: string
          inactivity_since?: string
          last_learned_at?: string | null
          origin?: string
          pattern?: string
          pause_review_after?: string | null
          start_time?: string
          starts_on?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[] | null
        }
        Relationships: []
      }
      synced_events: {
        Row: {
          end_at: string
          google_event_id: string
          id: string
          source: string
          span: unknown
          start_at: string
          synced_at: string
          title: string
          user_id: string
        }
        Insert: {
          end_at: string
          google_event_id: string
          id?: string
          source?: string
          span?: unknown
          start_at: string
          synced_at?: string
          title?: string
          user_id: string
        }
        Update: {
          end_at?: string
          google_event_id?: string
          id?: string
          source?: string
          span?: unknown
          start_at?: string
          synced_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          created_at: string
          end_at: string | null
          google_event_id: string | null
          id: string
          span: unknown
          stale_notified_at: string | null
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          google_event_id?: string | null
          id?: string
          span?: unknown
          stale_notified_at?: string | null
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_at?: string | null
          google_event_id?: string | null
          id?: string
          span?: unknown
          stale_notified_at?: string | null
          start_at?: string
          title?: string
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
      analytics_security_health: { Args: never; Returns: boolean }
      apply_recurring_rule_learning: {
        Args: {
          p_new_end: string
          p_new_start: string
          p_now?: string
          p_previous_end: string
          p_previous_start: string
          p_rule_id: string
        }
        Returns: boolean
      }
      get_recurring_pause_suggestions: {
        Args: { p_now?: string }
        Returns: {
          last_recorded_at: string
          missed_count: number
          rule_id: string
          timezone: string
          title: string
        }[]
      }
      record_pro_interest_limited: {
        Args: { p_event_type: string; p_source_key: string }
        Returns: {
          allowed: boolean
          retry_after: number
        }[]
      }
      set_recurring_rule_pause: {
        Args: { p_action: string; p_rule_id: string }
        Returns: boolean
      }
      start_timer: {
        Args: { p_google_event_id?: string; p_title: string }
        Returns: undefined
      }
      stop_timer: { Args: never; Returns: undefined }
      update_recurring_rule: {
        Args: {
          p_end_time: string
          p_ends_on: string
          p_pattern: string
          p_rule_id: string
          p_start_time: string
          p_starts_on: string
          p_threshold: string
          p_timezone: string
          p_title: string
          p_today: string
          p_weekdays: number[]
        }
        Returns: boolean
      }
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

