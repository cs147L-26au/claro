export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type UniversalPriorityRow = {
  user_id: string; factor: string; weight: number; sort_order: number;
  name: string; description: string; color: string;
};
export type TaskPriorityRow = UniversalPriorityRow & { task_id: string; excluded: boolean; inherited: boolean };
export type TaskRow = { id: string; user_id: string; title: string; notes: string; due_date: string | null; done: boolean };
export type DecisionRow = {
  id: string; user_id: string; title: string; category: string; choice: string; notes: string;
  alternatives: string[]; review_date: string | null; status: 'active' | 'archived';
  created_at: string; updated_at: string; priorities: Json;
};
export type OptionRow = { id: string; task_id: string; name: string; ratings: Json };
export type PostDecisionTaskRow = {
  id: string; user_id: string; decision_id: string; title: string; notes: string;
  due_date: string; done: boolean; created_at: string;
};
type Table<Row, Insert = Row> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };
/** Feature-owned schema plus the minimal read contracts. Regenerate when teams merge schemas. */
export type Database = {
  public: {
    Tables: {
      universal_priorities: Table<UniversalPriorityRow>;
      task_priorities: Table<TaskPriorityRow>;
      tasks: Table<TaskRow, Pick<TaskRow, 'user_id' | 'title'> & Partial<Omit<TaskRow, 'user_id' | 'title'>>>;
      decisions: Table<DecisionRow>;
      post_decision_tasks: Table<PostDecisionTaskRow, Omit<PostDecisionTaskRow, 'id' | 'created_at' | 'done'> & { id?: string; done?: boolean }>;
      options: Table<OptionRow, Omit<OptionRow, 'id' | 'ratings'> & { id?: string; ratings?: Json }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_task_with_priorities: { Args: { p_task: Json; p_expected_user_id: string; p_factors?: Json }; Returns: string };
      save_priorities: { Args: { p_factors: Json; p_task_id?: string; p_expected_user_id?: string }; Returns: undefined };
      save_app_records: { Args: { p_tasks?: Json; p_decisions?: Json; p_import_only?: boolean; p_expected_user_id: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
