import {expect,it} from 'vitest';
import {addTrackerColumn,addTrackerRow,changeTrackerCell,emptyFlexibleTracker,mergeTrackerCells,moveTrackerAxis,parseFlexibleTracker,splitTrackerCell} from '../src/lib/flexible-tracker';

it('never merges over text and validates retained rectangular anchors across reopen',()=>{
 const a={row:'row-0',column:'column-0'},b={row:'row-1',column:'column-2'};
 let grid=changeTrackerCell(emptyFlexibleTracker(),a,'כותרת');
 grid=changeTrackerCell(grid,b,'לא למחוק');
 expect(()=>mergeTrackerCells(grid,a,b)).toThrow('המיזוג יכסה');
 expect(grid.rows[1].cells[b.column]).toBe('לא למחוק');
 grid=mergeTrackerCells(changeTrackerCell(grid,b,''),b,a);
 expect(()=>changeTrackerCell(grid,b,'מוסתר')).toThrow();
 expect(()=>moveTrackerAxis(grid,'columns','column-2',1)).toThrow('ממוזגים');
 expect(()=>mergeTrackerCells(grid,a,{row:'row-2',column:'column-3'})).toThrow('חופף');
 const reopened=parseFlexibleTracker(JSON.parse(JSON.stringify(grid)))!;
 expect(reopened?.merges).toEqual([{rows:['row-0','row-1'],columns:['column-0','column-1','column-2']}]);
 expect(reopened.rows[0].cells[a.column]).toBe('כותרת');
 grid=splitTrackerCell(reopened,b);
 expect(grid.merges).toHaveLength(0);
 expect(grid.rows[0].cells[a.column]).toBe('כותרת');
 expect(parseFlexibleTracker({...reopened,merges:[...reopened.merges,...reopened.merges]})).toBeNull();
});

it('keeps contents attached to stable row and column IDs after additions and reordering',()=>{
 const point={row:'row-new',column:'column-new'};
 let grid=addTrackerColumn(addTrackerRow(emptyFlexibleTracker(),point.row),point.column,'מעקב');
 grid=changeTrackerCell(grid,point,'חדש');
 grid=moveTrackerAxis(grid,'rows',point.row,-1);
 grid=moveTrackerAxis(grid,'columns',point.column,-1);
 expect(parseFlexibleTracker(grid)).not.toBeNull();
 expect(grid.rows[5]).toMatchObject({id:point.row,cells:{[point.column]:'חדש'}});
 expect(grid.columns[3]).toMatchObject({id:point.column,name:'מעקב'});
});
