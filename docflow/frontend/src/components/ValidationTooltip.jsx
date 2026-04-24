import { useState } from 'react';

export default function ValidationTooltip({ message, children }) {
  const [open, setOpen] = useState(false);
  const show = Boolean(message) && open;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {show && (
        <div className="absolute left-0 -top-2 -translate-y-full z-10 px-2.5 py-1.5 rounded-md bg-brand-error text-white text-xs shadow-lg max-w-xs whitespace-pre-wrap pointer-events-none">
          {message}
          <span className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-brand-error" />
        </div>
      )}
    </div>
  );
}
