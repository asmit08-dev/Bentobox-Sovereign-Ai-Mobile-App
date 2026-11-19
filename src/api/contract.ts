// The contract between the app and the backend.
//
// The app only knows these shapes. Today a small mock backend (src/app/api/*+api.ts)
// answers them with Claude. When the real backend is ready, it must speak this same
// contract, or src/api/client.ts must map its format to these types. No screen or
// store needs to change.

// ---------- POST /api/chat ----------

/** The whole conversation so far. The backend is stateless: the app sends it every time. */
export type ChatRequest = {
  messages: ChatTurn[];
};

export type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  /** Files the user attached to this turn (user turns only). */
  attachments?: TurnAttachment[];
  /** Pictures the assistant made in this turn. Only the description is sent back. */
  createdImages?: { alt: string }[];
};

/** A file inside a request. Images are always JPEG after the app shrinks them. */
export type TurnAttachment =
  | { kind: 'image'; name: string; mimeType: 'image/jpeg'; data: string }
  | { kind: 'pdf'; name: string; data: string }
  | { kind: 'text'; name: string; text: string };

/**
 * The answer streams back as Server-Sent Events.
 * Each event is one line: `data: {json}` followed by an empty line.
 */
export type ChatEvent =
  | { type: 'status'; status: 'thinking' | 'creating_image' }
  | { type: 'text'; delta: string }
  | { type: 'image'; image: CreatedImage }
  | { type: 'done'; finish: ChatFinish }
  | { type: 'error'; message: string };

/** complete: a normal end. length: the answer hit its size limit. refused: the AI declined. */
export type ChatFinish = 'complete' | 'length' | 'refused';

/** A picture the assistant made. Either SVG markup (mock backend) or a link (real backend). */
export type CreatedImage = {
  id: string;
  alt: string;
  svg?: string;
  url?: string;
  width?: number;
  height?: number;
};

// ---------- GET /api/capabilities ----------

/** What the backend can do. The app hides controls for features that are off. */
export type Capabilities = {
  /** Speech-to-text for the mic. */
  voiceInput: boolean;
  /** The "Create an image" feature. */
  imageGeneration: boolean;
};

// ---------- POST /api/transcribe ----------

export type TranscribeRequest = {
  /** The recording, base64-encoded. */
  audio: string;
  /** For example "audio/m4a" or "audio/webm". */
  mimeType: string;
};

export type TranscribeResponse = { text: string };

// ---------- POST /api/title ----------

export type TitleRequest = { userText: string; assistantText: string };

export type TitleResponse = { title: string };

// ---------- Errors (any endpoint, non-2xx status) ----------

export type ApiErrorBody = { error: { message: string } };
