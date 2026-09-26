import { IconAlertTriangle, IconBoxOff } from '@tabler/icons-react';
import { fmtQty } from '@/lib/constants';
import type { Dashboard } from '@/lib/types';

export function StockAlerts({ alerts }: { alerts: Dashboard['alerts'] }) {
  return (
    <section className="rounded-lg border border-b1 bg-s0">
      <h2 className="border-b border-b1 px-4 py-3 text-sm font-medium">Stock alerts</h2>
      {alerts.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-t3">Every product is above its minimum.</p>
      ) : (
        <ul className="divide-y divide-b1">
          {alerts.map((a) => {
            const out = a.on_hand <= 0;
            return (
              <li key={a.product_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {out ? <IconBoxOff size={16} className="shrink-0 text-accent" /> : <IconAlertTriangle size={16} className="shrink-0 text-warn" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{a.name}</div>
                  <div className="font-mono text-xs text-t3">{a.sku}</div>
                </div>
                <div className="text-right tabular">
                  <div className={out ? 'text-accent' : 'text-warn'}>{fmtQty(a.on_hand)} {a.uom}</div>
                  <div className="text-xs text-t3">{out ? 'Out of stock' : `Low · min ${fmtQty(a.min_qty)}`}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
