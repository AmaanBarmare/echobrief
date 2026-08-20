export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  source: 'google_meet' | 'zoom' | 'teams' | 'manual' | 'calendar';
  calendar_event_id?: string;
  meeting_link?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  status: 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed' | 'cancelled';
  audio_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  content: string;
  speakers: Speaker[];
  word_timestamps: WordTimestamp[];
  created_at: string;
}

export interface Speaker {
  id: string;
  name: string;
  segments: number[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  speaker_id?: string;
}

export interface StrategicInsight {
  insight: string;
  category: 'market' | 'risk' | 'opportunity' | 'process';
}

export interface SpeakerHighlight {
  speaker: string;
  highlight: string;
  context: string;
}

export interface ActionItem {
  task: string;
  owner?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  confidence?: 'low' | 'medium' | 'high';
  outcome?: string;
  source_timestamp?: number;
}

export interface FollowUp {
  description: string;
  assignee?: string;
  deadline?: string;
  type?: 'meeting' | 'research' | 'validation';
}

export interface TimelineEntry {
  timestamp: number;
  type: 'topic' | 'question' | 'decision' | 'action' | 'risk';
  content: string;
  speaker?: string;
}

export interface SpeakerStat {
  speaker: string;
  /** Share of total speech (speakers sum to 100), NOT of wall-clock. */
  percentage: number;
  seconds?: number;
  /** Legacy key from rows written when GPT estimated these numbers. */
  duration_seconds?: number;
  turns?: number;
  questions?: number;
}

/**
 * Mirrors ConversationMetrics from supabase/functions/_shared/metrics.ts, plus
 * sentiment_score, which is still a model judgment. Every field is optional
 * because rows written before the computed pipeline lack them.
 */
export interface MeetingMetrics {
  sentiment_score?: number;
  speaker_participation?: SpeakerStat[];
  total_speaking_seconds?: number;
  silence_percentage?: number;
  turn_count?: number;
  longest_monologue_seconds?: number;
  longest_monologue_speaker?: string | null;
  participation_balance?: number;
}

export interface MeetingInsights {
  id: string;
  meeting_id: string;
  summary_short: string;
  summary_detailed: string;
  key_points: string[];
  action_items: ActionItem[];
  decisions: string[];
  risks: string[];
  follow_ups: FollowUp[];
  strategic_insights: StrategicInsight[];
  speaker_highlights: SpeakerHighlight[];
  open_questions: string[];
  timeline_entries?: TimelineEntry[];
  meeting_metrics?: MeetingMetrics;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  google_calendar_connected: boolean;
  auto_join_enabled?: boolean;
  notetaker_name?: string;
  pre_meeting_notification_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface MeetingWithDetails extends Meeting {
  transcript?: Transcript;
  insights?: MeetingInsights;
}
