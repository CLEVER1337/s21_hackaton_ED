function tone(pct) {
  if (pct >= 80) return 'bg-brand-success';
  if (pct >= 50) return 'bg-brand-sky';
  if (pct > 0) return 'bg-brand-warning';
  return 'bg-brand-error';
}

export default function CompletenessBar({ value, status }) {
  if (status === 'processing') {
    return <span className="text-xs text-brand-muted">обрабатывается…</span>;
  }
  if (status === 'error') {
    return <span className="text-xs text-brand-error">—</span>;
  }
  const pct = Math.round((Number(value) || 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-brand-light rounded overflow-hidden min-w-[80px]">
        <div
          className={`h-full ${tone(pct)} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-brand-muted w-10 text-right">
        {pct}%
      </span>
    </div>
  );
}
