// Distances use physical screen coordinates so Hebrew RTL never reverses gestures.
export function swipeIntent(dx:number,dy:number):'horizontal'|'vertical'|'pending'{
 if(Math.abs(dy)>8&&Math.abs(dy)>=Math.abs(dx))return 'vertical';
 if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.15)return 'horizontal';
 return 'pending';
}
export function clampSwipe(offset:number,rightWidth:number,leftWidth:number){
 return Math.max(-leftWidth,Math.min(rightWidth,offset));
}
export function swipeTarget(offset:number,rightWidth:number,leftWidth:number,velocity=0,base=0){
 // A short, deliberate flick can open; reversing a previously open card closes
 // it without requiring the user to drag nearly its entire width.
 if(Math.abs(velocity)>=.45){
  if(base>0&&velocity<0&&offset<base-8&&offset>=0)return 0;
  if(base<0&&velocity>0&&offset>base+8&&offset<=0)return 0;
  if(velocity>0&&offset>12)return rightWidth;
  if(velocity<0&&offset< -12)return -leftWidth;
 }
 if(base>0&&offset>=0)return offset>=rightWidth*.72?rightWidth:0;
 if(base<0&&offset<=0)return offset<=-leftWidth*.72?-leftWidth:0;
 if(offset>=rightWidth*.3)return rightWidth;
 if(offset<=-leftWidth*.3)return -leftWidth;
 return 0;
}
export function renderedSwipeOffset(transform:string,fallback=0){
 if(!transform||transform==='none')return 0;
 const match=/^matrix(3d)?\(([^)]+)\)$/.exec(transform);
 if(!match)return fallback;
 const values=match[2].split(',').map(Number),value=values[match[1]?12:4];
 return Number.isFinite(value)?value:fallback;
}
