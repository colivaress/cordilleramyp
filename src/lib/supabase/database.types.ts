// Generado con: supabase gen types typescript (vía MCP).
// Regenerar tras cambios de esquema.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      checklist_items: {
        Row: {
          exigencia: string
          key: string
          nombre: string
          orden: number
        }
        Insert: {
          exigencia: string
          key: string
          nombre: string
          orden: number
        }
        Update: {
          exigencia?: string
          key?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      destinatarios_correo: {
        Row: {
          activo: boolean
          cargo: string | null
          email: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          cargo?: string | null
          email: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          cargo?: string | null
          email?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          contenido: string | null
          destinatario: string
          enviado_at: string
          id: string
          ticket_id: string
          tipo: Database["public"]["Enums"]["notificacion_tipo"]
        }
        Insert: {
          contenido?: string | null
          destinatario: string
          enviado_at?: string
          id?: string
          ticket_id: string
          tipo: Database["public"]["Enums"]["notificacion_tipo"]
        }
        Update: {
          contenido?: string | null
          destinatario?: string
          enviado_at?: string
          id?: string
          ticket_id?: string
          tipo?: Database["public"]["Enums"]["notificacion_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      personal: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono: string | null
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ticket_checklist_respuestas: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["item_estado"]
          fecha_vencimiento_item: string | null
          foto_url: string | null
          id: string
          item_key: string
          observacion: string | null
          revision_numero: number
          ticket_id: string
        }
        Insert: {
          created_at?: string
          estado: Database["public"]["Enums"]["item_estado"]
          fecha_vencimiento_item?: string | null
          foto_url?: string | null
          id?: string
          item_key: string
          observacion?: string | null
          revision_numero: number
          ticket_id: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["item_estado"]
          fecha_vencimiento_item?: string | null
          foto_url?: string | null
          id?: string
          item_key?: string
          observacion?: string | null
          revision_numero?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklist_respuestas_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "ticket_checklist_respuestas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklist_respuestas_ticket_id_revision_numero_fkey"
            columns: ["ticket_id", "revision_numero"]
            isOneToOne: false
            referencedRelation: "ticket_revisiones"
            referencedColumns: ["ticket_id", "numero_revision"]
          },
        ]
      }
      ticket_revisiones: {
        Row: {
          created_at: string
          estado_resultante: Database["public"]["Enums"]["ticket_estado"]
          firma_conductor_url: string | null
          firma_fiscalizador_url: string | null
          id: string
          nro_revision_global: number
          numero_revision: number
          supervisor_id: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          estado_resultante: Database["public"]["Enums"]["ticket_estado"]
          firma_conductor_url?: string | null
          firma_fiscalizador_url?: string | null
          id?: string
          nro_revision_global?: never
          numero_revision: number
          supervisor_id?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          estado_resultante?: Database["public"]["Enums"]["ticket_estado"]
          firma_conductor_url?: string | null
          firma_fiscalizador_url?: string | null
          id?: string
          nro_revision_global?: never
          numero_revision?: number
          supervisor_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_revisiones_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_revisiones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          conductor: string
          created_at: string
          estado: Database["public"]["Enums"]["ticket_estado"]
          fecha: string
          fecha_vencimiento: string | null
          id: string
          patente_camion: string
          patente_rampla: string
          procedencia: string
          revision_actual: number
          supervisor_id: string | null
          tipo_camion: string
          transporte: string
          updated_at: string
        }
        Insert: {
          conductor: string
          created_at?: string
          estado?: Database["public"]["Enums"]["ticket_estado"]
          fecha: string
          fecha_vencimiento?: string | null
          id?: string
          patente_camion: string
          patente_rampla: string
          procedencia: string
          revision_actual?: number
          supervisor_id?: string | null
          tipo_camion: string
          transporte: string
          updated_at?: string
        }
        Update: {
          conductor?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["ticket_estado"]
          fecha?: string
          fecha_vencimiento?: string | null
          id?: string
          patente_camion?: string
          patente_rampla?: string
          procedencia?: string
          revision_actual?: number
          supervisor_id?: string | null
          tipo_camion?: string
          transporte?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      item_estado: "conforme" | "no_conforme" | "no_aplica"
      notificacion_tipo: "whatsapp" | "email"
      rol_usuario: "supervisor" | "administrador" | "conductor"
      ticket_estado:
        | "en_revision"
        | "finalizada_con_observaciones"
        | "en_reparacion_de_observaciones"
        | "finalizada_sin_observaciones"
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
    Enums: {
      item_estado: ["conforme", "no_conforme", "no_aplica"],
      notificacion_tipo: ["whatsapp", "email"],
      rol_usuario: ["supervisor", "administrador", "conductor"],
      ticket_estado: [
        "en_revision",
        "finalizada_con_observaciones",
        "en_reparacion_de_observaciones",
        "finalizada_sin_observaciones",
      ],
    },
  },
} as const
