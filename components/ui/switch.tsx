'use client';

import clsx from 'clsx';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Switch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      aria-pressed={checked}
    >
      <span className="text-sm text-slate-600 dark:text-muted">{label}</span>
      <span
        className={clsx(
          'w-11 h-6 rounded-full p-1 transition',
          checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-border'
        )}
      >
        <span
          className={clsx(
            'block w-4 h-4 rounded-full bg-white shadow transform transition',
            checked ? 'translate-x-5' : ''
          )}
        />
      </span>
    </button>
  );
}
