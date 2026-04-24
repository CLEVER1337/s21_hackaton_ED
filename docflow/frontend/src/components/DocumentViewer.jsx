import { useState } from 'react';

export default function DocumentViewer({ fileUrl, fileType, filename, fileSize }) {
  const [scale, setScale] = useState(1);
  const isPdf = fileType === 'pdf';

  const sizeLabel = fileSize
    ? `${(fileSize / 1024 / 1024).toFixed(2)} MB`
    : '';

  return (
    <div className="h-full flex flex-col bg-kzn-sand/30 border border-kzn-line rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-kzn-line text-sm">
        <div className="truncate flex-1" title={filename}>
          <span className="font-medium">{filename}</span>
          {sizeLabel && <span className="text-kzn-muted ml-2">{sizeLabel}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}
            className="px-2 py-1 rounded border border-kzn-line hover:bg-kzn-cream text-xs"
            title="Уменьшить"
          >
            −
          </button>
          <span className="text-xs w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, +(s + 0.1).toFixed(2)))}
            className="px-2 py-1 rounded border border-kzn-line hover:bg-kzn-cream text-xs"
            title="Увеличить"
          >
            +
          </button>
          <button
            onClick={() => setScale(1)}
            className="px-2 py-1 rounded border border-kzn-line hover:bg-kzn-cream text-xs"
            title="Сбросить"
          >
            1:1
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            width: '100%',
            height: '100%',
          }}
        >
          {isPdf ? (
            <iframe
              src={fileUrl}
              title={filename}
              className="w-full h-[75vh] bg-white border border-kzn-line rounded"
            />
          ) : (
            <img
              src={fileUrl}
              alt={filename}
              className="max-w-full mx-auto bg-white border border-kzn-line rounded"
            />
          )}
        </div>
      </div>
    </div>
  );
}
