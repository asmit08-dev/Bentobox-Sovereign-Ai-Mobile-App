import { create } from 'zustand';

import type { Attachment, AttachmentKind } from '@/chat/types';
import { deleteFile } from '@/lib/files';

/** A file in the composer. It is "preparing" while photos are shrunk and saved. */
export type DraftAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  status: 'preparing' | 'ready' | 'failed';
  /** Shown while preparing (the original photo). */
  previewUri?: string;
  /** Set when ready. */
  attachment?: Attachment;
  error?: string;
};

/** Most files one message can carry. */
export const MAX_ATTACHMENTS = 6;

type ComposerState = {
  /** What the user has typed but not sent yet. Kept while the app is open. */
  draft: string;
  attachments: DraftAttachment[];
  setDraft: (draft: string) => void;
  addAttachments: (items: DraftAttachment[]) => void;
  updateAttachment: (id: string, patch: Partial<DraftAttachment>) => void;
  /** Removes a file from the composer and deletes its saved copy. */
  removeAttachment: (id: string) => void;
  /** Empties the composer after sending. The files now belong to the message. */
  clear: () => void;
};

export const useComposerStore = create<ComposerState>()((set, get) => ({
  draft: '',
  attachments: [],
  setDraft: (draft) => set({ draft }),
  addAttachments: (items) =>
    set((state) => ({ attachments: [...state.attachments, ...items].slice(0, MAX_ATTACHMENTS) })),
  updateAttachment: (id, patch) =>
    set((state) => ({
      attachments: state.attachments.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  removeAttachment: (id) => {
    const item = get().attachments.find((entry) => entry.id === id);
    if (item?.attachment) deleteFile(item.attachment.path);
    set((state) => ({ attachments: state.attachments.filter((entry) => entry.id !== id) }));
  },
  clear: () => set({ draft: '', attachments: [] }),
}));
