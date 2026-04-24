import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import CompletenessBar from '../components/CompletenessBar.jsx';
import { notify } from '../components/Toast.jsx';

const STATUS_LABELS = {
  processing: 'Обработка',
  ready: 'Готов',
  approved: 'Утверждён',
  error: 'Ошибка',
};

function Card({ title, value, hint }) {
  return (
    <div className="bg-white border border-brand-line rounded-lg shadow-card p-4">
      <div className="text-xs uppercase tracking-wide text-brand-muted">
        {title}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs text-brand-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function Bar({ label, count, total, tone = 'bg-brand-blue' }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span>{label}</span>
        <span className="text-brand-muted">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-brand-light rounded overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Stats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getStats();
      setData(data);
    } catch (err) {
      notify.error(err.response?.data?.error || 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-brand-muted">
        Загрузка статистики…
      </div>
    );
  }

  if (!data) return null;

  const avgPct = Math.round((data.avg_completeness || 0) * 100);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Статистика обработки</h1>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-brand-blue hover:underline"
        >
          Обновить
        </button>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Всего документов" value={data.total} />
        <Card
          title="Утверждено"
          value={data.approved}
          hint={
            data.total
              ? `${Math.round((data.approved / data.total) * 100)}% от всех`
              : undefined
          }
        />
        <Card
          title="Ошибок обработки"
          value={data.errors}
          hint={
            data.total
              ? `${Math.round((data.errors / data.total) * 100)}% от всех`
              : undefined
          }
        />
        <Card
          title="Среднее качество AI"
          value={`${avgPct}%`}
          hint={`Авто-ретраев: ${data.retries_used}`}
        />
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-brand-line rounded-lg shadow-card p-4">
          <h2 className="font-semibold mb-3">По статусам</h2>
          <div className="space-y-2">
            {Object.entries(data.by_status || {}).length === 0 && (
              <div className="text-xs text-brand-muted">Данных пока нет.</div>
            )}
            {Object.entries(data.by_status || {}).map(([k, v]) => (
              <Bar
                key={k}
                label={STATUS_LABELS[k] || k}
                count={v}
                total={data.total}
                tone={
                  k === 'approved'
                    ? 'bg-brand-success'
                    : k === 'error'
                      ? 'bg-brand-error'
                      : k === 'processing'
                        ? 'bg-brand-warning'
                        : 'bg-brand-blue'
                }
              />
            ))}
          </div>
        </div>

        <div className="bg-white border border-brand-line rounded-lg shadow-card p-4">
          <h2 className="font-semibold mb-3">По типам файлов</h2>
          <div className="space-y-2">
            {Object.entries(data.by_type || {}).length === 0 && (
              <div className="text-xs text-brand-muted">Данных пока нет.</div>
            )}
            {Object.entries(data.by_type || {}).map(([k, v]) => (
              <Bar
                key={k}
                label={k.toUpperCase()}
                count={v}
                total={data.total}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-brand-line rounded-lg shadow-card">
          <header className="px-4 py-3 border-b border-brand-line font-semibold text-sm">
            Лучшее качество распознавания
          </header>
          <ul className="divide-y divide-brand-line">
            {(data.best || []).length === 0 && (
              <li className="px-4 py-4 text-xs text-brand-muted">
                Пока нет успешно обработанных документов.
              </li>
            )}
            {(data.best || []).map((r) => (
              <li key={r.doc_id} className="px-4 py-2 flex items-center gap-3">
                <Link
                  to={`/verify/${r.doc_id}`}
                  className="flex-1 min-w-0 truncate text-sm text-brand-blue hover:underline"
                  title={r.filename}
                >
                  {r.document_number || r.filename}
                </Link>
                <div className="w-40">
                  <CompletenessBar value={r.completeness} status="ready" />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-brand-line rounded-lg shadow-card">
          <header className="px-4 py-3 border-b border-brand-line font-semibold text-sm">
            Худшее качество распознавания
          </header>
          <ul className="divide-y divide-brand-line">
            {(data.worst || []).length === 0 && (
              <li className="px-4 py-4 text-xs text-brand-muted">—</li>
            )}
            {(data.worst || []).map((r) => (
              <li key={r.doc_id} className="px-4 py-2 flex items-center gap-3">
                <Link
                  to={`/verify/${r.doc_id}`}
                  className="flex-1 min-w-0 truncate text-sm text-brand-blue hover:underline"
                  title={r.filename}
                >
                  {r.document_number || r.filename}
                </Link>
                <div className="w-40">
                  <CompletenessBar value={r.completeness} status="ready" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white border border-brand-line rounded-lg shadow-card">
        <header className="px-4 py-3 border-b border-brand-line font-semibold text-sm">
          Последние загрузки
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-brand-muted bg-brand-light/50">
                <th className="px-4 py-2">Файл</th>
                <th className="px-4 py-2">Статус</th>
                <th className="px-4 py-2 w-40">Качество</th>
                <th className="px-4 py-2 w-24">Ретраев</th>
                <th className="px-4 py-2">Обновлён</th>
              </tr>
            </thead>
            <tbody>
              {(data.recent || []).map((r) => (
                <tr
                  key={r.doc_id}
                  className="border-t border-brand-line hover:bg-brand-light/40"
                >
                  <td className="px-4 py-2 truncate max-w-[360px]" title={r.filename}>
                    <Link
                      to={`/verify/${r.doc_id}`}
                      className="text-brand-blue hover:underline"
                    >
                      {r.filename}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2">
                    <CompletenessBar
                      value={r.completeness}
                      status={r.status}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs">{r.retry_count}</td>
                  <td className="px-4 py-2 text-xs text-brand-muted">
                    {new Date(r.updated_at).toLocaleString('ru-RU')}
                  </td>
                </tr>
              ))}
              {(data.recent || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-brand-muted">
                    Документов пока нет.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
