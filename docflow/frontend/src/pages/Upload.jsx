import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import FileDropZone from '../components/FileDropZone.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { uploadFiles } from '../api.js';
import { useStore } from '../store.js';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function Upload() {
  const {
    documents,
    fetchDocuments,
    isLoading,
    error,
    setError,
    removeDocument,
    stopPolling,
  } = useStore();
  const [progress, setProgress] = useState({});
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    fetchDocuments();
    return () => stopPolling();
  }, [fetchDocuments, stopPolling]);

  const handleFiles = async (files) => {
    setUploadError('');
    const label = files.map((f) => f.name).join(',');
    setProgress((p) => ({ ...p, [label]: 0 }));
    try {
      await uploadFiles(files, (pct) => {
        setProgress((p) => ({ ...p, [label]: pct }));
      });
      setProgress((p) => {
        const n = { ...p };
        delete n[label];
        return n;
      });
      await fetchDocuments();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Ошибка загрузки';
      setUploadError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setProgress((p) => {
        const n = { ...p };
        delete n[label];
        return n;
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <section>
        <h1 className="text-2xl font-semibold mb-1">Загрузка документов</h1>
        <p className="text-sm text-kzn-muted">
          Поддерживаются счёта-фактуры, накладные, акты и счета в форматах PDF, JPG, PNG.
        </p>
      </section>

      <FileDropZone onFiles={handleFiles} />

      {uploadError && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 text-sm p-3">
          {uploadError}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 text-sm p-3 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="underline">
            закрыть
          </button>
        </div>
      )}

      {Object.entries(progress).length > 0 && (
        <div className="bg-white border border-kzn-line rounded-md p-3 space-y-2">
          {Object.entries(progress).map(([label, pct]) => (
            <div key={label}>
              <div className="flex justify-between text-xs text-kzn-muted">
                <span className="truncate max-w-[70%]">{label}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full bg-kzn-cream rounded overflow-hidden">
                <div
                  className="h-full bg-kzn-green transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="bg-white border border-kzn-line rounded-lg shadow-card">
        <header className="px-4 py-3 border-b border-kzn-line flex items-center justify-between">
          <h2 className="font-semibold">Документы</h2>
          <button
            onClick={fetchDocuments}
            className="text-xs text-kzn-green hover:underline"
            disabled={isLoading}
          >
            Обновить
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-kzn-muted bg-kzn-cream/50">
                <th className="px-4 py-2">Имя файла</th>
                <th className="px-4 py-2 w-24">Тип</th>
                <th className="px-4 py-2 w-28">Размер</th>
                <th className="px-4 py-2 w-48">Статус</th>
                <th className="px-4 py-2 w-64">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && documents.length === 0 && (
                <>
                  {[0, 1, 2].map((i) => (
                    <tr key={i} className="border-t border-kzn-line">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse bg-kzn-cream" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!isLoading && documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-kzn-muted">
                    Пока нет документов. Загрузите первый файл.
                  </td>
                </tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.doc_id} className="border-t border-kzn-line hover:bg-kzn-cream/40">
                  <td className="px-4 py-2 truncate max-w-[320px]" title={doc.filename}>
                    {doc.filename}
                  </td>
                  <td className="px-4 py-2 uppercase text-xs text-kzn-muted">
                    {doc.file_type}
                  </td>
                  <td className="px-4 py-2 text-xs">{formatSize(doc.file_size)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={doc.status} />
                    {doc.status === 'error' && doc.error_message && (
                      <div className="text-[11px] text-kzn-red mt-1">
                        {doc.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Link
                        to={`/verify/${doc.doc_id}`}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                          doc.status === 'ready' || doc.status === 'approved'
                            ? 'bg-kzn-green text-white hover:bg-kzn-green-dark'
                            : 'bg-kzn-cream text-kzn-muted pointer-events-none'
                        }`}
                      >
                        Открыть
                      </Link>
                      {doc.status === 'approved' && (
                        <Link
                          to={`/results/${doc.doc_id}`}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border border-kzn-green text-kzn-green hover:bg-kzn-green/10"
                        >
                          Экспорт
                        </Link>
                      )}
                      <button
                        onClick={async () => {
                          if (confirm(`Удалить документ «${doc.filename}»?`)) {
                            await removeDocument(doc.doc_id);
                          }
                        }}
                        className="px-3 py-1.5 rounded-md text-xs text-kzn-red hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
