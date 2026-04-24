import { useRef, useState } from 'react';

const ACCEPTED = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const DOC_EXTS = ['.pdf', '.doc', '.docx'];
const IMG_EXTS = ['.jpg', '.jpeg', '.png'];
const MAX_PDF = 40 * 1024 * 1024;
const MAX_IMG = 15 * 1024 * 1024;

function validateFile(f) {
  const name = f.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  if (!ACCEPTED.includes(ext)) {
    return `Неподдерживаемый формат (${ext || '?'})`;
  }
  if (DOC_EXTS.includes(ext) && f.size > MAX_PDF) {
    return 'Документ превышает 40MB';
  }
  if (IMG_EXTS.includes(ext) && f.size > MAX_IMG) {
    return 'Изображение превышает 15MB';
  }
  return null;
}

export default function FileDropZone({ onFiles, disabled }) {
  const [active, setActive] = useState(false);
  const [errors, setErrors] = useState([]);
  const inputRef = useRef(null);

  const handleFiles = (rawList) => {
    const files = Array.from(rawList || []);
    if (files.length === 0) return;
    const errs = [];
    const accepted = [];
    for (const f of files) {
      const err = validateFile(f);
      if (err) errs.push(`${f.name}: ${err}`);
      else accepted.push(f);
    }
    setErrors(errs);
    if (accepted.length > 0) onFiles(accepted);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setActive(false);
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`cursor-pointer select-none border-2 border-dashed rounded-xl p-10 text-center transition ${
          active
            ? 'border-kzn-green bg-kzn-green/10'
            : 'border-kzn-line bg-white hover:border-kzn-green hover:bg-kzn-green/5'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <div className="text-kzn-green text-5xl leading-none mb-3">⇪</div>
        <div className="text-lg font-medium text-kzn-ink">
          Перетащите PDF / DOC / DOCX / JPG / PNG сюда
        </div>
        <div className="text-sm text-kzn-muted mt-1">
          или нажмите, чтобы выбрать файлы · до 40MB документ / 15MB изображение
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {errors.length > 0 && (
        <div className="mt-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}
