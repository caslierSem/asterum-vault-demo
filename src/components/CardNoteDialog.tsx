import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote, X } from 'lucide-react';

interface CardNoteDialogProps {
  title: string;
  notes: string;
  onClose: () => void;
}

export default function CardNoteDialog({ title, notes, onClose }: CardNoteDialogProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-note-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StickyNote className="h-4 w-4 shrink-0 text-amber-600" />
            <h2 id="card-note-title" className="truncate text-sm font-semibold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭备注"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{notes}</p>
      </div>
    </div>,
    document.body,
  );
}
