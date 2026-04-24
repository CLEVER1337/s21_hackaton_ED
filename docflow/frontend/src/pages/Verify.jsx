import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentViewer from '../components/DocumentViewer.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import VerifyForm from '../components/VerifyForm.jsx';
import ErrorDetails from '../components/ErrorDetails.jsx';
import CompletenessBar from '../components/CompletenessBar.jsx';
import { getFileUrl } from '../api.js';
import { useStore } from '../store.js';
import { confirmDialog, notify } from '../components/Toast.jsx';

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
    retryDocument,
  } = useStore();

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [retrying, setRetrying] = useState(false);
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
      <div className="max-w-6xl mx-auto px-6 py-10 text-brand-muted">
        Загрузка документа…
      </div>
    );
  }

  if (currentDoc.status === 'processing') {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-lg bg-white border border-brand-line p-6 text-center">
          <span className="spinner text-brand-blue" />
          <div className="mt-3 font-medium">Документ ещё обрабатывается</div>
          <div className="text-sm text-brand-muted">
            Обновите страницу чуть позже — страница сама подтянет результат.
          </div>
          <Link
            to="/"
            className="inline-block mt-4 text-sm text-brand-blue hover:underline"
          >
            ← Вернуться к списку
          </Link>
        </div>
      </div>
    );
  }

  if (currentDoc.status === 'error') {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-lg bg-white border border-brand-line p-6 space-y-3">
          <div className="flex items-center gap-2">
            <StatusBadge status="error" />
            <span className="text-sm text-brand-muted truncate">
              {currentDoc.filename}
            </span>
          </div>
          <div className="text-base font-medium">
            Не удалось обработать документ.
          </div>
          <ErrorDetails
            message={currentDoc.error_message}
            retryCount={currentDoc.retry_count}
            onRetry={async () => {
              setRetrying(true);
              try {
                await retryDocument(id);
                notify.info('Повторная обработка запущена');
                await fetchDocument(id);
              } catch (err) {
                notify.error(
                  err.response?.data?.error || 'Не удалось запустить повтор',
                );
              } finally {
                setRetrying(false);
              }
            }}
            retryBusy={retrying}
          />
          <Link
            to="/"
            className="inline-block mt-4 text-sm text-brand-blue hover:underline"
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
      notify.success('Правки сохранены');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      const msg = err.response?.data?.error || 'Ошибка сохранения';
      setSaveStatus(msg);
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: 'Сбросить ваши правки?',
      message: 'Вернуться к данным, полученным от нейросети.',
      confirmText: 'Сбросить',
      tone: 'danger',
    });
    if (!ok) return;
    clearDraft(id);
    await fetchDocument(id);
    notify.info('Правки сброшены');
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await saveDocument(id, formData);
      await approveDocument(id);
      clearDraft(id);
      notify.success('Документ утверждён');
      navigate(`/results/${id}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Ошибка утверждения';
      setSaveStatus(msg);
      notify.error(msg);
    } finally {
      setApproving(false);
    }
  };

  const fileUrl = getFileUrl(id);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/" className="text-sm text-brand-blue hover:underline">
            ← К списку
          </Link>
          <StatusBadge status={currentDoc.status} />
          <span className="text-sm text-brand-muted truncate max-w-sm">
            {currentDoc.filename}
          </span>
          <div className="flex items-center gap-2 min-w-[160px]">
            <span className="text-xs text-brand-muted">Качество AI:</span>
            <CompletenessBar
              value={currentDoc.completeness}
              status={currentDoc.status}
            />
          </div>
        </div>
        {saveStatus && (
          <span className="text-xs text-brand-muted">{saveStatus}</span>
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
            aiData={currentDoc.data}
            errors={currentDoc.validation_errors}
            onChange={handleChange}
            onItemChange={handleItemChange}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
          />

          <div className="sticky bottom-2 flex flex-wrap gap-2 bg-white border border-brand-line rounded-lg p-3 shadow-card">
            <button
              onClick={handleSave}
              disabled={saving || approving}
              className="px-4 py-2 rounded-md bg-brand-light text-brand-ink border border-brand-line hover:bg-brand-light text-sm"
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              onClick={handleReset}
              disabled={saving || approving}
              className="px-4 py-2 rounded-md border border-brand-line text-brand-muted hover:text-brand-error hover:border-brand-error text-sm"
            >
              Сбросить к AI-результату
            </button>
            <button
              onClick={handleApprove}
              disabled={saving || approving}
              className="ml-auto px-5 py-2 rounded-md bg-brand-blue text-white font-medium hover:bg-brand-navy disabled:opacity-60 text-sm inline-flex items-center gap-2"
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
