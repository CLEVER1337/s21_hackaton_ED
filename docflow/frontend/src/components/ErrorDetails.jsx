import { useState } from 'react';

export default function ErrorDetails({ message, retryCount, onRetry, retryBusy }) {
  const [open, setOpen] = useState(false);

  if (!message) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-brand-error hover:text-brand-error-dark underline decoration-dotted underline-offset-2 flex items-center gap-1"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Подробности</span>
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-red-200 bg-red-50 text-red-800 text-[11px] p-2 whitespace-pre-wrap break-words max-w-md">
          {message}
          {typeof retryCount === 'number' && retryCount > 0 && (
            <div className="mt-1 text-red-700/80">
              Автоматических попыток: {retryCount}
            </div>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retryBusy}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-brand-blue text-white hover:bg-brand-navy disabled:opacity-60 text-[11px]"
            >
              {retryBusy && <span className="spinner" />}
              {retryBusy ? 'Повтор…' : 'Повторить обработку'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
