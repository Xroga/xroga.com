export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      messages: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          role: 'user' | 'assistant';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          role: 'user' | 'assistant';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          role?: 'user' | 'assistant';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
