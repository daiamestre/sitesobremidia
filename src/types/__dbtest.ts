import type { Database } from '@/integrations/supabase/types';
import type { CommerceTables, CommerceFunctions, CommerceDatabase } from '@/types/customerPortalDb';

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[];
};
type GenericSchema = {
  Tables: Record<string, GenericTable>;
  Views: Record<string, { Row: Record<string, unknown>; Relationships: unknown[] }>;
  Functions: Record<string, { Args: Record<string, unknown> | never; Returns: unknown }>;
};

type T1 = Database['public']['Tables'] extends Record<string, GenericTable> ? true : false;
type T2 = CommerceTables extends Record<string, GenericTable> ? true : false;
type T3 = (Database['public']['Tables'] & CommerceTables) extends Record<string, GenericTable> ? true : false;
type T4 = Database['public']['Views'] extends Record<string, { Row: Record<string, unknown>; Relationships: unknown[] }> ? true : false;
type T5 = Database['public']['Functions'] extends Record<string, { Args: Record<string, unknown> | never; Returns: unknown }> ? true : false;
type T6 = CommerceFunctions extends Record<string, { Args: Record<string, unknown> | never; Returns: unknown }> ? true : false;
type T7 = (Database['public']['Functions'] & CommerceFunctions) extends Record<string, { Args: Record<string, unknown> | never; Returns: unknown }> ? true : false;
type T8 = CommerceDatabase['public'] extends GenericSchema ? true : false;

declare const a: [T1, T2, T3, T4, T5, T6, T7, T8];
const result: (string | boolean)[][] = [[a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]]];
void result;

export {};