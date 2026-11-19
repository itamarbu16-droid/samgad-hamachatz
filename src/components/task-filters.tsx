"use client";
import type {ReactNode} from 'react';
import {SlidersHorizontal,ChevronDown} from 'lucide-react';
export function TaskFilters({search,children,count,active=false,onArchive,archived=false}:{search:ReactNode;children:ReactNode;count:number;active?:boolean;onArchive?:()=>void;archived?:boolean}){
 return <div className="task-filterbar">
  <div className="task-filter-search">{search}</div>
  <details className="task-filter-details"><summary><SlidersHorizontal size={18}/><span>סינון ומיון</span>{active&&<span className="filter-active-dot" aria-label="סינון פעיל"/>}<ChevronDown size={16}/></summary><div className="task-filter-fields">{children}</div></details>
  <div>{onArchive&&<button type="button" className="button secondary" onClick={onArchive}>{archived?'חזרה למשימות':'ארכיון משימות שבוצעו'}</button>}{archived&&<small>משימות שבוצעו נשמרות לחודש, ואז נמחקות אוטומטית.</small>}</div>
  <span className="task-result-count" role="status" aria-live="polite">{count} משימות</span>
 </div>;
}
