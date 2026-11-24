import {describe,expect,it} from 'vitest';
import {parseFlexibleTracker} from '../src/lib/flexible-tracker';
import {parseTrackerPrompt,TRACKER_PROMPT_EXAMPLE} from '../src/lib/tracker-assistant';

describe('local table description reader',()=>{
 it('parses common Hebrew prose, with an explicit title, ordered headers and empty rows',()=>{
  const {draft}=parseTrackerPrompt(TRACKER_PROMPT_EXAMPLE);
  expect(draft?.title).toBe('מעקב תחזוקה');
  expect(draft?.grid.columns.map(c=>c.name)).toEqual(['פריט','מצב','תאריך','הערות']);
  expect(draft?.grid.rows).toHaveLength(12);
  expect(draft?.grid.rows.every(row=>Object.keys(row.cells).length===0)).toBe(true);
  expect(parseFlexibleTracker(draft?.grid)).toEqual(draft?.grid);
 });
 it('uses only explicit data and preserves multi-word Hebrew labels and empty cells',()=>{
  const {draft}=parseTrackerPrompt('שם: מלאי בדיקה\nעמודות: ציוד וכלים, שנת ייצור, הערות ותוקף\nשורות: שלוש\nשורה: מדבקה | | טקסט מפורש');
  expect(draft?.grid.columns.map(c=>c.name)).toEqual(['ציוד וכלים','שנת ייצור','הערות ותוקף']);
  expect(draft?.grid.rows.map(row=>row.cells)).toEqual([{'column-0':'מדבקה','column-2':'טקסט מפורש'},{},{}]);
 });
 it('recognizes safe presets without examples or invented data, and custom headers take precedence',()=>{
  const {draft}=parseTrackerPrompt('שם: מעקב שלי; תבנית: מלאי; שורות: 10');
  expect(draft?.grid.columns.map(c=>c.name)).toEqual(['פריט','כמות','יחידה','הערות']);
  expect(draft?.grid.rows).toHaveLength(10);
  expect(draft?.grid.rows[0].cells).toEqual({});
  expect(parseTrackerPrompt('שם: מעקב שלי; תבנית: מלאי; עמודות: אחר, חדש').draft?.grid.columns.map(c=>c.name)).toEqual(['אחר','חדש']);
 });
 it.each([
  ['מעקב כללי','אילו עמודות'],
  ['תבנית: מחזורי','איזו תבנית'],
  ['שם: מעקב תקין; עמודות: פריט; שורות: 201','כמה שורות'],
  ['שם: מעקב תקין; עמודות: פריט; שורות: 2; 3 שורות','מספר אחד'],
  ['שם: מעקב תקין; עמודות: פריט, פריט','חוזר'],
  ['שם: מעקב תקין; עמודות: פריט\nשורה: אחד | שניים','לכל היותר'],
  ['שם: מעקב תקין; עמודות: פריט; שורות: 1\nשורה: אחד\nשורה: שניים','יותר שורות'],
  ['שם: מעקב תקין; עמודות: פריט, מצב ותמלא אנשים אוטומטית','בקשות נוספות'],
 ])('asks for clarification rather than guessing: %s',(prompt,error)=>{
  const result=parseTrackerPrompt(prompt);
  expect(result.draft).toBeUndefined();
  expect(result.error).toContain(error);
 });
});
