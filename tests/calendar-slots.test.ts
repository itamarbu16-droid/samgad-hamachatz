import {it,expect} from 'vitest';
import {findFreeSlots,zonedTime} from '../src/lib/calendar-slots';
it('uses Jerusalem local time across the daylight-saving boundary',()=>{
 expect(new Date(zonedTime('2026-10-23','09:00')).toISOString()).toBe('2026-10-23T06:00:00.000Z');
 expect(new Date(zonedTime('2026-10-26','09:00')).toISOString()).toBe('2026-10-26T07:00:00.000Z');
});
it('finds gaps after overlapping busy ranges and accepts an exclusive boundary',()=>{
 const slots=findFreeSlots({from:'2026-10-16',through:'2026-10-16',dayStart:'09:00',dayEnd:'12:00',minutes:30,now:0,busy:[{start:'2026-10-16T05:00:00Z',end:'2026-10-16T06:30:00Z'},{start:'2026-10-16T06:15:00Z',end:'2026-10-16T07:00:00Z'}]});
 expect(slots[0]).toEqual({start:'2026-10-16T07:00:00.000Z',end:'2026-10-16T07:30:00.000Z'});
 expect(slots.every(slot=>Date.parse(slot.start)>=Date.parse('2026-10-16T07:00:00Z'))).toBe(true);
});
it('does not schedule in a full day or in past time, and rejects invalid busy data',()=>{
 const base={from:'2026-10-16',through:'2026-10-16',dayStart:'09:00',dayEnd:'10:00',minutes:30,now:0};
 expect(findFreeSlots({...base,busy:[{start:'2026-10-15T00:00:00Z',end:'2026-10-17T00:00:00Z'}]})).toEqual([]);
 expect(findFreeSlots({...base,now:Date.parse('2026-10-17T00:00:00Z'),busy:[]})).toEqual([]);
 expect(()=>findFreeSlots({...base,busy:[{start:'invalid',end:'2026-10-16T07:00:00Z'}]})).toThrow();
});
