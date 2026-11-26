import {expect,it} from 'vitest';
import {contextMenuPosition} from '../src/lib/context-menu-position';
const mobile={left:0,top:0,right:390,bottom:640};

it('aligns the right edge beside the pressed item in RTL and flips above at the bottom',()=>{
 expect(contextMenuPosition({left:110,right:375,top:100,bottom:160},mobile,180)).toEqual({left:35,top:168,width:340,maxHeight:180});
 expect(contextMenuPosition({left:110,right:375,top:560,bottom:620},mobile,180)).toEqual({left:35,top:372,width:340,maxHeight:180});
});

it('clamps inside a shrunk and offset visual viewport without losing scrollable actions',()=>{
 const viewport={left:30,top:50,right:300,bottom:290};
 const p=contextMenuPosition({left:40,right:180,top:95,bottom:225},viewport,510);
 expect(p.left).toBeGreaterThanOrEqual(42);expect(p.left+p.width).toBeLessThanOrEqual(288);
 expect(p.top).toBeGreaterThanOrEqual(62);expect(p.top+p.maxHeight).toBeLessThanOrEqual(278);
 expect(p.maxHeight).toBeGreaterThan(0);expect(p.maxHeight).toBeLessThan(510);
});
