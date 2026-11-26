export const FLEXIBLE_TRACKER_KIND = 'flexible-tracker-v1';
export const MAX_FLEXIBLE_ROWS = 200;
export const MAX_FLEXIBLE_COLUMNS = 24;
export const MAX_FLEXIBLE_VALUE = 500;
export const MAX_FLEXIBLE_COLUMN_NAME = 64;

type Row = {id:string; cells:Record<string,string>};
type Column = {id:string; name:string};
export type GridPoint = {row:string; column:string};
type Merge = {rows:string[]; columns:string[]};
export type FlexibleTracker = {
 kind:typeof FLEXIBLE_TRACKER_KIND;
 rows:Row[];
 columns:Column[];
 merges:Merge[];
};
const identifier = (id:unknown):id is string => typeof id==='string' && /^(row|column)-[a-z0-9-]{1,72}$/i.test(id);
const record = (value:unknown):value is Record<string,unknown> => Boolean(value&&typeof value==='object'&&!Array.isArray(value));

export function emptyFlexibleTracker():FlexibleTracker{
 return {kind:FLEXIBLE_TRACKER_KIND,
  columns:Array.from({length:4},(_,i)=>({id:'column-'+i,name:'עמודה '+(i+1)})),
  rows:Array.from({length:6},(_,i)=>({id:'row-'+i,cells:{}})),
  merges:[],
 };
}

function sortedRectangle(ids:string[],axis:string[]){
 if(!ids.length)return false;
 const start=axis.indexOf(ids[0]);
 return start>=0&&ids.every((id,index)=>axis[start+index]===id);
}

export function flexiblePointKey(row:string,column:string){
 return row+':'+column;
}
export function parseFlexibleTracker(value:unknown):FlexibleTracker|null{
 if(!record(value)||value.kind!==FLEXIBLE_TRACKER_KIND||!Array.isArray(value.columns)||!Array.isArray(value.rows)||!Array.isArray(value.merges))return null;
 if(!value.columns.length||value.columns.length>MAX_FLEXIBLE_COLUMNS||!value.rows.length||value.rows.length>MAX_FLEXIBLE_ROWS||value.merges.length>value.columns.length*value.rows.length/2)return null;
 const columns=value.columns,rows=value.rows,merges=value.merges;
 const columnIds:string[]=[],rowIds:string[]=[];
 for(const column of columns){
  if(!record(column)||!identifier(column.id)||typeof column.name!=='string'||!column.name.trim()||column.name.length>MAX_FLEXIBLE_COLUMN_NAME||columnIds.includes(column.id))return null;
  columnIds.push(column.id);
 }
 const cellRows=new Map<string,Record<string,unknown>>();
 for(const row of rows){
  if(!record(row)||!identifier(row.id)||!record(row.cells)||cellRows.has(row.id))return null;
  if(Object.entries(row.cells).some(([key,text])=>!columnIds.includes(key)||typeof text!=='string'||text.length>MAX_FLEXIBLE_VALUE))return null;
  cellRows.set(row.id,row.cells);
  rowIds.push(row.id);
 }
 const used=new Set<string>();
 for(const merge of merges){
  if(!record(merge)||!Array.isArray(merge.rows)||!Array.isArray(merge.columns)||merge.rows.length*merge.columns.length<2||!sortedRectangle(merge.rows,rowIds)||!sortedRectangle(merge.columns,columnIds))return null;
  for(const row of merge.rows)for(const column of merge.columns){
   const key=flexiblePointKey(row,column);
   if(used.has(key))return null;
   used.add(key);
   if((row!==merge.rows[0]||column!==merge.columns[0])&&String(cellRows.get(row)?.[column]??'').length)return null;
  }
 }
 return value as FlexibleTracker;
}

export function trackerRectangle(grid:FlexibleTracker,start:GridPoint,end:GridPoint):Merge{
 function interval(axis:{id:string}[],a:string,b:string){
  const left=axis.findIndex(x=>x.id===a),right=axis.findIndex(x=>x.id===b);
  if(left<0||right<0)throw Error('התא אינו קיים בטבלה');
  return axis.slice(Math.min(left,right),Math.max(left,right)+1).map(x=>x.id);
 }
 return {rows:interval(grid.rows,start.row,end.row),columns:interval(grid.columns,start.column,end.column)};
}

