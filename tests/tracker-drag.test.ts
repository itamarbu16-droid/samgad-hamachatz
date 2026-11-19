import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const hooks=vi.hoisted(()=>({cleanup:[] as (()=>void)[],setState:vi.fn()}));
vi.mock('react',()=>({useRef:(current:unknown)=>({current}),useState:(initial:unknown)=>[initial,hooks.setState],useEffect:(run:()=>void|(()=>void))=>{const cleanup=run();if(cleanup)hooks.cleanup.push(cleanup);}}));
import {useTrackerDrag} from '../src/components/use-tracker-drag';
let doc:EventTarget,win:EventTarget;
beforeEach(()=>{vi.useFakeTimers();hooks.setState.mockClear();doc=new EventTarget();win=new EventTarget();vi.stubGlobal('document',Object.assign(doc,{elementFromPoint:()=>({closest:()=>({dataset:{trackerDrop:'road-safety'}})})}));vi.stubGlobal('window',Object.assign(win,{innerHeight:800,scrollBy:vi.fn()}));});
afterEach(()=>{hooks.cleanup.splice(0).forEach(fn=>fn());vi.unstubAllGlobals();vi.useRealTimers();});
function touch(type:string,x:number,y:number){const event=new Event(type,{cancelable:true});const point={identifier:7,clientX:x,clientY:y};Object.assign(event,{touches:type==='touchmove'?[point]:[],changedTouches:[point]});doc.dispatchEvent(event);return event;}
it('copies marked trackers to the folder only after a held touch and release',()=>{
 const drop=vi.fn(),drag=useTrackerDrag(drop);
 drag.startTouch({touches:[{identifier:7,clientX:10,clientY:10}]} as never,['bike','vehicle'],'מעקבים');
 vi.advanceTimersByTime(450);expect(drop).not.toHaveBeenCalled();
 expect(touch('touchmove',150,160).defaultPrevented).toBe(true);
 touch('touchend',150,160);expect(drop).toHaveBeenCalledExactlyOnceWith(['bike','vehicle'],'road-safety');
 expect(drag.consumeClick()).toBe(true);expect(drag.consumeClick()).toBe(false);
});
it('lets a normal scrolling swipe cancel the long press without copying',()=>{
 const drop=vi.fn(),drag=useTrackerDrag(drop);
 drag.startTouch({touches:[{identifier:7,clientX:10,clientY:10}]} as never,['bike'],'bike');
 expect(touch('touchmove',10,40).defaultPrevented).toBe(false);
 vi.advanceTimersByTime(500);touch('touchend',10,40);expect(drop).not.toHaveBeenCalled();expect(drag.consumeClick()).toBe(false);
});
it('cancels an active drag on touch cancellation or loss of focus',()=>{
 const drop=vi.fn(),drag=useTrackerDrag(drop);
 drag.startTouch({touches:[{identifier:7,clientX:10,clientY:10}]} as never,['bike'],'bike');
 vi.advanceTimersByTime(500);touch('touchmove',150,160);doc.dispatchEvent(new Event('touchcancel'));touch('touchend',150,160);expect(drop).not.toHaveBeenCalled();
});
it('leaves the document unopened on a long hold released outside a folder',()=>{
 Object.assign(doc,{elementFromPoint:()=>null});const drop=vi.fn(),drag=useTrackerDrag(drop);
 drag.startTouch({touches:[{identifier:7,clientX:10,clientY:10}]} as never,['bike'],'bike');
 vi.advanceTimersByTime(500);touch('touchend',10,10);expect(drop).not.toHaveBeenCalled();expect(drag.consumeClick()).toBe(true);
});

it('opens file actions when a held touch is released without dropping on a folder',()=>{
 Object.assign(doc,{elementFromPoint:()=>null});const drop=vi.fn(),hold=vi.fn(),drag=useTrackerDrag(drop,hold);
 drag.startTouch({touches:[{identifier:7,clientX:10,clientY:10}]} as never,['bike'],'bike');
 vi.advanceTimersByTime(500);touch('touchend',10,10);expect(drop).not.toHaveBeenCalled();expect(hold).toHaveBeenCalledExactlyOnceWith(['bike']);
});
