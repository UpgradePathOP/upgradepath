'use client';

import { useMemo, useState } from 'react';
import { LucideIcon, Search } from 'lucide-react';
import clsx from 'clsx';

interface Option {
  id: string;
  name: string;
  subtitle?: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  icon?: LucideIcon;
  label?: string;
  allowClear?: boolean;
}

export function SearchableSelect({ options, value, onChange, placeholder, icon: Icon, allowClear }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => options.filter(o => o.name.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const selected = options.find(o => o.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 dark:border-border rounded-lg bg-white dark:bg-surface hover:border-brand-500 dark:hover:border-brand-500 transition"
      >
        {Icon ? (
          <Icon className="w-5 h-5 text-slate-400 dark:text-muted" />
        ) : (
          <Search className="w-4 h-4 text-slate-400 dark:text-muted" />
        )}
        <span
          className={clsx(
            'text-left flex-1',
            selected ? 'text-slate-900 dark:text-slate-50' : 'text-slate-400 dark:text-muted'
          )}
        >
          {selected ? selected.name : placeholder}
        </span>
      </button>
      {open && (
        <div className="absolute z-20 w-full mt-2 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-xl shadow-xl">
          <div className="p-3 border-b border-slate-200 dark:border-border flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 dark:text-muted" />
            <input
              className="w-full bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {allowClear && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full text-left px-4 py-3 text-slate-500 dark:text-muted hover:bg-brand-50 dark:hover:bg-[#171a1f] transition"
              >
                {placeholder}
              </button>
            )}
            {filtered.map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full text-left px-4 py-3 hover:bg-brand-50 dark:hover:bg-[#171a1f] transition"
              >
                <div className="text-sm text-slate-900 dark:text-slate-100">{opt.name}</div>
                {opt.subtitle && <div className="text-xs text-slate-500 dark:text-muted">{opt.subtitle}</div>}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-4 py-3 text-sm text-slate-500 dark:text-muted">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
