"use client";
import {useState} from 'react';
import {Pencil} from 'lucide-react';
import {
 addTrackerColumn,addTrackerRow,changeTrackerCell,flexiblePointKey,mergeTrackerCells,moveTrackerAxis,renameTrackerColumn,
 splitTrackerCell,trackerRectangle,MAX_FLEXIBLE_COLUMNS,MAX_FLEXIBLE_COLUMN_NAME,MAX_FLEXIBLE_ROWS,MAX_FLEXIBLE_VALUE,
 type FlexibleTracker,type GridPoint,
} from '@/lib/flexible-tracker';
import {Modal} from './workspace-primitives';

export default function FlexibleTrackerEditor({grid,editable,busy,onChange}:{
 grid:FlexibleTracker;editable:boolean;busy:boolean;onChange:(grid:FlexibleTracker)=>void;
}){
 const [selection,setSelection]=useState<{start?:GridPoint;end?:GridPoint}|null>(null);
 const [columnDialog,setColumnDialog]=useState<{id?:string;name:string}|null>(null);
 const [message,setMessage]=useState('');
 const [moveRow,setMoveRow]=useState('');
 const [moveColumn,setMoveColumn]=useState('');
 const writable=editable&&!busy;
 const range=selection?.start&&trackerRectangle(grid,selection.start,selection.end??selection.start);
 const merged=new Map<string,{visible:boolean;rowSpan:number;colSpan:number}>();
 for(const span of grid.merges)for(const row of span.rows)for(const column of span.columns)
  merged.set(flexiblePointKey(row,column),{visible:row===span.rows[0]&&column===span.columns[0],rowSpan:span.rows.length,colSpan:span.columns.length});
 const row=grid.rows.findIndex(item=>item.id===moveRow);
 const column=grid.columns.findIndex(item=>item.id===moveColumn);
 function mutate(work:()=>FlexibleTracker,after?:()=>void){
  if(!writable)return;
  try {onChange(work());setMessage('');after?.();}
  catch(error){setMessage(error instanceof Error?error.message:'לא ניתן לעדכן את הטבלה');}
 }
 function choose(point:GridPoint){
  if(!writable)return;
  setMessage('');
  setSelection(current=>!current?.start||current.end?{start:point}:{...current,end:point});
 }
 function reorder(axis:'rows'|'columns',id:string,direction:-1|1){
  mutate(()=>moveTrackerAxis(grid,axis,id,direction),()=>setSelection(null));
 }
 return <div className="flexible-tracker" dir="rtl">
  {editable&&<>
   <div className="flexible-tracker-tools">
    <button type="button" className="button secondary" disabled={!writable||grid.rows.length>=MAX_FLEXIBLE_ROWS} onClick={()=>mutate(()=>addTrackerRow(grid,'row-'+crypto.randomUUID()))}>＋ שורה</button>
    <button type="button" className="button secondary" disabled={!writable||grid.columns.length>=MAX_FLEXIBLE_COLUMNS} onClick={()=>{setMessage('');setColumnDialog({name:''});}}>＋ עמודה</button>
    <button type="button" className="button secondary" aria-pressed={selection!==null} disabled={!writable} onClick={()=>{setMessage('');setSelection(selection?null:{});}}>{selection?'יציאה מבחירת טווח':'בחירת טווח'}</button>
   </div>
   {selection&&<div className="flexible-tracker-range">
    <p role="status">{!selection.start?'בחר את התא הראשון בטווח.':!selection.end?'בחר את התא השני, או לחץ על פיצול אם התא שנבחר ממוזג.':'הטווח מסומן. אפשר למזג את התאים הריקים עם התא הראשון.'}</p>
    <div className="flexible-tracker-tools">
     <button type="button" className="button secondary" disabled={!writable||!selection.end} onClick={()=>mutate(()=>mergeTrackerCells(grid,selection.start!,selection.end!),()=>setSelection(null))}>מיזוג תאים</button>
     <button type="button" className="button secondary" disabled={!writable||!selection.start||!merged.has(flexiblePointKey(selection.start.row,selection.start.column))} onClick={()=>mutate(()=>splitTrackerCell(grid,selection.start!),()=>setSelection(null))}>פיצול תא ממוזג</button>
    </div>
   </div>}
   <details className="flexible-tracker-arrange">
    <summary>סידור שורות ועמודות</summary>
    <div className="flexible-tracker-tools">
     <label>שורה<select value={moveRow} onChange={e=>setMoveRow(e.target.value)} disabled={!writable}><option value="">בחירת שורה</option>{grid.rows.map((item,index)=><option key={item.id} value={item.id}>{index+1}</option>)}</select></label>
     <button type="button" className="button secondary" disabled={!writable||row<=0} onClick={()=>reorder('rows',moveRow,-1)}>שורה למעלה</button>
     <button type="button" className="button secondary" disabled={!writable||row<0||row===grid.rows.length-1} onClick={()=>reorder('rows',moveRow,1)}>שורה למטה</button>
    </div>
    <div className="flexible-tracker-tools">
     <label>עמודה<select value={moveColumn} onChange={e=>setMoveColumn(e.target.value)} disabled={!writable}><option value="">בחירת עמודה</option>{grid.columns.map((item,index)=><option key={item.id} value={item.id}>{index+1}. {item.name}</option>)}</select></label>
     <button type="button" className="button secondary" disabled={!writable||column<=0} onClick={()=>reorder('columns',moveColumn,-1)}>עמודה ימינה</button>
     <button type="button" className="button secondary" disabled={!writable||column<0||column===grid.columns.length-1} onClick={()=>reorder('columns',moveColumn,1)}>עמודה שמאלה</button>
     <button type="button" className="button secondary" disabled={!writable||column<0} onClick={()=>{setMessage('');setColumnDialog(grid.columns[column]);}}>שינוי שם עמודה</button>
    </div>
   </details>
  </>}
  {message&&!columnDialog&&<p role="alert" className="error-banner">{message}</p>}
  <div className="flexible-tracker-scroll" role="region" aria-label="טבלת מעקב נגללת" tabIndex={0}>
   <table><thead><tr><th scope="col" aria-label="מספר שורה">#</th>{grid.columns.map((item,index)=><th scope="col" key={item.id}>
      {editable?<button type="button" className="flexible-tracker-heading-edit" aria-label={`שינוי שם עמודה ${index+1}, ${item.name}`} disabled={!writable} onClick={()=>{setMessage('');setColumnDialog(item);}}>{item.name}<Pencil size={15} aria-hidden="true"/></button>:item.name}
     </th>)}</tr></thead>
    <tbody>{grid.rows.map((line,rowIndex)=><tr key={line.id}><th scope="row">{rowIndex+1}</th>{grid.columns.map(item=>{
     const point={row:line.id,column:item.id},span=merged.get(flexiblePointKey(line.id,item.id));
     if(span&&!span.visible)return null;
     const selected=Boolean(range?.rows.includes(line.id)&&range.columns.includes(item.id));
     const value=line.cells[item.id]??'',label=`שורה ${rowIndex+1}, ${item.name}`;
     return <td key={item.id} rowSpan={span?.rowSpan} colSpan={span?.colSpan} data-selected={selected}>
      {selection&&editable?<button type="button" className="flexible-tracker-cell" aria-label={label} aria-pressed={selected} disabled={!writable} onClick={()=>choose(point)}>{value||'·'}</button>:
       editable?<input className="flexible-tracker-cell" aria-label={label} disabled={!writable} maxLength={MAX_FLEXIBLE_VALUE} value={value} onChange={e=>mutate(()=>changeTrackerCell(grid,point,e.target.value))}/>:<span className="flexible-tracker-cell">{value}</span>}
     </td>;
    })}</tr>)}</tbody>
   </table>
  </div>
  {columnDialog&&editable&&<Modal title={columnDialog.id?'שינוי שם עמודה':'הוספת עמודה'} close={()=>{setMessage('');setColumnDialog(null);}}><form onSubmit={event=>{
   event.preventDefault();
   const name=String(new FormData(event.currentTarget).get('name')??'');
   mutate(()=>columnDialog.id?renameTrackerColumn(grid,columnDialog.id,name):addTrackerColumn(grid,'column-'+crypto.randomUUID(),name),()=>setColumnDialog(null));
  }}>
   <label>שם העמודה<input name="name" defaultValue={columnDialog.name} required maxLength={MAX_FLEXIBLE_COLUMN_NAME}/></label>
   {message&&<p role="alert">{message}</p>}
   <button className="button primary" type="submit" disabled={!writable}>שמירת עמודה</button>
  </form></Modal>}
 </div>;
}
