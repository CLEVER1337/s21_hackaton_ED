import { useState } from 'react';
import { exportDocument } from '../api.js';

const FORMATS = [
  { key: 'json', label: 'JSON' },
  { key: 'csv', label: 'CSV' },
  { key: 'xlsx', label: 'XLSX' },
  { key: 'xml', label: 'XML' },
];

function filenameFromHeaders(headers, fallback) {
  const cd = headers?.['content-disposition'] || headers?.['Content-Disposition'];
  if (!cd) return fallback;
  const m = /filename="?([^"]+)"?/.exec(cd);
  return m ? m[1] : fallback;
}

export default function ExportButtons({ docId, disabled }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');

  const handle = async (fmt) => {
    setPending(fmt);
    setError('');
    try {
      const response = await exportDocument(docId, fmt);
      const blob = new Blob([response.data]);
      const fallback = `document.${fmt}`;
      const name = filenameFromHeaders(response.headers, fallback);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось выполнить экспорт');
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.key}
            disabled={disabled || !!pending}
            onClick={() => handle(f.key)}
            className={`px-4 py-2 rounded-md border text-sm font-medium transition ${
              disabled
                ? 'border-kzn-line text-kzn-muted bg-kzn-cream cursor-not-allowed'
                : 'border-kzn-green text-kzn-green hover:bg-kzn-green hover:text-white'
            }`}
          >
            {pending === f.key ? (
              <span className="inline-flex items-center gap-2">
                <span className="spinner" /> {f.label}
              </span>
            ) : (
              f.label
            )}
          </button>
        ))}
      </div>
      {disabled && (
        <div className="text-xs text-kzn-muted mt-2">
          Экспорт доступен только для утверждённых документов
        </div>
      )}
      {error && <div className="text-xs text-kzn-red mt-2">{error}</div>}
    </div>
  );
}
