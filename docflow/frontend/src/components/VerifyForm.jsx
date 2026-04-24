import ValidationTooltip from './ValidationTooltip.jsx';

const FIELD_GROUPS = [
  {
    title: 'Реквизиты документа',
    fields: [
      { key: 'document_type', label: 'Тип документа' },
      { key: 'document_number', label: 'Номер' },
      { key: 'document_date', label: 'Дата (ДД.ММ.ГГГГ)' },
      { key: 'currency', label: 'Валюта' },
    ],
  },
  {
    title: 'Поставщик',
    fields: [
      { key: 'supplier_name', label: 'Наименование' },
      { key: 'supplier_inn', label: 'ИНН' },
    ],
  },
  {
    title: 'Покупатель',
    fields: [
      { key: 'buyer_name', label: 'Наименование' },
      { key: 'buyer_inn', label: 'ИНН' },
    ],
  },
  {
    title: 'Суммы',
    fields: [
      { key: 'total_amount', label: 'Сумма итого' },
      { key: 'vat_amount', label: 'В т.ч. НДС' },
    ],
  },
];

function errorForField(errors, key) {
  if (!errors) return '';
  for (const e of errors) {
    if (typeof e === 'string' && e.startsWith(`${key}:`)) {
      return e.slice(key.length + 1).trim();
    }
  }
  return '';
}

export default function VerifyForm({
  data,
  errors = [],
  onChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
}) {
  if (!data) return null;

  return (
    <div className="space-y-5">
      {FIELD_GROUPS.map((group) => (
        <section key={group.title} className="bg-white rounded-lg border border-kzn-line p-4 shadow-card">
          <h3 className="text-sm font-semibold text-kzn-green mb-3 uppercase tracking-wide">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.fields.map((f) => {
              const err = errorForField(errors, f.key);
              return (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-kzn-muted mb-1">
                    {f.label}
                  </label>
                  <ValidationTooltip message={err}>
                    <input
                      type="text"
                      value={data[f.key] || ''}
                      onChange={(e) => onChange(f.key, e.target.value)}
                      className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-kzn-green/40 ${
                        err
                          ? 'border-red-500 bg-red-50'
                          : 'border-kzn-line bg-white'
                      }`}
                    />
                  </ValidationTooltip>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="bg-white rounded-lg border border-kzn-line p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-kzn-green uppercase tracking-wide">
            Товары / услуги
          </h3>
          <button
            onClick={onAddItem}
            className="text-xs px-2.5 py-1 rounded-md bg-kzn-green text-white hover:bg-kzn-green-dark"
          >
            + строка
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-kzn-muted uppercase">
                <th className="py-2 pr-2">Наименование</th>
                <th className="py-2 px-2 w-20">Кол-во</th>
                <th className="py-2 px-2 w-20">Ед.</th>
                <th className="py-2 px-2 w-28">Цена</th>
                <th className="py-2 px-2 w-28">Сумма</th>
                <th className="py-2 pl-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((item, idx) => (
                <tr key={idx} className="border-t border-kzn-line">
                  <td className="py-1 pr-2">
                    <input
                      type="text"
                      value={item.name || ''}
                      onChange={(e) => onItemChange(idx, 'name', e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-kzn-line text-sm"
                    />
                  </td>
                  {['quantity', 'unit', 'unit_price', 'total_price'].map((k) => (
                    <td key={k} className="py-1 px-2">
                      <input
                        type="text"
                        value={item[k] || ''}
                        onChange={(e) => onItemChange(idx, k, e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-kzn-line text-sm"
                      />
                    </td>
                  ))}
                  <td className="py-1 pl-2 text-right">
                    <button
                      onClick={() => onRemoveItem(idx)}
                      className="text-kzn-red hover:text-kzn-red-dark text-lg leading-none"
                      title="Удалить строку"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {(data.items || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-kzn-muted">
                    Нет строк — таблица не распознана или документ без позиций.
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
