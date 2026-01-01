import { getAffiliateLinks } from '@/lib/affiliate';
import { AnalysisResult } from '@/lib/types';
import { HardDrive, Cpu, Monitor, MemoryStick } from 'lucide-react';

export function PartsCard({ recommendations }: { recommendations: AnalysisResult['recommendedParts'] }) {
  const categoryOrder = ['GPU', 'CPU', 'RAM', 'Storage', 'Monitor'];
  const orderedRecommendations = recommendations
    .map((group, idx) => ({ group, idx }))
    .sort((a, b) => {
      const aPos = categoryOrder.indexOf(a.group.category);
      const bPos = categoryOrder.indexOf(b.group.category);
      const aRank = aPos === -1 ? Number.POSITIVE_INFINITY : aPos;
      const bRank = bPos === -1 ? Number.POSITIVE_INFINITY : bPos;
      if (aRank !== bRank) return aRank - bRank;
      return a.idx - b.idx;
    })
    .map(entry => entry.group);

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
          Buy options (support this project). Links don&apos;t affect recommendations.
        </p>
      </div>
      <div className="columns-1 md:columns-2 [column-gap:1rem]">
        {orderedRecommendations.map(group => (
          <div
            key={group.category}
            className="mb-4 break-inside-avoid border border-slate-200 dark:border-border rounded-lg p-4 h-fit"
          >
            <div className="flex items-center gap-2 mb-3">
              {iconFor(group.category)}
              <p className="font-semibold text-slate-900 dark:text-slate-50">{group.category} upgrades</p>
            </div>
            {group.items.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-muted">No clear upgrade within budget.</p>
            )}
            <div className="space-y-2">
              {(() => {
                const categoryOrder =
                  group.category === 'GPU'
                    ? ['Fastest within budget', 'Best value per dollar', 'Balanced']
                    : [];
                const orderedItems =
                  group.category === 'GPU'
                    ? [...group.items].sort((a, b) => {
                        const aRank = categoryOrder.findIndex(label =>
                          (a.label ?? '').toLowerCase().includes(label.toLowerCase())
                        );
                        const bRank = categoryOrder.findIndex(label =>
                          (b.label ?? '').toLowerCase().includes(label.toLowerCase())
                        );
                        const aPos = aRank === -1 ? Number.POSITIVE_INFINITY : aRank;
                        const bPos = bRank === -1 ? Number.POSITIVE_INFINITY : bRank;
                        if (aPos !== bPos) return aPos - bPos;
                        return 0;
                      })
                    : group.items;

                return orderedItems.map(item => {
                const links = getAffiliateLinks(item);
                const hasSearch = links.some(link => link.kind === 'search');
                const labelText = (item.label ?? '').toLowerCase();
                const isBest = labelText.includes('best value');
                const isFast = labelText.includes('fastest');
                const isBalanced = labelText.includes('balanced');
                const labelTone = isBest
                  ? 'text-brand-600 dark:text-brand-300'
                  : isFast
                  ? 'text-sky-600 dark:text-sky-300'
                  : isBalanced
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-slate-500 dark:text-muted';
                const gainTone = isBest
                  ? 'text-brand-600 dark:text-brand-400'
                  : isFast
                  ? 'text-sky-600 dark:text-sky-300'
                  : isBalanced
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-brand-600 dark:text-brand-400';
                const cardTone = isFast
                  ? 'border border-sky-500/40 dark:border-sky-500/30 bg-sky-50/40 dark:bg-sky-500/10 ring-1 ring-sky-500/10'
                  : isBest
                  ? 'border border-brand-500/40 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/10 ring-1 ring-brand-500/10'
                  : 'border border-slate-200/60 dark:border-border bg-slate-50 dark:bg-border/40';
                return (
                  <div key={item.id} className={`rounded-lg p-3 ${cardTone}`}>
                  {item.label && (
                    <p className={`text-[11px] uppercase tracking-[0.2em] mb-1 ${labelTone}`}>
                      {item.label}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.name}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ${item.price}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {item.partType === 'GPU' && typeof item.avgFpsGainPct === 'number' && item.avgFpsGainPct > 0 && (
                      <div className={`text-xs font-semibold ${gainTone}`}>
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
                    <div className="flex flex-wrap gap-2">
                      {links.map(link => (
                        <a
                          key={`${item.id}-${link.vendor}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-brand-400/40 dark:border-brand-500/30 bg-gradient-to-b from-slate-100 to-slate-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 shadow-sm transition hover:border-brand-500 hover:from-slate-200 hover:to-slate-300 hover:text-brand-800 hover:shadow-md dark:from-slate-900/80 dark:to-slate-900/40 dark:text-brand-300 dark:hover:from-slate-800 dark:hover:to-slate-900/60 dark:hover:text-brand-200"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
                );
              });
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
