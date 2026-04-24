import { EMPTY_FILTERS, STATUS_OPTIONS, TYPE_OPTIONS } from '../utils/filters.js';

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-brand-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function DocumentFilters({
  value,
  onChange,
  showStatus = true,
  showType = true,
}) {
  const v = value || EMPTY_FILTERS;
  const set = (patch) => onChange({ ...v, ...patch });

  const hasAny =
    v.query || v.status || v.type || v.dateFrom || v.dateTo;

  const inputCls =
    'px-2.5 py-1.5 rounded-md border border-brand-line bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40';

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Поиск">
        <input
          type="text"
          value={v.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Имя файла, номер, поставщик…"
          className={`${inputCls} w-56`}
        />
      </Field>

      {showStatus && (
        <Field label="Статус">
          <select
            value={v.status}
            onChange={(e) => set({ status: e.target.value })}
            className={`${inputCls} min-w-[10rem]`}
          >
            <option value="">Все</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {showType && (
        <Field label="Тип файла">
          <select
            value={v.type}
            onChange={(e) => set({ type: e.target.value })}
            className={`${inputCls} min-w-[7rem]`}
          >
            <option value="">Все</option>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Дата от">
        <input
          type="date"
          value={v.dateFrom}
          onChange={(e) => set({ dateFrom: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Дата до">
        <input
          type="date"
          value={v.dateTo}
          onChange={(e) => set({ dateTo: e.target.value })}
          className={inputCls}
        />
      </Field>

      {hasAny && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="px-3 py-1.5 rounded-md text-xs text-brand-muted hover:text-brand-error"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