export function mergeTrackerCells(grid:FlexibleTracker,start:GridPoint,end:GridPoint):FlexibleTracker{
 const merge=trackerRectangle(grid,start,end);
 if(merge.rows.length*merge.columns.length<2)throw Error('בחר לפחות שני תאים');
 if(grid.merges.some(existing=>existing.rows.some(row=>merge.rows.includes(row))&&existing.columns.some(column=>merge.columns.includes(column))))
  throw Error('הטווח חופף תאים ממוזגים. פצל אותם לפני מיזוג נוסף');
 for(const row of grid.rows){
  if(!merge.rows.includes(row.id))continue;
  for(const column of merge.columns)if((row.id!==merge.rows[0]||column!==merge.columns[0])&&row.cells[column]?.length)
   throw Error('יש תוכן בתא שהמיזוג יכסה. העבר אותו לתא הראשון או מחוץ לטווח לפני המיזוג');
 }
 return {...grid,merges:[...grid.merges,merge]};
}
export function splitTrackerCell(grid:FlexibleTracker,point:GridPoint):FlexibleTracker{
 const merges=grid.merges.filter(merge=>!merge.rows.includes(point.row)||!merge.columns.includes(point.column));
 return merges.length===grid.merges.length?grid:{...grid,merges};
}
export function changeTrackerCell(grid:FlexibleTracker,point:GridPoint,value:string):FlexibleTracker{
 const covered=grid.merges.some(m=>m.rows.includes(point.row)&&m.columns.includes(point.column)&&(m.rows[0]!==point.row||m.columns[0]!==point.column));
 if(covered||!grid.columns.some(c=>c.id===point.column)||!grid.rows.some(r=>r.id===point.row)||value.length>MAX_FLEXIBLE_VALUE)throw Error('התא אינו זמין לעריכה');
 return {...grid,rows:grid.rows.map(r=>{
  if(r.id!==point.row)return r;
  const cells={...r.cells};
  if(value)cells[point.column]=value;else delete cells[point.column];
  return {...r,cells};
 })};
}
export function addTrackerRow(grid:FlexibleTracker,id:string):FlexibleTracker{
 if(grid.rows.length>=MAX_FLEXIBLE_ROWS||!identifier(id)||grid.rows.some(r=>r.id===id))throw Error('לא ניתן להוסיף עוד שורה');
 return {...grid,rows:[...grid.rows,{id,cells:{}}]};
}
function columnName(raw:string){
 const name=raw.trim();
 if(!name||name.length>MAX_FLEXIBLE_COLUMN_NAME)throw Error('יש להזין שם קצר לעמודה');
 return name;
}
export function addTrackerColumn(grid:FlexibleTracker,id:string,raw:string):FlexibleTracker{
 if(grid.columns.length>=MAX_FLEXIBLE_COLUMNS||!identifier(id)||grid.columns.some(c=>c.id===id))throw Error('לא ניתן להוסיף עוד עמודה');
 return {...grid,columns:[...grid.columns,{id,name:columnName(raw)}]};
}
export function renameTrackerColumn(grid:FlexibleTracker,id:string,raw:string):FlexibleTracker{
 const name=columnName(raw);
 return {...grid,columns:grid.columns.map(column=>column.id===id?{...column,name}:column)};
}
function shifted<T extends {id:string}>(axis:T[],id:string,delta:-1|1):T[]{
 const at=axis.findIndex(item=>item.id===id),to=at+delta;
 if(at<0||to<0||to>=axis.length)return axis;
 const result=[...axis];
 [result[at],result[to]]=[result[to],result[at]];
 return result;
}
export function moveTrackerAxis(grid:FlexibleTracker,axis:'rows'|'columns',id:string,delta:-1|1):FlexibleTracker{
 const next=axis==='rows'?{...grid,rows:shifted(grid.rows,id,delta)}:{...grid,columns:shifted(grid.columns,id,delta)};
 if(grid.merges.some(merge=>!sortedRectangle(merge[axis],next[axis].map(item=>item.id))))
  throw Error('ההזזה תשנה תאים ממוזגים. פצל אותם או בחר שורה או עמודה אחרת');
 return next;
}
