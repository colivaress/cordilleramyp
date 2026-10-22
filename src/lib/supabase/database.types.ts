// Generado con: supabase gen types typescript --local (CLI, no MCP — el MCP
// lee del proyecto remoto, y a esta fecha la migración de administrador_contrato
// aún no está aplicada ahí). Regenerar tras cambios de esquema.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      checklist_items: {
        Row: {
          activo: boolean
          exigencia: string | null
          fotos_maximas: number | null
          fotos_requeridas: number | null
          key: string
          modo: Database["public"]["Enums"]["item_modo"]
          nombre: string
          orden: number
          tipo: string
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          exigencia?: string | null
          fotos_maximas?: number | null
          fotos_requeridas?: number | null
          key: string
          modo?: Database["public"]["Enums"]["item_modo"]
          nombre: string
          orden: number
          tipo: string
        }
        Update: {
          activo?: boolean
          exigencia?: string | null
          fotos_maximas?: number | null
          fotos_requeridas?: number | null
          key?: string
          modo?: Database["public"]["Enums"]["item_modo"]
          nombre?: string
          orden?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_tipo_fkey"
            columns: ["tipo"]
            isOneToOne: false
            referencedRelation: "tipos_inspeccion"
            referencedColumns: ["clave"]
          },
        ]
      }
      cotizaciones_fletes: {
        Row: {
          acuse_enviado: boolean
          apellido: string
          comentarios: string | null
          correo: string
          correo_interno_enviado: boolean
          cotizacion_enviada_at: string | null
          cotizada_at: string | null
          cotizada_por: string | null
          created_at: string
          destino_calle: string
          destino_comuna: string
          destino_region: string
          direccion_comercial: string | null
          estado: Database["public"]["Enums"]["cotizacion_estado"]
          fecha_estimada: string
          giro: string | null
          id: string
          ip_solicitante: string | null
          nombre: string
          numero_solicitud: number
          observaciones_cotizacion: string | null
          origen_calle: string
          origen_comuna: string
          origen_region: string
          peso: string
          razon_social: string | null
          requiere_encarpe: boolean
          rut: string
          rut_empresa: string | null
          telefono: string
          tiene_whatsapp: boolean
          tipo_carga: string
          tipo_solicitante: Database["public"]["Enums"]["cotizacion_solicitante"]
          validez_dias: number | null
          valor_neto: number | null
        }
        ComputedFields: never
        Insert: {
          acuse_enviado?: boolean
          apellido: string
          comentarios?: string | null
          correo: string
          correo_interno_enviado?: boolean
          cotizacion_enviada_at?: string | null
          cotizada_at?: string | null
          cotizada_por?: string | null
          created_at?: string
          destino_calle: string
          destino_comuna: string
          destino_region: string
          direccion_comercial?: string | null
          estado?: Database["public"]["Enums"]["cotizacion_estado"]
          fecha_estimada: string
          giro?: string | null
          id?: string
          ip_solicitante?: string | null
          nombre: string
          numero_solicitud?: never
          observaciones_cotizacion?: string | null
          origen_calle: string
          origen_comuna: string
          origen_region: string
          peso: string
          razon_social?: string | null
          requiere_encarpe: boolean
          rut: string
          rut_empresa?: string | null
          telefono: string
          tiene_whatsapp?: boolean
          tipo_carga: string
          tipo_solicitante: Database["public"]["Enums"]["cotizacion_solicitante"]
          validez_dias?: number | null
          valor_neto?: number | null
        }
        Update: {
          acuse_enviado?: boolean
          apellido?: string
          comentarios?: string | null
          correo?: string
          correo_interno_enviado?: boolean
          cotizacion_enviada_at?: string | null
          cotizada_at?: string | null
          cotizada_por?: string | null
          created_at?: string
          destino_calle?: string
          destino_comuna?: string
          destino_region?: string
          direccion_comercial?: string | null
          estado?: Database["public"]["Enums"]["cotizacion_estado"]
          fecha_estimada?: string
          giro?: string | null
          id?: string
          ip_solicitante?: string | null
          nombre?: string
          numero_solicitud?: never
          observaciones_cotizacion?: string | null
          origen_calle?: string
          origen_comuna?: string
          origen_region?: string
          peso?: string
          razon_social?: string | null
          requiere_encarpe?: boolean
          rut?: string
          rut_empresa?: string | null
          telefono?: string
          tiene_whatsapp?: boolean
          tipo_carga?: string
          tipo_solicitante?: Database["public"]["Enums"]["cotizacion_solicitante"]
          validez_dias?: number | null
          valor_neto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_fletes_cotizada_por_fkey"
            columns: ["cotizada_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      destinatarios_correo: {
        Row: {
          activo: boolean
          cargo: string | null
          email: string
          id: string
          nombre: string
        }
        ComputedFields: never
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
      destinatarios_correo_tipos: {
        Row: {
          destinatario_id: string
          recibe_informes: boolean
          recibe_vencimientos: boolean
          tipo_inspeccion: string
        }
        ComputedFields: never
        Insert: {
          destinatario_id: string
          recibe_informes?: boolean
          recibe_vencimientos?: boolean
          tipo_inspeccion: string
        }
        Update: {
          destinatario_id?: string
          recibe_informes?: boolean
          recibe_vencimientos?: boolean
          tipo_inspeccion?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinatarios_correo_tipos_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios_correo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destinatarios_correo_tipos_tipo_inspeccion_fkey"
            columns: ["tipo_inspeccion"]
            isOneToOne: false
            referencedRelation: "tipos_inspeccion"
            referencedColumns: ["clave"]
          },
        ]
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
        ComputedFields: never
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
          apellido: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_relacion: string | null
          contacto_emergencia_telefono: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          rut: string | null
          telefono: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          apellido?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_relacion?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          rut?: string | null
          telefono?: string | null
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          apellido?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_relacion?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          rut?: string | null
          telefono?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      personal_tipos_inspeccion: {
        Row: {
          personal_id: string
          tipo_inspeccion: string
        }
        ComputedFields: never
        Insert: {
          personal_id: string
          tipo_inspeccion: string
        }
        Update: {
          personal_id?: string
          tipo_inspeccion?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_tipos_inspeccion_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_tipos_inspeccion_tipo_inspeccion_fkey"
            columns: ["tipo_inspeccion"]
            isOneToOne: false
            referencedRelation: "tipos_inspeccion"
            referencedColumns: ["clave"]
          },
        ]
      }
      rrhh_afp_periodo: {
        Row: {
          afp: Database["public"]["Enums"]["rrhh_afp"]
          anio: number
          comision: number
          mes: number
        }
        ComputedFields: never
        Insert: {
          afp: Database["public"]["Enums"]["rrhh_afp"]
          anio: number
          comision: number
          mes: number
        }
        Update: {
          afp?: Database["public"]["Enums"]["rrhh_afp"]
          anio?: number
          comision?: number
          mes?: number
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_afp_periodo_anio_mes_fkey"
            columns: ["anio", "mes"]
            isOneToOne: false
            referencedRelation: "rrhh_parametros_periodo"
            referencedColumns: ["anio", "mes"]
          },
        ]
      }
      rrhh_cargos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          orden: number
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      rrhh_documentos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mime: string
          nombre_archivo: string
          personal_id: string
          ruta: string
          tamano_bytes: number
          tipo_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mime: string
          nombre_archivo: string
          personal_id: string
          ruta: string
          tamano_bytes: number
          tipo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mime?: string
          nombre_archivo?: string
          personal_id?: string
          ruta?: string
          tamano_bytes?: number
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_documentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_documentos_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_documentos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "rrhh_tipos_documento"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_faenas: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          orden: number
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      rrhh_fichas: {
        Row: {
          afecto_afc: boolean
          afp: Database["public"]["Enums"]["rrhh_afp"]
          cargas_familiares: number
          cargo_id: string
          created_at: string
          faena_id: string | null
          fecha_desvinculacion: string | null
          fecha_ingreso: string
          fecha_termino_contrato: string | null
          isapre: string | null
          motivo_desvinculacion: string | null
          personal_id: string
          plan_isapre_uf: number | null
          sistema_salud: Database["public"]["Enums"]["rrhh_sistema_salud"]
          tipo_contrato: Database["public"]["Enums"]["rrhh_tipo_contrato"]
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          afecto_afc?: boolean
          afp: Database["public"]["Enums"]["rrhh_afp"]
          cargas_familiares?: number
          cargo_id: string
          created_at?: string
          faena_id?: string | null
          fecha_desvinculacion?: string | null
          fecha_ingreso: string
          fecha_termino_contrato?: string | null
          isapre?: string | null
          motivo_desvinculacion?: string | null
          personal_id: string
          plan_isapre_uf?: number | null
          sistema_salud: Database["public"]["Enums"]["rrhh_sistema_salud"]
          tipo_contrato: Database["public"]["Enums"]["rrhh_tipo_contrato"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          afecto_afc?: boolean
          afp?: Database["public"]["Enums"]["rrhh_afp"]
          cargas_familiares?: number
          cargo_id?: string
          created_at?: string
          faena_id?: string | null
          fecha_desvinculacion?: string | null
          fecha_ingreso?: string
          fecha_termino_contrato?: string | null
          isapre?: string | null
          motivo_desvinculacion?: string | null
          personal_id?: string
          plan_isapre_uf?: number | null
          sistema_salud?: Database["public"]["Enums"]["rrhh_sistema_salud"]
          tipo_contrato?: Database["public"]["Enums"]["rrhh_tipo_contrato"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_fichas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "rrhh_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_fichas_faena_id_fkey"
            columns: ["faena_id"]
            isOneToOne: false
            referencedRelation: "rrhh_faenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_fichas_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: true
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_fichas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_jornada_trabajador: {
        Row: {
          anulada_en: string | null
          anulada_por: string | null
          created_at: string
          created_by: string | null
          id: string
          jornada_id: string
          motivo_cambio: string | null
          personal_id: string
          updated_at: string | null
          updated_by: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        ComputedFields: never
        Insert: {
          anulada_en?: string | null
          anulada_por?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jornada_id: string
          motivo_cambio?: string | null
          personal_id: string
          updated_at?: string | null
          updated_by?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          anulada_en?: string | null
          anulada_por?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jornada_id?: string
          motivo_cambio?: string | null
          personal_id?: string
          updated_at?: string | null
          updated_by?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_jornada_trabajador_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "rrhh_jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_jornada_trabajador_cambios: {
        Row: {
          accion: string
          asignacion_id: string
          hecho_en: string
          hecho_por: string | null
          id: string
          jornada_id: string
          motivo: string | null
          personal_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        ComputedFields: never
        Insert: {
          accion: string
          asignacion_id: string
          hecho_en?: string
          hecho_por?: string | null
          id?: string
          jornada_id: string
          motivo?: string | null
          personal_id: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          accion?: string
          asignacion_id?: string
          hecho_en?: string
          hecho_por?: string | null
          id?: string
          jornada_id?: string
          motivo?: string | null
          personal_id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_jornada_trabajador_cambios_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "rrhh_jornada_trabajador"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_cambios_hecho_por_fkey"
            columns: ["hecho_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_cambios_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "rrhh_jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_jornada_trabajador_cambios_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_jornadas: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          dias: NonNullable<Json>
          id: string
          nombre: string
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          dias: NonNullable<Json>
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          dias?: NonNullable<Json>
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_jornadas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_mutual_adicional: {
        Row: {
          created_at: string
          id: string
          tasa: number
          updated_by: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          tasa: number
          updated_by?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          tasa?: number
          updated_by?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_mutual_adicional_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_parametros_periodo: {
        Row: {
          anio: number
          created_at: string
          imm: number
          jornada_ordinaria_horas: number | null
          mes: number
          tasa_afc_empleador_indefinido: number
          tasa_afc_empleador_plazo_fijo: number
          tasa_afc_trabajador_indefinido: number
          tasa_afp_obligatoria: number
          tasa_expectativa_vida: number
          tasa_mutual_base: number
          tasa_rentabilidad_protegida: number
          tasa_salud_minima: number
          tasa_sis: number
          tope_imponible_afc_uf: number
          tope_imponible_afp_uf: number
          tramos_asignacion_familiar: NonNullable<Json>
          tramos_impuesto: NonNullable<Json>
          uf_mes: number
          uf_mes_anterior: number
          updated_at: string
          updated_by: string | null
          utm: number
        }
        ComputedFields: never
        Insert: {
          anio: number
          created_at?: string
          imm: number
          jornada_ordinaria_horas?: number | null
          mes: number
          tasa_afc_empleador_indefinido: number
          tasa_afc_empleador_plazo_fijo: number
          tasa_afc_trabajador_indefinido: number
          tasa_afp_obligatoria: number
          tasa_expectativa_vida: number
          tasa_mutual_base: number
          tasa_rentabilidad_protegida: number
          tasa_salud_minima: number
          tasa_sis: number
          tope_imponible_afc_uf: number
          tope_imponible_afp_uf: number
          tramos_asignacion_familiar: NonNullable<Json>
          tramos_impuesto: NonNullable<Json>
          uf_mes: number
          uf_mes_anterior: number
          updated_at?: string
          updated_by?: string | null
          utm: number
        }
        Update: {
          anio?: number
          created_at?: string
          imm?: number
          jornada_ordinaria_horas?: number | null
          mes?: number
          tasa_afc_empleador_indefinido?: number
          tasa_afc_empleador_plazo_fijo?: number
          tasa_afc_trabajador_indefinido?: number
          tasa_afp_obligatoria?: number
          tasa_expectativa_vida?: number
          tasa_mutual_base?: number
          tasa_rentabilidad_protegida?: number
          tasa_salud_minima?: number
          tasa_sis?: number
          tope_imponible_afc_uf?: number
          tope_imponible_afp_uf?: number
          tramos_asignacion_familiar?: NonNullable<Json>
          tramos_impuesto?: NonNullable<Json>
          uf_mes?: number
          uf_mes_anterior?: number
          updated_at?: string
          updated_by?: string | null
          utm?: number
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_parametros_periodo_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_remuneracion_base: {
        Row: {
          colacion: number
          comentario: string | null
          created_at: string
          created_by: string | null
          id: string
          liquido_pactado: number
          movilizacion: number
          personal_id: string
          vigente_desde: string
        }
        ComputedFields: never
        Insert: {
          colacion?: number
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          liquido_pactado: number
          movilizacion?: number
          personal_id: string
          vigente_desde: string
        }
        Update: {
          colacion?: number
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          liquido_pactado?: number
          movilizacion?: number
          personal_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "rrhh_remuneracion_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_remuneracion_base_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_tipos_documento: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          orden: number
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      ticket_checklist_fotos: {
        Row: {
          created_at: string
          id: string
          orden: number
          respuesta_id: string
          url: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          orden?: number
          respuesta_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          orden?: number
          respuesta_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklist_fotos_respuesta_id_fkey"
            columns: ["respuesta_id"]
            isOneToOne: false
            referencedRelation: "ticket_checklist_respuestas"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_checklist_respuestas: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["item_estado"] | null
          foto_url: string | null
          id: string
          item_key: string
          item_modo: Database["public"]["Enums"]["item_modo"]
          item_nombre: string
          item_orden: number
          observacion: string | null
          revision_numero: number
          ticket_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["item_estado"] | null
          foto_url?: string | null
          id?: string
          item_key: string
          // Opcionales a mano: los completa el trigger que congela el ítem
          // al insertar (migración 20261009010000). El generador los marca
          // obligatorios porque son NOT NULL sin default.
          item_modo?: Database["public"]["Enums"]["item_modo"]
          item_nombre?: string
          item_orden?: number
          observacion?: string | null
          revision_numero: number
          ticket_id: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["item_estado"] | null
          foto_url?: string | null
          id?: string
          item_key?: string
          item_modo?: Database["public"]["Enums"]["item_modo"]
          item_nombre?: string
          item_orden?: number
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
          conductor: string | null
          created_at: string
          estado_resultante: Database["public"]["Enums"]["ticket_estado"]
          fecha_vencimiento: string | null
          firma_conductor_url: string | null
          firma_fiscalizador_url: string | null
          id: string
          nro_revision_global: number
          numero_revision: number
          observacion_general: string | null
          supervisor_id: string | null
          ticket_id: string
        }
        ComputedFields: never
        Insert: {
          conductor?: string | null
          created_at?: string
          estado_resultante: Database["public"]["Enums"]["ticket_estado"]
          fecha_vencimiento?: string | null
          firma_conductor_url?: string | null
          firma_fiscalizador_url?: string | null
          id?: string
          nro_revision_global?: never
          numero_revision: number
          observacion_general?: string | null
          supervisor_id?: string | null
          ticket_id: string
        }
        Update: {
          conductor?: string | null
          created_at?: string
          estado_resultante?: Database["public"]["Enums"]["ticket_estado"]
          fecha_vencimiento?: string | null
          firma_conductor_url?: string | null
          firma_fiscalizador_url?: string | null
          id?: string
          nro_revision_global?: never
          numero_revision?: number
          observacion_general?: string | null
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
          alerta_admin_24h_enviada: boolean
          alerta_admin_48h_enviada: boolean
          alerta_admin_vencido_enviada: boolean
          alerta_naranja_enviada: boolean
          conductor: string
          created_at: string
          estado: Database["public"]["Enums"]["ticket_estado"]
          fecha: string
          fecha_vencimiento: string | null
          id: string
          nombre_encarpador: string | null
          nombre_guardia: string | null
          nro_contenedor: string | null
          numero_inspeccion: number
          patente_camion: string
          patente_rampla: string
          procedencia: string | null
          revision_actual: number
          supervisor_id: string | null
          tipo_camion: string
          tipo_inspeccion: string
          transporte: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          alerta_admin_24h_enviada?: boolean
          alerta_admin_48h_enviada?: boolean
          alerta_admin_vencido_enviada?: boolean
          alerta_naranja_enviada?: boolean
          conductor: string
          created_at?: string
          estado?: Database["public"]["Enums"]["ticket_estado"]
          fecha: string
          fecha_vencimiento?: string | null
          id?: string
          nombre_encarpador?: string | null
          nombre_guardia?: string | null
          nro_contenedor?: string | null
          numero_inspeccion?: never
          patente_camion: string
          patente_rampla: string
          procedencia?: string | null
          revision_actual?: number
          supervisor_id?: string | null
          tipo_camion: string
          tipo_inspeccion: string
          transporte: string
          updated_at?: string
        }
        Update: {
          alerta_admin_24h_enviada?: boolean
          alerta_admin_48h_enviada?: boolean
          alerta_admin_vencido_enviada?: boolean
          alerta_naranja_enviada?: boolean
          conductor?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["ticket_estado"]
          fecha?: string
          fecha_vencimiento?: string | null
          id?: string
          nombre_encarpador?: string | null
          nombre_guardia?: string | null
          nro_contenedor?: string | null
          numero_inspeccion?: never
          patente_camion?: string
          patente_rampla?: string
          procedencia?: string | null
          revision_actual?: number
          supervisor_id?: string | null
          tipo_camion?: string
          tipo_inspeccion?: string
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
          {
            foreignKeyName: "tickets_tipo_inspeccion_fkey"
            columns: ["tipo_inspeccion"]
            isOneToOne: false
            referencedRelation: "tipos_inspeccion"
            referencedColumns: ["clave"]
          },
        ]
      }
      tipos_inspeccion: {
        Row: {
          activo: boolean
          clave: string
          titulo: string
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          clave: string
          titulo: string
        }
        Update: {
          activo?: boolean
          clave?: string
          titulo?: string
        }
        Relationships: []
      }
      transportes: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
    }
    Views: {
      rrhh_historial_sueldo: {
        Row: {
          colacion: number | null
          colacion_anterior: number | null
          comentario: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          liquido_pactado: number | null
          liquido_pactado_anterior: number | null
          movilizacion: number | null
          movilizacion_anterior: number | null
          personal_id: string | null
          vigente_desde: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "rrhh_remuneracion_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rrhh_remuneracion_base_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      contar_tickets_con_patente_exacta: {
        Args: { p_patente_normalizada: string }
        Returns: number
      }
      estado_acceso_personal: {
        Args: Record<PropertyKey, never>
        Returns: {
          alguna_vez_inicio_sesion: boolean
          personal_id: string
        }[]
      }
      rrhh_contactos_emergencia: {
        Args: Record<PropertyKey, never>
        Returns: {
          nombre: string
          personal_id: string
          relacion: string
          telefono: string
        }[]
      }
      rrhh_desvincular: {
        Args: { p_fecha: string; p_motivo: string; p_personal_id: string }
        Returns: undefined
      }
      rrhh_reincorporar: { Args: { p_personal_id: string }; Returns: undefined }
      rrhh_ruts: {
        Args: Record<PropertyKey, never>
        Returns: {
          personal_id: string
          rut: string
        }[]
      }
    }
    Enums: {
      cotizacion_estado: "nueva" | "cotizada" | "ganada" | "perdida"
      cotizacion_solicitante: "particular" | "empresa"
      item_estado: "conforme" | "no_conforme" | "no_aplica"
      item_modo: "estado" | "fotos"
      notificacion_tipo: "whatsapp" | "email"
      rol_usuario:
        | "supervisor"
        | "administrador"
        | "conductor"
        | "administrador_contrato"
        | "trabajador"
      rrhh_afp:
        | "capital"
        | "cuprum"
        | "habitat"
        | "modelo"
        | "planvital"
        | "provida"
        | "uno"
      rrhh_sistema_salud: "fonasa" | "isapre"
      rrhh_tipo_contrato: "indefinido" | "plazo_fijo" | "obra_faena"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cotizacion_estado: ["nueva", "cotizada", "ganada", "perdida"],
      cotizacion_solicitante: ["particular", "empresa"],
      item_estado: ["conforme", "no_conforme", "no_aplica"],
      item_modo: ["estado", "fotos"],
      notificacion_tipo: ["whatsapp", "email"],
      rol_usuario: [
        "supervisor",
        "administrador",
        "conductor",
        "administrador_contrato",
        "trabajador",
      ],
      rrhh_afp: [
        "capital",
        "cuprum",
        "habitat",
        "modelo",
        "planvital",
        "provida",
        "uno",
      ],
      rrhh_sistema_salud: ["fonasa", "isapre"],
      rrhh_tipo_contrato: ["indefinido", "plazo_fijo", "obra_faena"],
      ticket_estado: [
        "en_revision",
        "finalizada_con_observaciones",
        "en_reparacion_de_observaciones",
        "finalizada_sin_observaciones",
      ],
    },
  },
} as const
