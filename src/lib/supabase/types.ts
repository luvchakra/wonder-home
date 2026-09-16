/**
 * Database types for the WonderHome Supabase project.
 *
 * Regenerate after every migration with:
 *
 *     npm run db:types
 *
 * The placeholder below keeps the clients typed as `Database` while the schema
 * is still empty; `npm run db:types` overwrites this file wholesale.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
