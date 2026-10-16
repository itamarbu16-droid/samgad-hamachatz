"use client";
import type {ReactNode} from 'react';
import {SlidersHorizontal,ChevronDown} from 'lucide-react';
export function TaskFilters({search,children,count,active=false}:{search:ReactNode;children:ReactNode;count:number;active?:boolean}){
 return <div className="task-filterbar">
  <div className="task-filter-search">{search}</div>
  <details className="task-filter-details"><summary><SlidersHorizontal size={18}/><span>סינון ומיון</span>{active&&<span className="filter-active-dot" aria-label="סינון פעיל"/>}<ChevronDown size={16}/></summary><div className="task-filter-fields">{children}</div></details>
  <span className="task-result-count" role="status" aria-live="polite">{count} משימות</span>
 </div>;
}
