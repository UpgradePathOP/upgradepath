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
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 border border-slate-100 dark:border-slate-800">
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4 flex items-center gap-2">
        <Monitor className="w-5 h-5" />
        Specific Part Picks (by budget)
      </h3>
      <div className="grid md:grid-cols-2 gap-4">
        {recommendations.map(group => (
          <div key={group.category} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {iconFor(group.category)}
              <p className="font-semibold text-slate-900 dark:text-slate-50">{group.category} upgrades</p>
            </div>
            {group.items.length === 0 && (
              <p className="text-sm text-slate-500">No clear upgrade within budget.</p>
            )}
            <div className="space-y-2">
              {group.items.map(item => (
                <div key={item.id} className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.name}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">${item.price}</span>
                  </div>
                  {typeof item.percentGain === 'number' ? (
                    <div className="text-xs text-emerald-600 dark:text-emerald-300 font-semibold">
                      Est. gain: +{item.percentGain}% FPS (target titles)
                    </div>
                  ) : item.score !== undefined ? (
                    <div className="text-xs text-slate-500 dark:text-slate-300">Score: {item.score}</div>
                  ) : null}
                  <div className="text-xs text-brand-700 dark:text-brand-200 mt-1">{item.reason}</div>
                  {item.compatibilityNote && (
                    <div className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                      {item.compatibilityNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
