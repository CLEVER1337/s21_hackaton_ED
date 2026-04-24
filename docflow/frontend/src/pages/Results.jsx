import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExportButtons from '../components/ExportButtons.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import CompletenessBar from '../components/CompletenessBar.jsx';
import DocumentFilters from '../components/DocumentFilters.jsx';
import { useStore } from '../store.js';
import { applyFilters, EMPTY_FILTERS } from '../utils/filters.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-2 border-b border-brand-line py-1.5 text-sm">
      <div className="text-brand-muted">{label}</div>
      <div className="font-medium break-words">
        {value || <span className="text-brand-muted">—</span>}
      </div>
    </div>
  );
}

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, fetchDocuments, currentDoc, fetchDocument } = useStore();
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    status: 'approved',
  });

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (id) fetchDocument(id);
  }, [id, fetchDocument]);

  const doc = id ? currentDoc : null;

  const filtered = useMemo(
    () => applyFilters(documents, filters),
    [documents, filters],
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-brand-blue hover:underline">
          ← Назад к загрузке
        </Link>
        <h1 className="text-2xl font-semibold">Результаты</h1>
      </div>

      {doc && (
        <section className="bg-white border border-brand-line rounded-lg shadow-card p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div className="min-w-0">
              <div className="text-sm text-brand-muted truncate">
                {doc.filename}
              </div>
              <h2 className="text-lg font-semibold">
                {doc.data?.document_type || 'Документ'}
                {doc.data?.document_number ? ` № ${doc.data.document_number}` : ''}
              </h2>
              <div className="text-xs text-brand-muted mt-0.5">
                Обновлён: {formatDate(doc.updated_at)}
              </div>
              <div className="flex items-center gap-2 mt-2 max-w-xs">
                <span className="text-xs text-brand-muted">Качество AI:</span>
                <CompletenessBar value={doc.completeness} status={doc.status} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={doc.status} />
              <button
                onClick={() => navigate(`/verify/${doc.doc_id}`)}
                className="px-3 py-1.5 rounded-md border border-brand-blue text-brand-blue hover:bg-brand-blue hover:text-white text-xs font-medium"
              >
                Открыть верификацию
              </button>
            </div>
          </div>

          {doc.data && (
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
              <Row label="Тип" value={doc.data.document_type} />
              <Row label="Номер" value={doc.data.document_number} />
              <Row label="Дата" value={doc.data.document_date} />
              <Row label="Валюта" value={doc.data.currency} />
              <Row label="Поставщик" value={doc.data.supplier_name} />
              <Row label="ИНН поставщика" value={doc.data.supplier_inn} />
              <Row label="Покупатель" value={doc.data.buyer_name} />
              <Row label="ИНН покупателя" value={doc.data.buyer_inn} />
              <Row label="Сумма итого" value={doc.data.total_amount} />
              <Row label="в т.ч. НДС" value={doc.data.vat_amount} />
            </div>
          )}

          {doc.data?.items?.length > 0 && (
            <div className="mt-5">
              <div className="text-sm font-semibold text-brand-blue uppercase tracking-wide mb-2">
                Товары / услуги
              </div>
              <table className="w-full text-sm border border-brand-line rounded">
                <thead>
                  <tr className="bg-brand-light/60 text-xs uppercase text-brand-muted">
                    <th className="text-left px-3 py-2">Наименование</th>
                    <th className="text-left px-3 py-2 w-24">Кол-во</th>
                    <th className="text-left px-3 py-2 w-20">Ед.</th>
                    <th className="text-left px-3 py-2 w-28">Цена</th>
                    <th className="text-left px-3 py-2 w-28">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.data.items.map((item, idx) => (
                    <tr key={idx} className="border-t border-brand-line">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{item.unit}</td>
                      <td className="px-3 py-2">{item.unit_price}</td>
                      <td className="px-3 py-2">{item.total_price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 border-t border-brand-line pt-4 flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[240px]">
              <div className="text-sm font-semibold mb-2">Экспорт</div>
              <ExportButtons
                docId={doc.doc_id}
                disabled={doc.status !== 'approved'}
              />
            </div>
            <button
              onClick={() => navigate(`/verify/${doc.doc_id}`)}
              className="px-4 py-2 rounded-md bg-brand-blue text-white hover:bg-brand-navy text-sm font-medium"
            >
              Перейти к верификации →
            </button>
          </div>
        </section>
      )}

      <section className="bg-white border border-brand-line rounded-lg shadow-card">
        <header className="px-4 py-3 border-b border-brand-line flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">История документов</h2>
            <span className="text-xs text-brand-muted">
              {filtered.length} / {documents.length}
            </span>
          </div>
        </header>
        <div className="px-4 py-3 border-b border-brand-line">
          <DocumentFilters value={filters} onChange={setFilters} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-brand-muted bg-brand-light/50">
                <th className="px-4 py-2">Номер</th>
                <th className="px-4 py-2">Дата</th>
                <th className="px-4 py-2">Тип</th>
                <th className="px-4 py-2">Поставщик</th>
                <th className="px-4 py-2">Сумма</th>
                <th className="px-4 py-2">Статус</th>
                <th className="px-4 py-2">Обновлён</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-brand-muted">
                    По текущим фильтрам ничего не найдено.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr
                  key={d.doc_id}
                  className="border-t border-brand-line hover:bg-brand-light/40"
                >
                  <td className="px-4 py-2 font-medium">
                    {d.data?.document_number || '—'}
                  </td>
                  <td className="px-4 py-2">{d.data?.document_date || '—'}</td>
                  <td className="px-4 py-2">{d.data?.document_type || '—'}</td>
                  <td className="px-4 py-2 truncate max-w-[260px]">
                    {d.data?.supplier_name || '—'}
                  </td>
                  <td className="px-4 py-2">
                    {d.data?.total_amount
                      ? `${d.data.total_amount} ${d.data.currency || ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-brand-muted">
                    {formatDate(d.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex gap-3 justify-end">
                      <Link
                        to={`/results/${d.doc_id}`}
                        className="text-xs text-brand-blue hover:underline"
                      >
                        Открыть
                      </Link>
                      <Link
                        to={`/verify/${d.doc_id}`}
                        className="text-xs text-brand-muted hover:text-brand-blue hover:underline"
                      >
                        Верифицировать
                      </Link>
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
