// The shapes the Sovrns API (https://sovrns.com) sends and expects.
// Written from real responses (2026-11-21). Field names stay exactly as the server sends them.
// This file must stay free of React Native imports: Node runs the API tests against it.

// ---------- Errors ----------

export type ApiErrorDetail = { location: (string | number)[]; type: string };

/** Every error response: `{"error": {"code", "message", "details?"}}`. */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
};

// ---------- Sign-in ----------

/** POST /api/v1/auth/otp/request → 202 */
export type OtpChallenge = {
  challenge_id: string;
  account_type: string;
  /** Seconds until the code expires (300). */
  expires_in: number;
  /** Seconds before a new code may be asked for (60). */
  resend_after: number;
  code_length: number;
  message: string;
};

export type ApiUser = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  user_type?: string | null;
  preferred_language?: string | null;
};

export type ApiOrganisation = {
  id: string;
  name: string;
  code?: string;
  timezone?: string;
};

/** Today's question allowance. */
export type ApiAssistant = {
  enabled: boolean;
  questions_per_day: number;
  questions_used_today: number;
  questions_left_today: number;
  questions_per_minute: number;
};

/** What this account may send. */
export type ApiFeatures = {
  text: boolean;
  images: boolean;
  /** Most pictures in one question (50). */
  document_pages_max: number;
  /** Largest picture in bytes (4 194 304). */
  image_bytes_max: number;
  image_types: string[];
  audio_questions: boolean;
  voice_replies: boolean;
};

/** GET /api/v1/me */
export type SessionInfo = {
  account_type: string;
  user: ApiUser;
  organisation: ApiOrganisation;
  assistant: ApiAssistant;
  features: ApiFeatures;
};

/** POST /api/v1/auth/otp/verify */
export type VerifyResponse = SessionInfo & {
  access_token: string;
  token_type: string;
  expires_at: string;
};

// ---------- Asking ----------

export type AskImage = { media_type: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };

export type AskAudio = { media_type: string; base64: string };

/** POST /ask. Send at least one of question, image or audio. */
export type AskBody = {
  question?: string;
  chat_id?: string;
  /** The first picture (or page 1 of a document). */
  image?: AskImage;
  /** Pictures 2 and up (at most 50 pictures in all). */
  more_images?: AskImage[];
  audio?: AskAudio;
  /** Ask for a spoken answer as well. */
  reply_as?: 'voice';
};

export type VoiceReply = { media_type: string; base64: string };

export type AskResponse = {
  request_id: string;
  chat_id: string;
  /** The answer's message id. */
  message_id: string;
  status: string;
  answer: string;
  finish_reason: string | null;
  quality_score: number | null;
  billing_units?: number;
  context?: { history_message_count: number; trimmed_for_budget: boolean };
  /** What was said, for a voice question. */
  transcript: string | null;
  voice_reply: VoiceReply | null;
};

// ---------- Chat history ----------

export type ChatSummary = {
  id: string;
  title: string;
  origin?: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  can_continue: boolean;
  message_count?: number;
  last_message_role?: 'user' | 'assistant' | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

/** GET /api/v1/chats */
export type ChatListResponse = { items: ChatSummary[]; next_cursor: string | null };

export type ServerMessage = {
  id: string;
  sequence_no: number;
  role: 'user' | 'assistant';
  /** "text" or "image_with_text". */
  content_kind: string;
  created_at: string;
  text: string | null;
  unavailable: string | null;
  request_id: string | null;
  request_status: string | null;
  error_code: string | null;
  quality_score: number | null;
  attachment_count: number;
};

/** GET /api/v1/chats/{id}/messages. Items are oldest → newest. */
export type MessagesResponse = {
  chat: ChatSummary;
  items: ServerMessage[];
  /** Pass as `before` to get older messages. null when there are none. */
  next_before: number | null;
};
