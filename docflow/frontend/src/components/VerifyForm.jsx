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

const ITEM_COLUMNS = [
  { key: 'name', label: 'Наименование', className: 'py-1 pr-2' },
  { key: 'quantity', label: 'Кол-во', className: 'py-1 px-2' },
  { key: 'unit', label: 'Ед.', className: 'py-1 px-2' },
  { key: 'unit_price', label: 'Цена', className: 'py-1 px-2' },
  { key: 'total_price', label: 'Сумма', className: 'py-1 px-2' },
];

const MISSING_HINT = 'Нейросеть не заполнила это поле — проверьте и введите вручную.';

function errorForField(errors, key) {
  if (!errors) return '';
  for (const e of errors) {
    if (typeof e === 'string' && e.startsWith(`${key}:`)) {
      return e.slice(key.length + 1).trim();
    }
  }
  return '';
}

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

export default function VerifyForm({
  data,
  aiData,
  errors = [],
  onChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
}) {
  if (!data) return null;

  const missingFromAI = (key) => isEmpty(aiData?.[key]);
  const missingInItem = (idx, key) => {
    const aiItem = aiData?.items?.[idx];
    // если ИИ не вернул строку вообще — считаем все ячейки «добавленными руками»
    if (!aiItem) return false;
    return isEmpty(aiItem?.[key]);
  };

  return (
    <div className="space-y-5">
      {FIELD_GROUPS.map((group) => (
        <section
          key={group.title}
          className="bg-white rounded-lg border border-kzn-line p-4 shadow-card"
        >
          <h3 className="text-sm font-semibold text-kzn-green mb-3 uppercase tracking-wide">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.fields.map((f) => {
              const validationError = errorForField(errors, f.key);
              const missing = missingFromAI(f.key);
              // «заполнено» смотрим по текущему значению (с учётом пользовательских правок)
              const filled = !isEmpty(data[f.key]);
              const showRed = validationError || (missing && !filled);
              const tooltip =
                validationError || (missing && !filled ? MISSING_HINT : '');
              return (
                <div key={f.key}>
                  <label className="flex items-center gap-2 text-xs font-medium text-kzn-muted mb-1">
                    {f.label}
                    {missing && !filled && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-kzn-red font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-kzn-red" />
                        Не распознано
                      </span>
                    )}
                  </label>
                  <ValidationTooltip message={tooltip}>
                    <input
                      type="text"
                      value={data[f.key] || ''}
                      onChange={(e) => onChange(f.key, e.target.value)}
                      placeholder={missing ? 'Заполните вручную' : ''}
                      className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-kzn-green/40 ${
                        showRed
                          ? 'border-red-500 bg-red-50 placeholder-red-400'
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
                {ITEM_COLUMNS.map((c) => (
                  <th key={c.key} className={c.className}>
                    {c.label}
                  </th>
                ))}
                <th className="py-2 pl-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((item, idx) => (
                <tr key={idx} className="border-t border-kzn-line">
                  {ITEM_COLUMNS.map((c) => {
                    const missing = missingInItem(idx, c.key);
                    const filled = !isEmpty(item[c.key]);
                    const showRed = missing && !filled;
                    return (
                      <td key={c.key} className={c.className}>
                        <ValidationTooltip message={showRed ? MISSING_HINT : ''}>
                          <input
                            type="text"
                            value={item[c.key] || ''}
                            onChange={(e) =>
                              onItemChange(idx, c.key, e.target.value)
                            }
                            className={`w-full px-2 py-1.5 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-kzn-green/40 ${
                              showRed
                                ? 'border-red-500 bg-red-50 placeholder-red-400'
                                : 'border-kzn-line bg-white'
                            }`}
                          />
                        </ValidationTooltip>
                      </td>
                    );
                  })}
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
                  <td colSpan={ITEM_COLUMNS.length + 1} className="py-4 text-center text-kzn-muted">
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
