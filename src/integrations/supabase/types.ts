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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          at: string
          detail: string | null
          id: string
          target: string
          user_id: string
          username: string
        }
        Insert: {
          action: string
          at?: string
          detail?: string | null
          id?: string
          target?: string
          user_id: string
          username?: string
        }
        Update: {
          action?: string
          at?: string
          detail?: string | null
          id?: string
          target?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      controlled_dispense: {
        Row: {
          amount: number
          at: string
          batch: string
          cashier: string
          id: string
          patient_name: string
          patient_phone: string | null
          prescriber: string
          prescriber_reg_no: string | null
          prescription_ref: string
          product_id: string | null
          product_name: string
          quantity: number
          user_id: string
        }
        Insert: {
          amount?: number
          at?: string
          batch?: string
          cashier?: string
          id?: string
          patient_name: string
          patient_phone?: string | null
          prescriber: string
          prescriber_reg_no?: string | null
          prescription_ref: string
          product_id?: string | null
          product_name: string
          quantity?: number
          user_id: string
        }
        Update: {
          amount?: number
          at?: string
          batch?: string
          cashier?: string
          id?: string
          patient_name?: string
          patient_phone?: string | null
          prescriber?: string
          prescriber_reg_no?: string | null
          prescription_ref?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          batch: string
          category: string
          controlled: boolean
          cost_price: number
          created_at: string
          description: string | null
          expiry: string | null
          generic: string
          id: string
          image: string | null
          last_restocked: string | null
          nafdac: string
          name: string
          pack_size: string
          quantity: number
          reorder_level: number
          reorder_quantity: number
          selling_price: number
          supplier: string
          supplier_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          batch?: string
          category?: string
          controlled?: boolean
          cost_price?: number
          created_at?: string
          description?: string | null
          expiry?: string | null
          generic?: string
          id?: string
          image?: string | null
          last_restocked?: string | null
          nafdac?: string
          name: string
          pack_size?: string
          quantity?: number
          reorder_level?: number
          reorder_quantity?: number
          selling_price?: number
          supplier?: string
          supplier_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          batch?: string
          category?: string
          controlled?: boolean
          cost_price?: number
          created_at?: string
          description?: string | null
          expiry?: string | null
          generic?: string
          id?: string
          image?: string | null
          last_restocked?: string | null
          nafdac?: string
          name?: string
          pack_size?: string
          quantity?: number
          reorder_level?: number
          reorder_quantity?: number
          selling_price?: number
          supplier?: string
          supplier_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          logo: string | null
          owner_name: string | null
          owner_photo: string | null
          pharmacy_name: string | null
          phone: string | null
          premise_license: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          logo?: string | null
          owner_name?: string | null
          owner_photo?: string | null
          pharmacy_name?: string | null
          phone?: string | null
          premise_license?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          logo?: string | null
          owner_name?: string | null
          owner_photo?: string | null
          pharmacy_name?: string | null
          phone?: string | null
          premise_license?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          cost: number
          id: string
          name: string
          price: number
          product_id: string | null
          qty: number
          sale_id: string
        }
        Insert: {
          cost?: number
          id?: string
          name: string
          price?: number
          product_id?: string | null
          qty?: number
          sale_id: string
        }
        Update: {
          cost?: number
          id?: string
          name?: string
          price?: number
          product_id?: string | null
          qty?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cashier: string
          created_at: string
          customer: string | null
          id: string
          payment: string
          profit: number
          total: number
          user_id: string
        }
        Insert: {
          cashier?: string
          created_at?: string
          customer?: string | null
          id?: string
          payment?: string
          profit?: number
          total?: number
          user_id: string
        }
        Update: {
          cashier?: string
          created_at?: string
          customer?: string | null
          id?: string
          payment?: string
          profit?: number
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
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
