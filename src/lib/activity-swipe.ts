import {swipeIntent} from './task-swipe';

export const ACTIVITY_SWIPE_DISTANCE=56;

// Like the existing task gesture in RTL, physical right reveals the remove action.
export function activitySwipeProgress(dx:number,dy:number):'pending'|'right'|'cancel'{
 const intent=swipeIntent(dx,dy);
 if(intent==='vertical'||(intent==='horizontal'&&dx<0))return 'cancel';
 return intent==='horizontal'?'right':'pending';
}

export function canDismissActivityWithSwipe(dx:number,dy:number){
 return dx>=ACTIVITY_SWIPE_DISTANCE&&activitySwipeProgress(dx,dy)==='right';
}
