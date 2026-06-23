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
      access_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          fe_id: string
          id: string
          revoked: boolean | null
          ticket_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          fe_id: string
          id?: string
          revoked?: boolean | null
          ticket_id: string
          token_hash: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          fe_id?: string
          id?: string
          revoked?: boolean | null
          ticket_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_fe_id_fkey"
            columns: ["fe_id"]
            isOneToOne: false
            referencedRelation: "field_executives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: []
      }
      configurations: {
        Row: {
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      field_executives: {
        Row: {
          active: boolean | null
          base_location: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          skills: Json | null
        }
        Insert: {
          active?: boolean | null
          base_location?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          skills?: Json | null
        }
        Update: {
          active?: boolean | null
          base_location?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          skills?: Json | null
        }
        Relationships: []
      }
      organisations: {
        Row: {
          created_at: string | null
          id: string
          incoming_emails: Json
          name: string
          outgoing_emails: Json
          slug: string
          spoc_email: string | null
          spoc_name: string | null
          spoc_phone: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          incoming_emails?: Json
          name: string
          outgoing_emails?: Json
          slug: string
          spoc_email?: string | null
          spoc_name?: string | null
          spoc_phone?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          incoming_emails?: Json
          name?: string
          outgoing_emails?: Json
          slug?: string
          spoc_email?: string | null
          spoc_name?: string | null
          spoc_phone?: string | null
          status?: string
        }
        Relationships: []
      }
      parsed_emails: {
        Row: {
          category: string | null
          complaint_id: string | null
          confidence_score: number | null
          created_at: string | null
          id: string
          issue_type: string | null
          location: string | null
          needs_review: boolean | null
          raw_email_id: string
          remarks: string | null
          reported_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          category?: string | null
          complaint_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          issue_type?: string | null
          location?: string | null
          needs_review?: boolean | null
          raw_email_id: string
          remarks?: string | null
          reported_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          category?: string | null
          complaint_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          issue_type?: string | null
          location?: string | null
          needs_review?: boolean | null
          raw_email_id?: string
          remarks?: string | null
          reported_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parsed_emails_raw_email_id_fkey"
            columns: ["raw_email_id"]
            isOneToOne: false
            referencedRelation: "raw_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_emails: {
        Row: {
          created_at: string | null
          from_email: string
          id: string
          message_id: string
          payload: Json
          received_at: string
          subject: string | null
          thread_id: string | null
          ticket_created: boolean | null
          to_email: string
        }
        Insert: {
          created_at?: string | null
          from_email: string
          id?: string
          message_id: string
          payload: Json
          received_at: string
          subject?: string | null
          thread_id?: string | null
          ticket_created?: boolean | null
          to_email: string
        }
        Update: {
          created_at?: string | null
          from_email?: string
          id?: string
          message_id?: string
          payload?: Json
          received_at?: string
          subject?: string | null
          thread_id?: string | null
          ticket_created?: boolean | null
          to_email?: string
        }
        Relationships: []
      }
      sla_tracking: {
        Row: {
          assignment_breached: boolean | null
          assignment_deadline: string | null
          created_at: string | null
          id: string
          onsite_breached: boolean | null
          onsite_deadline: string | null
          resolution_breached: boolean | null
          resolution_deadline: string | null
          ticket_id: string
          updated_at: string | null
        }
        Insert: {
          assignment_breached?: boolean | null
          assignment_deadline?: string | null
          created_at?: string | null
          id?: string
          onsite_breached?: boolean | null
          onsite_deadline?: string | null
          resolution_breached?: boolean | null
          resolution_deadline?: string | null
          ticket_id: string
          updated_at?: string | null
        }
        Update: {
          assignment_breached?: boolean | null
          assignment_deadline?: string | null
          created_at?: string | null
          id?: string
          onsite_breached?: boolean | null
          onsite_deadline?: string | null
          resolution_breached?: boolean | null
          resolution_deadline?: string | null
          ticket_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_tracking_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          fe_id: string
          id: string
          override_reason: string | null
          ticket_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          fe_id: string
          id?: string
          override_reason?: string | null
          ticket_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          fe_id?: string
          id?: string
          override_reason?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_assignments_fe_id_fkey"
            columns: ["fe_id"]
            isOneToOne: false
            referencedRelation: "field_executives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          attachments: Json | null
          author_id: string | null
          body: string | null
          created_at: string | null
          id: string
          source: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          source: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          source?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          category: string | null
          client_slug: string | null
          complaint_id: string | null
          confidence_score: number | null
          created_at: string | null
          current_assignment_id: string | null
          id: string
          issue_type: string | null
          location: string | null
          state: string | null
          needs_review: boolean | null
          opened_at: string | null
          opened_by_email: string | null
          priority: boolean
          priority_level: string
          source: string | null
          status: string
          ticket_number: string
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          category?: string | null
          client_slug?: string | null
          complaint_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          current_assignment_id?: string | null
          id?: string
          issue_type?: string | null
          location?: string | null
          state?: string | null
          needs_review?: boolean | null
          opened_at?: string | null
          opened_by_email?: string | null
          priority?: boolean
          priority_level?: string
          source?: string | null
          status?: string
          ticket_number: string
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          category?: string | null
          client_slug?: string | null
          complaint_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          current_assignment_id?: string | null
          id?: string
          issue_type?: string | null
          location?: string | null
          state?: string | null
          needs_review?: boolean | null
          opened_at?: string | null
          opened_by_email?: string | null
          priority?: boolean
          priority_level?: string
          source?: string | null
          status?: string
          ticket_number?: string
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_assignment"
            columns: ["current_assignment_id"]
            isOneToOne: false
            referencedRelation: "ticket_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean | null
          approval_status: string | null
          auth_id: string | null
          client_slug: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          organisation_id: string | null
          role: string
        }
        Insert: {
          active?: boolean | null
          approval_status?: string | null
          auth_id?: string | null
          client_slug?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          organisation_id?: string | null
          role: string
        }
        Update: {
          active?: boolean | null
          approval_status?: string | null
          auth_id?: string | null
          client_slug?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organisation_id?: string | null
          role?: string
        }
        Relationships: []
      }
      whatsapp_events: {
        Row: {
          created_at: string | null
          event_type: string
          fe_id: string
          id: string
          payload: Json | null
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          fe_id: string
          id?: string
          payload?: Json | null
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          fe_id?: string
          id?: string
          payload?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_events_fe_id_fkey"
            columns: ["fe_id"]
            isOneToOne: false
            referencedRelation: "field_executives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_above: { Args: { _user_id: string }; Returns: boolean }
      user_has_role: {
        Args: { _roles: string[]; _user_id: string }
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
