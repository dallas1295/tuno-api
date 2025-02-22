export interface NoteStats {
  total: number;
  archived: number;
  pinned: number;
  tag_counts: { [key: string]: number };
}

export interface TodoStats {
  total: number;
  archived: number;
  completed: number;
}

export interface ActivityStats {
  lastActive: Date;
  createdAt: Date;
  totalSessions: number;
}
