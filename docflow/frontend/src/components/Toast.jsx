import { create } from 'zustand';
import { useEffect } from 'react';

let _id = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = ++_id;
    const item = { id, type: 'info', duration: 3500, ...toast };
    set((s) => ({ toasts: [...s.toasts, item] }));
    if (item.duration > 0) {
      setTimeout(() => get().dismiss(id), item.duration);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const notify = {
  info: (message, opts = {}) => useToastStore.getState().push({ ...opts, type: 'info', message }),
  success: (message, opts = {}) => useToastStore.getState().push({ ...opts, type: 'success', message }),
  error: (message, opts = {}) => useToastStore.getState().push({ ...opts, type: 'error', message }),
  warning: (message, opts = {}) => useToastStore.getState().push({ ...opts, type: 'warning', message }),
};

let _confirmRef = null;

export const confirmStore = create((set) => ({
  current: null,
  open: (opts) =>
    new Promise((resolve) => {
      set({
        current: {
          title: opts.title || 'Подтвердите действие',
          message: opts.message || '',
          confirmText: opts.confirmText || 'Подтвердить',
          cancelText: opts.cancelText || 'Отмена',
          tone: opts.tone || 'primary',
          resolve,
        },
      });
    }),
  resolve: (value) => {
    const state = confirmStore.getState();
    if (state.current) state.current.resolve(value);
    set({ current: null });
  },
}));

export const confirmDialog = (opts) => confirmStore.getState().open(opts);

const TYPE_STYLES = {
  info: 'bg-brand-blue text-white',
  success: 'bg-brand-success text-white',
  error: 'bg-brand-error text-white',
  warning: 'bg-brand-warning text-white',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const confirm = confirmStore((s) => s.current);
  const resolveConfirm = confirmStore((s) => s.resolve);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e) => {
      if (e.key === 'Escape') resolveConfirm(false);
      if (e.key === 'Enter') resolveConfirm(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, resolveConfirm]);

  return (
    <>
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg shadow-card px-4 py-2.5 text-sm flex items-start gap-3 animate-[slide-in_0.2s_ease-out] ${TYPE_STYLES[t.type] || TYPE_STYLES.info}`}
          >
            <span className="flex-1 whitespace-pre-wrap">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-white/80 hover:text-white text-xs leading-none"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-brand-navy/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-card max-w-md w-[92%] p-5 animate-[pop-in_0.15s_ease-out]">
            <div className="text-base font-semibold text-brand-ink mb-1">
              {confirm.title}
            </div>
            {confirm.message && (
              <div className="text-sm text-brand-muted mb-4 whitespace-pre-wrap">
                {confirm.message}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => resolveConfirm(false)}
                className="px-4 py-2 rounded-md border border-brand-line text-brand-muted hover:bg-brand-light text-sm"
              >
                {confirm.cancelText}
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className={`px-4 py-2 rounded-md text-white text-sm font-medium ${
                  confirm.tone === 'danger'
                    ? 'bg-brand-error hover:bg-brand-error-dark'
                    : 'bg-brand-blue hover:bg-brand-navy'
                }`}
                autoFocus
              >
                {confirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
