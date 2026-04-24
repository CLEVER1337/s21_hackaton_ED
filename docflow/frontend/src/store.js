import { create } from 'zustand';
import {
  approveDocument as apiApprove,
  deleteDocument as apiDelete,
  getDocument,
  getDocuments,
  updateDocument as apiUpdate,
} from './api.js';

const DRAFT_KEY = (id) => `docflow_draft_${id}`;

export const loadDraft = (id) => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistDraft = (id, edits) => {
  try {
    if (!edits || Object.keys(edits).length === 0) {
      localStorage.removeItem(DRAFT_KEY(id));
    } else {
      localStorage.setItem(DRAFT_KEY(id), JSON.stringify(edits));
    }
  } catch {
    /* ignore quota errors */
  }
};

export const useStore = create((set, get) => ({
  documents: [],
  currentDoc: null,
  draftEdits: {},
  isLoading: false,
  error: '',
  processingIds: new Set(),
  pollTimer: null,

  setError: (error) => set({ error }),

  fetchDocuments: async () => {
    set({ isLoading: true });
    try {
      const { data } = await getDocuments();
      const docs = data.documents || [];
      const processing = new Set(
        docs.filter((d) => d.status === 'processing').map((d) => d.doc_id),
      );
      set({ documents: docs, processingIds: processing, isLoading: false });
      if (processing.size > 0) get().startPolling();
    } catch (err) {
      set({
        isLoading: false,
        error: err.response?.data?.error || 'Не удалось загрузить список документов',
      });
    }
  },

  fetchDocument: async (id) => {
    set({ isLoading: true });
    try {
      const { data } = await getDocument(id);
      set({ currentDoc: data, isLoading: false });
      return data;
    } catch (err) {
      set({
        isLoading: false,
        error: err.response?.data?.error || 'Документ не найден',
      });
      return null;
    }
  },

  setCurrentDoc: (doc) => set({ currentDoc: doc }),

  updateField: (docId, field, value) => {
    const { draftEdits } = get();
    const next = {
      ...draftEdits,
      [docId]: { ...(draftEdits[docId] || {}), [field]: value },
    };
    persistDraft(docId, next[docId]);
    set({ draftEdits: next });
  },

  replaceDraft: (docId, patch) => {
    const { draftEdits } = get();
    const next = { ...draftEdits, [docId]: { ...patch } };
    persistDraft(docId, next[docId]);
    set({ draftEdits: next });
  },

  loadDraftFromStorage: (docId) => {
    const saved = loadDraft(docId);
    if (saved) {
      set((state) => ({
        draftEdits: { ...state.draftEdits, [docId]: saved },
      }));
    }
    return saved;
  },

  clearDraft: (docId) => {
    const { draftEdits } = get();
    const next = { ...draftEdits };
    delete next[docId];
    persistDraft(docId, null);
    set({ draftEdits: next });
  },

  saveDocument: async (docId, data) => {
    const { data: updated } = await apiUpdate(docId, data);
    set({ currentDoc: updated });
    return updated;
  },

  approveDocument: async (docId) => {
    const { data: updated } = await apiApprove(docId);
    set({ currentDoc: updated });
    return updated;
  },

  removeDocument: async (docId) => {
    await apiDelete(docId);
    set((state) => ({
      documents: state.documents.filter((d) => d.doc_id !== docId),
    }));
  },

  startPolling: () => {
    if (get().pollTimer) return;
    let delay = 3000;
    const tick = async () => {
      try {
        const { data } = await getDocuments();
        const docs = data.documents || [];
        const processing = new Set(
          docs.filter((d) => d.status === 'processing').map((d) => d.doc_id),
        );
        set({ documents: docs, processingIds: processing });
        if (processing.size === 0) {
          get().stopPolling();
          return;
        }
        delay = Math.min(delay * 1.2, 15000);
        const timer = setTimeout(tick, delay);
        set({ pollTimer: timer });
      } catch {
        const timer = setTimeout(tick, Math.min(delay * 1.5, 15000));
        set({ pollTimer: timer });
      }
    };
    const timer = setTimeout(tick, delay);
    set({ pollTimer: timer });
  },

  stopPolling: () => {
    const { pollTimer } = get();
    if (pollTimer) clearTimeout(pollTimer);
    set({ pollTimer: null });
  },
}));
