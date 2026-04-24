import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentViewer from '../components/DocumentViewer.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import VerifyForm from '../components/VerifyForm.jsx';
import { getFileUrl } from '../api.js';
import { useStore } from '../store.js';

const EMPTY_ITEM = {
  name: '',
  quantity: '',
  unit: '',
  unit_price: '',
  total_price: '',
};

function mergeData(aiData, draft) {
  const base = aiData || {
    document_type: '',
    document_number: '',
    document_date: '',
    supplier_name: '',
    supplier_inn: '',
    buyer_name: '',
    buyer_inn: '',
    total_amount: '',
    vat_amount: '',
    currency: 'RUB',
    items: [],
  };
  if (!draft) return { ...base, items: [...(base.items || [])] };
  return {
    ...base,
    ...draft,
    items: draft.items !== undefined ? draft.items : [...(base.items || [])],
  };
}

export default function Verify() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    currentDoc,
    fetchDocument,
    draftEdits,
    replaceDraft,
    clearDraft,
    loadDraftFromStorage,
    saveDocument,
    approveDocument,
  } = useStore();

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchDocument(id).then((doc) => {
      if (doc) loadDraftFromStorage(id);
    });
  }, [id, fetchDocument, loadDraftFromStorage]);

  const draft = draftEdits[id];
  const formData = useMemo(
    () => mergeData(currentDoc?.data, draft),
    [currentDoc, draft],
  );

  if (!currentDoc) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-kzn-muted">
        Загрузка документа…
      </div>
    );
  }

  if (currentDoc.status === 'processing') {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-lg bg-white border border-kzn-line p-6 text-center">
          <span className="spinner text-kzn-green" />
          <div className="mt-3 font-medium">Документ ещё обрабатывается</div>
          <div className="text-sm text-kzn-muted">
            Обновите страницу чуть позже.
          </div>
          <Link
            to="/"
            className="inline-block mt-4 text-sm text-kzn-green hover:underline"
          >
            ← Вернуться к списку
          </Link>
        </div>
      </div>
    );
  }

  const handleChange = (field, value) => {
    const next = { ...formData, [field]: value };
    replaceDraft(id, next);
  };

  const handleItemChange = (idx, field, value) => {
    const items = [...(formData.items || [])];
    items[idx] = { ...items[idx], [field]: value };
    replaceDraft(id, { ...formData, items });
  };

  const handleAddItem = () => {
    const items = [...(formData.items || []), { ...EMPTY_ITEM }];
    replaceDraft(id, { ...formData, items });
  };

  const handleRemoveItem = (idx) => {
    const items = (formData.items || []).filter((_, i) => i !== idx);
    replaceDraft(id, { ...formData, items });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('');
    try {
      await saveDocument(id, formData);
      setSaveStatus('Сохранено');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Сбросить все ваши правки и вернуться к данным AI?')) return;
    clearDraft(id);
    await fetchDocument(id);
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await saveDocument(id, formData);
      await approveDocument(id);
      clearDraft(id);
      navigate(`/results/${id}`);
    } catch (err) {
      setSaveStatus(err.response?.data?.error || 'Ошибка утверждения');
    } finally {
      setApproving(false);
    }
  };

  const fileUrl = getFileUrl(id);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-kzn-green hover:underline">
            ← К списку
          </Link>
          <StatusBadge status={currentDoc.status} />
          <span className="text-sm text-kzn-muted">{currentDoc.filename}</span>
        </div>
        {saveStatus && (
          <span className="text-xs text-kzn-muted">{saveStatus}</span>
        )}
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)' }}
      >
        <div className="min-w-0">
          <DocumentViewer
            fileUrl={fileUrl}
            fileType={currentDoc.file_type}
            filename={currentDoc.filename}
            fileSize={currentDoc.file_size}
          />
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          {currentDoc.validation_errors?.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3">
              <div className="font-medium mb-1">Автопроверка выделила:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {currentDoc.validation_errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <VerifyForm
            data={formData}
            errors={currentDoc.validation_errors}
            onChange={handleChange}
            onItemChange={handleItemChange}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
          />

          <div className="sticky bottom-2 flex flex-wrap gap-2 bg-white border border-kzn-line rounded-lg p-3 shadow-card">
            <button
              onClick={handleSave}
              disabled={saving || approving}
              className="px-4 py-2 rounded-md bg-kzn-cream text-kzn-ink border border-kzn-line hover:bg-kzn-sand text-sm"
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              onClick={handleReset}
              disabled={saving || approving}
              className="px-4 py-2 rounded-md border border-kzn-line text-kzn-muted hover:text-kzn-red hover:border-kzn-red text-sm"
            >
              Сбросить к AI-результату
            </button>
            <button
              onClick={handleApprove}
              disabled={saving || approving}
              className="ml-auto px-5 py-2 rounded-md bg-kzn-green text-white font-medium hover:bg-kzn-green-dark disabled:opacity-60 text-sm inline-flex items-center gap-2"
            >
              {approving && <span className="spinner" />}
              {approving ? 'Утверждение…' : 'Утвердить и перейти к экспорту'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
