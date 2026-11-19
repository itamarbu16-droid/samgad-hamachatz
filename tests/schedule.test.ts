import {describe,it,expect} from 'vitest';
import {mentionsRole} from '../src/lib/schedule';
describe('schedule role matching',()=>{
 it('accepts Hebrew punctuation variants and a role inside an event',()=>{
  expect(mentionsRole('ישיבת תכנון — סמ"פ א\' בשעה 10', 'סמ״פ א׳')).toBe(true);
  expect(mentionsRole('סמפ א, סמפ ב','סמ״פ א׳')).toBe(true);
 });
 it('does not confuse companies or partial words',()=>{
  expect(mentionsRole('סמ״פ ב׳','סמ״פ א׳')).toBe(false);
  expect(mentionsRole('סמ״פ אב','סמ״פ א׳')).toBe(false);
  expect(mentionsRole('סמפים','סמ״פ')).toBe(false);
  expect(mentionsRole('תדריך','')).toBe(false);
 });
});
