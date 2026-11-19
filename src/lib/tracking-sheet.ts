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
