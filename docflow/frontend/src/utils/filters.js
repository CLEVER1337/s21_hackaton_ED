export const EMPTY_FILTERS = {
  query: '',
  status: '',
  type: '',
  dateFrom: '',
  dateTo: '',
};

// Parse «ДД.ММ.ГГГГ» → Date at local midnight, or null.
function parseRuDate(s) {
  if (!s) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseIsoDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STATUS_LABELS = {
  processing: 'Обработка',
  ready: 'Готов к проверке',
  approved: 'Утверждён',
  error: 'Ошибка',
};

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([v, l]) => ({
  value: v,
  label: l,
}));

export const TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'doc', label: 'DOC' },
  { value: 'docx', label: 'DOCX' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
];

export function applyFilters(documents, filters) {
  if (!Array.isArray(documents)) return [];
  const q = (filters.query || '').trim().toLowerCase();
  const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const to = filters.dateTo ? new Date(filters.dateTo) : null;

  return documents.filter((d) => {
    if (filters.status && d.status !== filters.status) return false;
    if (filters.type && d.file_type !== filters.type) return false;

    if (q) {
      const hay = [
        d.filename,
        d.data?.document_number,
        d.data?.supplier_name,
        d.data?.buyer_name,
        d.data?.document_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    const docDate = parseRuDate(d.data?.document_date) || parseIsoDate(d.updated_at);
    if (from && docDate && docDate < from) return false;
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      if (docDate && docDate > endOfDay) return false;
    }
    return true;
  });
}
