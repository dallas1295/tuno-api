export interface Note {
  note_id: string; // not optional
  user_id: string;
  title: string;
  content: string; // not optional
  created_at: Date;
  updated_at: Date;
  tags?: string[];
  is_pinned: boolean;
  is_archived: boolean;
  pinned_position?: number;
  search_score?: number;
}
