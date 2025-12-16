'use client';

import clsx from 'clsx';

interface Option {
  id: string;
  name: string;
  detail?: string;
}

interface Props {
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}

export function MultiSelect({ options, selected, onToggle }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {options.map(opt => {
        const isActive = selected.includes(opt.id);
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            className={clsx(
              'p-3 rounded-lg border-2 text-sm font-medium transition text-left',
              isActive
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
            )}
          >
            <div>{opt.name}</div>
            {opt.detail && <div className="text-xs text-slate-400">{opt.detail}</div>}
          </button>
        );
      })}
    </div>
  );
}
