// Distances use physical screen coordinates so Hebrew RTL never reverses gestures.
export function swipeIntent(dx:number,dy:number):'horizontal'|'vertical'|'pending'{
 if(Math.abs(dy)>10&&Math.abs(dy)>=Math.abs(dx))return 'vertical';
 if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.3)return 'horizontal';
 return 'pending';
}
export function clampSwipe(offset:number,rightWidth:number,leftWidth:number){
 return Math.max(-leftWidth,Math.min(rightWidth,offset));
}
export function swipeTarget(offset:number,rightWidth:number,leftWidth:number){
 if(offset>=rightWidth*.35)return rightWidth;
 if(offset<=-leftWidth*.35)return -leftWidth;
 return 0;
}
