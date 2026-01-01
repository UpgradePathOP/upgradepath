import { getAffiliateLinks } from '@/lib/affiliate';
import { AnalysisResult } from '@/lib/types';
import { HardDrive, Cpu, Monitor, MemoryStick } from 'lucide-react';

export function PartsCard({ recommendations }: { recommendations: AnalysisResult['recommendedParts'] }) {
  const iconFor = (category: string) => {
    if (category === 'CPU') return <Cpu className="w-4 h-4" />;
    if (category === 'GPU') return <Monitor className="w-4 h-4" />;
    if (category === 'RAM') return <MemoryStick className="w-4 h-4" />;
    if (category === 'Storage') return <HardDrive className="w-4 h-4" />;
    if (category === 'Monitor') return <Monitor className="w-4 h-4" />;
    return null;
  };

  return (
    <div className="bg-white dark:bg-surface rounded-xl shadow-lg p-6 border border-slate-100 dark:border-border">
      <div className="mb-4 space-y-1">
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          Specific Part Picks (by budget)
        </h3>
        <p className="text-xs text-slate-500 dark:text-muted">
          Some links may be affiliate links. They don&apos;t affect recommendations.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {recommendations.map(group => (
          <div key={group.category} className="border border-slate-200 dark:border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {iconFor(group.category)}
              <p className="font-semibold text-slate-900 dark:text-slate-50">{group.category} upgrades</p>
            </div>
            {group.items.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-muted">No clear upgrade within budget.</p>
            )}
            <div className="space-y-2">
              {group.items.map(item => {
                const links = getAffiliateLinks(item);
                const hasSearch = links.some(link => link.kind === 'search');
                return (
                  <div key={item.id} className="bg-slate-50 dark:bg-surface/70 rounded-lg p-3">
                  {item.label && (
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-muted mb-1">
                      {item.label}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.name}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">${item.price}</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {item.partType === 'GPU' && typeof item.avgFpsGainPct === 'number' && item.avgFpsGainPct > 0 && (
                      <div className="text-xs text-brand-600 dark:text-brand-400 font-semibold">
                        {item.avgFpsGainLabel ?? 'Avg FPS'}: +{item.avgFpsGainPct}%
                      </div>
                    )}
                    {item.partType === 'GPU' && item.confidence && item.confidence !== 'confirmed' && (
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-muted">
                        {item.confidence}
                      </div>
                    )}
                    {item.qualitativeBullets.map((bullet, idx) => (
                      <div key={`${item.id}-bullet-${idx}`} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-slate-400 mt-2" />
                        <p className="text-xs text-slate-600 dark:text-slate-300">{bullet}</p>
                      </div>
                    ))}
                  </div>
                  {item.notes.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {item.notes.map((note, idx) => (
                        <div key={`${item.id}-note-${idx}`} className="text-xs text-warning-600 dark:text-warning-300">
                          {note}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-muted mb-2">
                      Buy options (support this project)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {links.map(link => (
                        <a
                          key={`${item.id}-${link.vendor}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-slate-300/60 dark:border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200 hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
