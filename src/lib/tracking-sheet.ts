export type TrackingColumn = { id: string; name: string; type: "text" | "date" | "status" };
export type TrackingSheet = {
 columns: TrackingColumn[];
 rows: Record<string,string>[];
 previousLayout?:unknown;
};
export const INITIAL_TRACKING_ROWS=50;
export const MAX_TRACKING_ROWS=500;
export const MAX_TRACKING_COLUMNS=30;
export const MAX_TRACKING_COLUMN_NAME=64;
export const initialTrackingColumns:TrackingColumn[]=[
 {id:'company-a',name:'א׳',type:'text'},
 {id:'company-b',name:'ב׳',type:'text'},
 {id:'company-c',name:'ג׳',type:'text'},
 {id:'company-d',name:'ד׳',type:'text'},
 {id:'company-e',name:'ה׳',type:'text'},
 {id:'company-engineering',name:'צמ״ה',type:'text'},
 {id:'company-support',name:'פלס״ם',type:'text'},
];
const standardIds=new Set(initialTrackingColumns.map(c=>c.id));
const customId=(id:unknown):id is string=>typeof id==='string'&&/^custom-[a-z0-9-]{1,80}$/i.test(id);
const comparable=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('he');

export function openTrackingSheet(parsed:TrackingSheet):TrackingSheet{
 const seen=new Set(standardIds);
 const custom=parsed.columns.filter(c=>{
  if(!c||!customId(c.id)||seen.has(c.id)||typeof c.name!=='string'||!c.name.trim()||!['text','date','status'].includes(c.type))return false;
  seen.add(c.id);return true;
 });
 const legacy=parsed.columns.some(c=>!c||!seen.has(c.id));
 return {
  ...parsed,
  previousLayout:Object.hasOwn(parsed,'previousLayout')?parsed.previousLayout:legacy?{columns:parsed.columns,rows:parsed.rows}:undefined,
  columns:[...initialTrackingColumns,...custom],
  // Saved sheets may already exceed the current add-button limits. Never trim them.
  rows:Array.from({length:Math.max(INITIAL_TRACKING_ROWS,parsed.rows.length)},(_,index)=>parsed.rows[index]||{}),
 };
}

export function addTrackingRow(sheet:TrackingSheet):TrackingSheet{
 return sheet.rows.length>=MAX_TRACKING_ROWS?sheet:{...sheet,rows:[...sheet.rows,{}]};
}

export function appendTrackingColumn(sheet:TrackingSheet,rawName:string,id:string):TrackingSheet{
 if(sheet.columns.length>=MAX_TRACKING_COLUMNS)throw Error('הגעת למספר העמודות המרבי במעקב');
 const name=rawName.trim();
 if(!name||name.length>MAX_TRACKING_COLUMN_NAME)throw Error('יש להזין שם עמודה קצר');
 if(sheet.columns.some(c=>comparable(c.name)===comparable(name)))throw Error('כבר קיימת עמודה בשם הזה');
 if(!customId(id)||sheet.columns.some(c=>c.id===id))throw Error('לא ניתן להוסיף עמודה כרגע, נסה שוב');
 return {...sheet,columns:[...sheet.columns,{id,name,type:'text'}]};
}

export type TrackingShift = { columnId:string; from:number };

// Move the whole cell (name and its mark), not the whole row. Blank slots
// in the source count too, and the last slot is always emptied.
export function shiftTrackingColumn(sheet:TrackingSheet,{columnId,from}:TrackingShift):TrackingSheet{
  if(!Number.isInteger(from)||from<0||from>=sheet.rows.length||!sheet.columns.some(column=>column.id===columnId))return sheet;
  const keys=[columnId,columnId+':status'];
  const rows=sheet.rows.map((row,index)=>{
    if(index<from)return row;
    const next=sheet.rows[index+1];
    const shifted={...row};
    for(const key of keys){
      if(next&&Object.hasOwn(next,key))shifted[key]=next[key];
      else delete shifted[key];
    }
    return shifted;
  });
  return {...sheet,rows};
}

const trackingCellMatches=(a:unknown,b:unknown)=>(a??'')===(b??'')||JSON.stringify(a)===JSON.stringify(b);

// The editor exposes append-only structure and uses stable column IDs. On a
// stale document version, merge cells only when their coordinates still mean
// the same thing. Never infer which of two competing edits should win.
export function mergeTrackingEdits(base:TrackingSheet,local:TrackingSheet,remote:TrackingSheet,shifts:readonly TrackingShift[]=[]):
  {sheet:TrackingSheet;changed:boolean}|{conflict:'structure'|'cell'|'shift';row?:number}{
  const layoutMatches=(a:TrackingColumn[],b:TrackingColumn[])=>a.every((column,i)=>
    column.id===b[i]?.id&&column.name===b[i]?.name&&column.type===b[i]?.type);
  const appendOnly=(sheet:TrackingSheet)=>sheet.rows.length>=base.rows.length&&layoutMatches(base.columns,sheet.columns);
  const structureChanged=(sheet:TrackingSheet)=>sheet.rows.length!==base.rows.length||sheet.columns.length!==base.columns.length;
  if(!appendOnly(local)||!appendOnly(remote)||(structureChanged(local)&&structureChanged(remote)))return {conflict:'structure'};

  // A shift reads all slots below it, even when repeated names/marks make
  // an intermediate slot look unchanged in the final diff. Treat a remote
  // change anywhere in that column's affected range as overlapping.
  if(shifts.length&&structureChanged(remote))return {conflict:'structure'};
  const shiftedFrom=new Map<string,number>();
  for(const {columnId,from} of shifts)shiftedFrom.set(columnId,Math.min(shiftedFrom.get(columnId)??from,from));
  for(const [columnId,from] of shiftedFrom){
    const keys=[columnId,columnId+':status'];
    for(let i=from;i<base.rows.length;i++){
      if(keys.some(key=>!trackingCellMatches(base.rows[i]?.[key],remote.rows[i]?.[key])))return {conflict:'shift',row:i+1};
    }
  }
  const rows=remote.rows.slice();
  let changed=structureChanged(local);
  for(let i=0;i<local.rows.length;i++){
    const baseline=base.rows[i]||{};
    const mine=local.rows[i];
    const theirs=remote.rows[i]||{};
    if(!mine||typeof mine!=='object'||Array.isArray(mine)||typeof theirs!=='object'||Array.isArray(theirs))return {conflict:'structure'};
    if(mine===baseline)continue;
    let row=theirs;
    for(const key of new Set([...Object.keys(baseline),...Object.keys(mine)])){
      const before=Object.hasOwn(baseline,key)?baseline[key]:undefined;
      const after=Object.hasOwn(mine,key)?mine[key]:undefined;
      const current=Object.hasOwn(theirs,key)?theirs[key]:undefined;
      if(trackingCellMatches(before,after)||trackingCellMatches(current,after))continue;
      if(!trackingCellMatches(current,before))return {conflict:'cell',row:i+1};
      row={...row,[key]:after??''};
      changed=true;
    }
    rows[i]=row;
  }
  return {sheet:{...remote,columns:structureChanged(local)?local.columns:remote.columns,rows},changed};
}
