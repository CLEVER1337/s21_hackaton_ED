const MAP = {
  processing: {
    label: 'Обработка',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
    spinner: true,
  },
  ready: {
    label: 'Готов к проверке',
    className: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  approved: {
    label: 'Утверждён',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  error: {
    label: 'Ошибка',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
};

export default function StatusBadge({ status }) {
  const meta = MAP[status] || { label: status, className: 'bg-gray-100 text-gray-700 border-gray-300' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium border rounded-full ${meta.className}`}
    >
      {meta.spinner && <span className="spinner" aria-hidden />}
      {meta.label}
    </span>
  );
}
