import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import FileDropZone from '../components/FileDropZone.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ErrorDetails from '../components/ErrorDetails.jsx';
import DocumentFilters from '../components/DocumentFilters.jsx';
import CompletenessBar from '../components/CompletenessBar.jsx';
import { exportDocument, uploadFiles } from '../api.js';
import { useStore } from '../store.js';
import { confirmDialog, notify } from '../components/Toast.jsx';
import { applyFilters, EMPTY_FILTERS } from '../utils/filters.js';

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

function filenameFromHeaders(headers, fallback) {
  const cd = headers?.['content-disposition'] || headers?.['Content-Disposition'];
  if (!cd) return fallback;
  const m = /filename="?([^"]+)"?/.exec(cd);
  return m ? m[1] : fallback;
}

const EXPORT_FORMATS = ['json', 'csv', 'xlsx', 'xml'];

export default function Upload() {
  const {
    documents,
    fetchDocuments,
    isLoading,
    removeDocument,
    retryDocument,
    stopPolling,
  } = useStore();
  const [progress, setProgress] = useState({});
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [retryBusy, setRetryBusy] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkFormat, setBulkFormat] = useState('json');
  const [bulkExportBusy, setBulkExportBusy] = useState(false);

  useEffect(() => {
    fetchDocuments();
    return () => stopPolling();
  }, [fetchDocuments, stopPolling]);

  const handleFiles = async (files) => {
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
      notify.success(`Загружено файлов: ${files.length}`);
      await fetchDocuments();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Ошибка загрузки';
      notify.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setProgress((p) => {
        const n = { ...p };
        delete n[label];
        return n;
      });
    }
  };

  const handleDelete = async (doc) => {
    const ok = await confirmDialog({
      title: 'Удалить документ?',
      message: `«${doc.filename}» будет удалён безвозвратно.`,
      confirmText: 'Удалить',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await removeDocument(doc.doc_id);
      notify.success('Документ удалён');
    } catch (err) {
      notify.error(err.response?.data?.error || 'Не удалось удалить документ');
    }
  };

  const handleRetry = async (doc) => {
    setRetryBusy((m) => ({ ...m, [doc.doc_id]: true }));
    try {
      await retryDocument(doc.doc_id);
      notify.info('Повторная обработка запущена');
    } catch (err) {
      notify.error(err.response?.data?.error || 'Не удалось запустить повтор');
    } finally {
      setRetryBusy((m) => {
        const n = { ...m };
        delete n[doc.doc_id];
        return n;
      });
    }
  };

  const filtered = useMemo(
    () => applyFilters(documents, filters),
    [documents, filters],
  );
  const filteredIds = useMemo(() => filtered.map((doc) => doc.doc_id), [filtered]);
  const selectedInView = useMemo(
    () => selectedIds.filter((id) => filteredIds.includes(id)),
    [selectedIds, filteredIds],
  );
  const selectedDocs = useMemo(
    () => documents.filter((doc) => selectedIds.includes(doc.doc_id)),
    [documents, selectedIds],
  );
  const selectedApproved = useMemo(
    () => selectedDocs.filter((doc) => doc.status === 'approved'),
    [selectedDocs],
  );

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => documents.some((doc) => doc.doc_id === id)),
    );
  }, [documents]);

  const toggleSelected = (docId) => {
    setSelectedIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
  };

  const toggleSelectAllFiltered = () => {
    if (selectedInView.length === filteredIds.length && filteredIds.length > 0) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirmDialog({
      title: 'Удалить выбранные документы?',
      message: `Будет удалено документов: ${selectedIds.length}. Действие необратимо.`,
      confirmText: 'Удалить',
      tone: 'danger',
    });
    if (!ok) return;
    let success = 0;
    for (const docId of selectedIds) {
      try {
        await removeDocument(docId);
        success += 1;
      } catch {
        /* continue deleting remaining documents */
      }
    }
    setSelectedIds([]);
    if (success > 0) {
      notify.success(`Удалено документов: ${success}`);
    }
    if (success < selectedIds.length) {
      notify.error('Часть документов удалить не удалось');
    }
  };

  const handleBulkExport = async () => {
    if (selectedApproved.length === 0) {
      notify.error('Для экспорта выберите утверждённые документы');
      return;
    }
    setBulkExportBusy(true);
    let success = 0;
    for (const doc of selectedApproved) {
      try {
        const response = await exportDocument(doc.doc_id, bulkFormat);
        const blob = new Blob([response.data]);
        const fallback = `${doc.filename}.${bulkFormat}`;
        const name = filenameFromHeaders(response.headers, fallback);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        success += 1;
      } catch {
        /* continue exporting remaining documents */
      }
    }
    setBulkExportBusy(false);
    if (success > 0) {
      notify.success(`Экспортировано документов: ${success}`);
    }
    if (success < selectedApproved.length) {
      notify.error('Часть документов экспортировать не удалось');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <section>
        <h1 className="text-2xl font-semibold mb-1">Загрузка документов</h1>
        <p className="text-sm text-brand-muted">
          Поддерживаются счёта-фактуры, накладные, акты и счета в форматах PDF, DOC, DOCX, JPG, PNG.
        </p>
      </section>

      <FileDropZone onFiles={handleFiles} />

      {Object.entries(progress).length > 0 && (
        <div className="bg-white border border-brand-line rounded-md p-3 space-y-2">
          {Object.entries(progress).map(([label, pct]) => (
            <div key={label}>
              <div className="flex justify-between text-xs text-brand-muted">
                <span className="truncate max-w-[70%]">{label}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full bg-brand-light rounded overflow-hidden">
                <div
                  className="h-full bg-brand-blue transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="bg-white border border-brand-line rounded-lg shadow-card">
        <header className="px-4 py-3 border-b border-brand-line flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Документы</h2>
            <span className="text-xs text-brand-muted">
              {filtered.length} / {documents.length}
            </span>
          </div>
          <button
            onClick={fetchDocuments}
            className="text-xs text-brand-blue hover:underline"
            disabled={isLoading}
          >
            Обновить
          </button>
        </header>

        <div className="px-4 py-3 border-b border-brand-line flex flex-wrap items-center gap-2">
          <button
            onClick={toggleSelectAllFiltered}
            className="px-3 py-1.5 rounded-md text-xs border border-brand-line hover:bg-brand-light"
            disabled={filteredIds.length === 0}
          >
            {selectedInView.length === filteredIds.length && filteredIds.length > 0
              ? 'Снять выбор'
              : 'Выбрать всё'}
          </button>
          <span className="text-xs text-brand-muted">
            Выбрано: {selectedIds.length}
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={selectedIds.length === 0}
            className={`px-3 py-1.5 rounded-md text-xs ${
              selectedIds.length === 0
                ? 'bg-brand-light text-brand-muted cursor-not-allowed'
                : 'text-brand-error hover:bg-red-50'
            }`}
          >
            Удалить выбранные
          </button>
          <select
            value={bulkFormat}
            onChange={(e) => setBulkFormat(e.target.value)}
            className="px-2 py-1.5 rounded-md text-xs border border-brand-line bg-white"
          >
            {EXPORT_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkExport}
            disabled={selectedApproved.length === 0 || bulkExportBusy}
            className={`px-3 py-1.5 rounded-md text-xs ${
              selectedApproved.length === 0 || bulkExportBusy
                ? 'bg-brand-light text-brand-muted cursor-not-allowed'
                : 'border border-brand-blue text-brand-blue hover:bg-brand-blue/10'
            }`}
          >
            {bulkExportBusy
              ? 'Экспорт...'
              : `Экспортировать выбранные (${selectedApproved.length})`}
          </button>
        </div>

        <div className="px-4 py-3 border-b border-brand-line">
          <DocumentFilters value={filters} onChange={setFilters} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-brand-muted bg-brand-light/50">
                <th className="px-4 py-2 w-12">
                  <input
                    type="checkbox"
                    checked={filteredIds.length > 0 && selectedInView.length === filteredIds.length}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Выбрать все документы"
                  />
                </th>
                <th className="px-4 py-2">Имя файла</th>
                <th className="px-4 py-2 w-24">Тип</th>
                <th className="px-4 py-2 w-28">Размер</th>
                <th className="px-4 py-2 w-40">Качество AI</th>
                <th className="px-4 py-2 w-52">Статус</th>
                <th className="px-4 py-2 w-64">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && documents.length === 0 && (
                <>
                  {[0, 1, 2].map((i) => (
                    <tr key={i} className="border-t border-brand-line">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse bg-brand-light" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!isLoading && documents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-brand-muted">
                    Пока нет документов. Загрузите первый файл.
                  </td>
                </tr>
              )}
              {!isLoading && documents.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-brand-muted">
                    По текущим фильтрам документов не найдено.
                  </td>
                </tr>
              )}
              {filtered.map((doc) => (
                <tr
                  key={doc.doc_id}
                  className="border-t border-brand-line hover:bg-brand-light/40 align-top"
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(doc.doc_id)}
                      onChange={() => toggleSelected(doc.doc_id)}
                      aria-label={`Выбрать ${doc.filename}`}
                    />
                  </td>
                  <td className="px-4 py-2 truncate max-w-[320px]" title={doc.filename}>
                    {doc.filename}
                    {doc.data?.document_number && (
                      <div className="text-[11px] text-brand-muted">
                        № {doc.data.document_number}
                        {doc.data.document_date ? ` · ${doc.data.document_date}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 uppercase text-xs text-brand-muted">
                    {doc.file_type}
                  </td>
                  <td className="px-4 py-2 text-xs">{formatSize(doc.file_size)}</td>
                  <td className="px-4 py-2">
                    <CompletenessBar value={doc.completeness} status={doc.status} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={doc.status} />
                    {doc.status === 'error' && (
                      <ErrorDetails
                        message={doc.error_message}
                        retryCount={doc.retry_count}
                        onRetry={() => handleRetry(doc)}
                        retryBusy={!!retryBusy[doc.doc_id]}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/verify/${doc.doc_id}`}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                          doc.status === 'ready' || doc.status === 'approved'
                            ? 'bg-brand-blue text-white hover:bg-brand-navy'
                            : 'bg-brand-light text-brand-muted pointer-events-none'
                        }`}
                      >
                        Открыть
                      </Link>
                      {doc.status === 'approved' && (
                        <Link
                          to={`/results/${doc.doc_id}`}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border border-brand-blue text-brand-blue hover:bg-brand-blue/10"
                        >
                          Экспорт
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(doc)}
                        className="px-3 py-1.5 rounded-md text-xs text-brand-error hover:bg-red-50"
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
