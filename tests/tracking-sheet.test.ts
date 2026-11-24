import {expect,it} from 'vitest';
import {addTrackingRow,appendTrackingColumn,initialTrackingColumns,MAX_TRACKING_ROWS,openTrackingSheet,shiftTrackingColumn,type TrackingSheet} from '../src/lib/tracking-sheet';

it('adds more than fifty rows and roundtrips custom columns and existing marked names',()=>{
 const first=openTrackingSheet({columns:initialTrackingColumns,rows:[{'company-a':'שם א','company-a:status':'v'}]});
 expect(first.rows).toHaveLength(50);
 const added=appendTrackingColumn(addTrackingRow(first),'  קבוצה נוספת  ','custom-synthetic');
 added.rows[50]={'custom-synthetic':'בדיקה','custom-synthetic:status':'x'};
 const recovered=openTrackingSheet(JSON.parse(JSON.stringify(added)));
 expect(recovered.columns.at(-1)).toEqual({id:'custom-synthetic',name:'קבוצה נוספת',type:'text'});
 expect(recovered.rows).toHaveLength(51);
 expect(recovered.rows[0]).toEqual({'company-a':'שם א','company-a:status':'v'});
 expect(recovered.rows[50]).toEqual({'custom-synthetic':'בדיקה','custom-synthetic:status':'x'});
 expect(recovered.previousLayout).toBeUndefined();
});

it('preserves larger legacy grids and hidden historical cell content without cropping',()=>{
 const old:TrackingSheet={columns:[{id:'old-layout',name:'מבנה ישן',type:'status'}],rows:Array.from({length:MAX_TRACKING_ROWS+1},()=>({}))};
 old.rows[MAX_TRACKING_ROWS]={'old-layout':'תוכן שנשמר'};
 const recovered=openTrackingSheet(old);
 expect(recovered.previousLayout).toMatchObject(old);
 expect(recovered.rows).toHaveLength(MAX_TRACKING_ROWS+1);
 expect(addTrackingRow(recovered)).toBe(recovered);
 expect(recovered.rows[MAX_TRACKING_ROWS]).toEqual(old.rows[MAX_TRACKING_ROWS]);
 const current={...recovered,rows:[{'company-a':'ערך נוכחי'}]};
 expect(openTrackingSheet(current).rows[0]['company-a']).toBe('ערך נוכחי');
 expect(openTrackingSheet(current).previousLayout).toBe(recovered.previousLayout);
 expect(()=>appendTrackingColumn(recovered,'א׳','custom-existing')).toThrow('כבר קיימת');
 expect(()=>appendTrackingColumn(recovered,'   ','custom-blank')).toThrow('שם עמודה');
});

it('shifts a user-defined column one slot at a time, including gaps, and leaves other data intact',()=>{
  const custom='custom-label';
  const sheet:TrackingSheet={
    columns:[...initialTrackingColumns,{id:custom,name:'Synthetic custom',type:'text'}],
    rows:[
      {[custom]:'First',[custom+':status']:'v','company-a':'Other 1'},
      {'company-a':'Other 2'},
      {[custom]:'Third',[custom+':status']:'x','company-a':'Other 3'},
    ],
  };
  const shifted=shiftTrackingColumn(sheet,{columnId:custom,from:0});
  expect(shifted.rows).toEqual([
    {'company-a':'Other 1'},
    {[custom]:'Third',[custom+':status']:'x','company-a':'Other 2'},
    {'company-a':'Other 3'},
  ]);
  expect(sheet.rows[0][custom]).toBe('First');
  expect(shiftTrackingColumn(sheet,{columnId:custom,from:3})).toBe(sheet);
});
