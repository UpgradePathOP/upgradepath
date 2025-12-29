'use client';

import clsx from 'clsx';

interface Option {
  id: string;
  name: string;
  detail?: string;
  cpuWeight?: number;
  gpuWeight?: number;
}

interface Props {
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}

export function MultiSelect({ options, selected, onToggle }: Props) {
  const getWorkload = (opt: Option) => {
    const cpu = opt.cpuWeight ?? 0.5;
    const gpu = opt.gpuWeight ?? 0.5;
    const delta = cpu - gpu;
    if (Math.abs(delta) < 0.12) return 'balanced';
    return delta > 0 ? 'cpu' : 'gpu';
  };

  const indicatorClass = (type: 'cpu' | 'gpu' | 'balanced') => {
    const base = 'bg-slate-400/60 dark:bg-muted/60';
    if (type === 'cpu') return `h-3 w-1 rounded-full ${base}`;
    if (type === 'gpu') return `h-1 w-3 rounded-full ${base}`;
    return `h-1.5 w-1.5 rounded-full ${base}`;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {options.map(opt => {
        const isActive = selected.includes(opt.id);
        const workload = getWorkload(opt);
        const tooltip = workload === 'cpu' ? 'CPU-heavy' : workload === 'gpu' ? 'GPU-heavy' : 'Balanced';
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            title={opt.name}
            className={clsx(
              'group h-14 p-2 rounded-lg border-2 text-[13px] font-medium transition text-left leading-tight',
              isActive
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-[#171a1f] dark:text-brand-100'
                : 'border-slate-200 dark:border-border bg-white dark:bg-surface text-slate-600 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
            )}
          >
            <div className="grid grid-cols-[1fr_auto] items-start gap-2">
              <div className="min-w-0">
                <div
                  className="whitespace-normal break-words"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {opt.name}
                </div>
                {opt.detail && <div className="text-xs text-slate-400 dark:text-muted">{opt.detail}</div>}
              </div>
              <div className="relative flex items-center justify-center self-center">
                <span className={indicatorClass(workload)} aria-hidden="true" />
                <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 dark:border-border bg-white dark:bg-surface px-2 py-1 text-[11px] text-slate-500 dark:text-muted opacity-0 transition-opacity delay-300 group-hover:opacity-100">
                  {tooltip}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
