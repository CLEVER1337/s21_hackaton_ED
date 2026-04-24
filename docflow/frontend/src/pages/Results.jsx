import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExportButtons from '../components/ExportButtons.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useStore } from '../store.js';

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
    <div className="grid grid-cols-[12rem_1fr] gap-2 border-b border-kzn-line py-1.5 text-sm">
      <div className="text-kzn-muted">{label}</div>
      <div className="font-medium break-words">{value || <span className="text-kzn-muted">—</span>}</div>
    </div>
  );
}

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    documents,
    fetchDocuments,
    currentDoc,
    fetchDocument,
  } = useStore();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (id) fetchDocument(id);
  }, [id, fetchDocument]);

  const doc = id ? currentDoc : null;
  const approved = useMemo(
    () => documents.filter((d) => d.status === 'approved'),
    [documents],
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-kzn-green hover:underline">
          ← Назад к загрузке
        </Link>
        <h1 className="text-2xl font-semibold">Результаты</h1>
      </div>

      {doc && (
        <section className="bg-white border border-kzn-line rounded-lg shadow-card p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="text-sm text-kzn-muted">{doc.filename}</div>
              <h2 className="text-lg font-semibold">
                {doc.data?.document_type || 'Документ'}
                {doc.data?.document_number ? ` № ${doc.data.document_number}` : ''}
              </h2>
              <div className="text-xs text-kzn-muted mt-0.5">
                Обновлён: {formatDate(doc.updated_at)}
              </div>
            </div>
            <StatusBadge status={doc.status} />
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
              <div className="text-sm font-semibold text-kzn-green uppercase tracking-wide mb-2">
                Товары / услуги
              </div>
              <table className="w-full text-sm border border-kzn-line rounded">
                <thead>
                  <tr className="bg-kzn-cream/60 text-xs uppercase text-kzn-muted">
                    <th className="text-left px-3 py-2">Наименование</th>
                    <th className="text-left px-3 py-2 w-24">Кол-во</th>
                    <th className="text-left px-3 py-2 w-20">Ед.</th>
                    <th className="text-left px-3 py-2 w-28">Цена</th>
                    <th className="text-left px-3 py-2 w-28">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.data.items.map((item, idx) => (
                    <tr key={idx} className="border-t border-kzn-line">
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

          <div className="mt-6 border-t border-kzn-line pt-4">
            <div className="text-sm font-semibold mb-2">Экспорт</div>
            <ExportButtons
              docId={doc.doc_id}
              disabled={doc.status !== 'approved'}
            />
            {doc.status !== 'approved' && (
              <button
                onClick={() => navigate(`/verify/${doc.doc_id}`)}
                className="mt-3 text-sm text-kzn-green hover:underline"
              >
                Открыть верификацию →
              </button>
            )}
          </div>
        </section>
      )}

      <section className="bg-white border border-kzn-line rounded-lg shadow-card">
        <header className="px-4 py-3 border-b border-kzn-line">
          <h2 className="font-semibold">История утверждённых документов</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-kzn-muted bg-kzn-cream/50">
                <th className="px-4 py-2">Номер</th>
                <th className="px-4 py-2">Дата</th>
                <th className="px-4 py-2">Тип</th>
                <th className="px-4 py-2">Поставщик</th>
                <th className="px-4 py-2">Сумма</th>
                <th className="px-4 py-2">Обновлён</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {approved.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-kzn-muted">
                    Пока нет утверждённых документов.
                  </td>
                </tr>
              )}
              {approved.map((d) => (
                <tr key={d.doc_id} className="border-t border-kzn-line hover:bg-kzn-cream/40">
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
                  <td className="px-4 py-2 text-xs text-kzn-muted">
                    {formatDate(d.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/results/${d.doc_id}`}
                      className="text-xs text-kzn-green hover:underline"
                    >
                      Открыть
                    </Link>
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
