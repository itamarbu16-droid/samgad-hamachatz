import type { ReactNode } from 'react';
import { ChevronDown, UsersRound } from 'lucide-react';

/** Keep group assignments scannable; expand without hiding any available action. */
export function TaskCompletionSummary({ total, completed, pending, children }: {
  total: number; completed: number; pending: number; children: ReactNode;
}) {
  if (total <= 1) return <>{children}</>;
  return <details className="completion-group">
    <summary>
      <UsersRound size={18} aria-hidden="true" />
      <span><strong>ביצוע לפי אחראי</strong><small>{completed} מתוך {total} ביצעו{pending > 0 ? ` · ${pending} ממתינים לאישור` : ''}</small></span>
      <ChevronDown size={18} aria-hidden="true" />
    </summary>
    <div className="completion-group-rows">{children}</div>
  </details>;
}
