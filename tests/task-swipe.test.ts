import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {swipeIntent,swipeTarget,clampSwipe,renderedSwipeOffset} from '../src/lib/task-swipe';
import {SwipeTaskRow,TaskActions} from '../src/components/task-actions';
import {TaskFilters} from '../src/components/task-filters';

describe('task gesture intent and physical directions',()=>{
 it('leaves taps and small jitter alone',()=>{
  expect(swipeIntent(7,4)).toBe('pending');expect(swipeIntent(-8,-6)).toBe('pending');
 });
 it('lets vertical and mainly vertical diagonal movements scroll',()=>{
  expect(swipeIntent(4,25)).toBe('vertical');expect(swipeIntent(20,-30)).toBe('vertical');
 });
 it('recognizes both horizontal screen directions independently of RTL',()=>{
  expect(swipeIntent(35,8)).toBe('horizontal');expect(swipeIntent(-35,8)).toBe('horizontal');
 });
 it('snaps both permission-dependent rails and closes short swipes',()=>{
  expect(swipeTarget(60,152,76)).toBe(152);expect(swipeTarget(-30,152,76)).toBe(-76);
  expect(swipeTarget(25,152,152)).toBe(0);expect(swipeTarget(-25,152,152)).toBe(0);
 });
 it('closes or changes sides when dragging an already open card back',()=>{
  expect(swipeTarget(152-130,152,152)).toBe(0);
  expect(swipeTarget(152-220,152,152)).toBe(-152);
 });
 it('opens a quick short flick in either physical direction but ignores slow jitter',()=>{
  expect(swipeTarget(24,152,152,.7)).toBe(152);
  expect(swipeTarget(-24,152,152,-.7)).toBe(-152);
  expect(swipeTarget(24,152,152,.05)).toBe(0);
 });
 it('closes an open card with a short reverse flick instead of snapping open again',()=>{
  expect(swipeTarget(130,152,152,-.6,152)).toBe(0);
  expect(swipeTarget(-130,152,152,.6,-152)).toBe(0);
 });
 it('supports a modest slow return stroke and keeps small accidental drags open',()=>{
  expect(swipeTarget(100,152,152,0,152)).toBe(0);
  expect(swipeTarget(140,152,152,0,152)).toBe(152);
  expect(swipeTarget(-100,152,152,0,-152)).toBe(0);
 });
 it('resumes from the actual on-screen position when a settle animation is interrupted',()=>{
  const actual=renderedSwipeOffset('matrix(1, 0, 0, 1, 61.5, 0)',152);
  expect(actual).toBe(61.5);expect(clampSwipe(actual+15,152,152)).toBe(76.5);
  expect(renderedSwipeOffset('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -42, 0, 0, 1)',-152)).toBe(-42);
  expect(renderedSwipeOffset('none',152)).toBe(0);
 });
 it('never exposes more than the available actions even with a long drag',()=>{
  expect(clampSwipe(800,76,152)).toBe(76);expect(clampSwipe(-800,76,152)).toBe(-152);
 });
});
const base={task:{kind:'task' as const,id:'synthetic'},title:'משימת בדיקה',pinned:false,canEdit:true,canDelete:true};
describe('accessible task action markup',()=>{
 it('keeps hidden rails inert and offers labeled actions only when permitted',()=>{
  const markup=renderToStaticMarkup(createElement(SwipeTaskRow,{...base,canDelete:false,canEdit:false,children:'תוכן'}));
  expect(markup.match(/inert=""/g)).toHaveLength(2);
  expect(markup).not.toContain('class="swipe-delete"');expect(markup).not.toContain('class="swipe-extend"');
  expect(markup).toContain('הצמדת משימת בדיקה');expect(markup).toContain('הוספת משימת בדיקה ליומן');
 });
 it('retains a keyboard accessible dialog alternative without opening a portal during SSR',()=>{
  const markup=renderToStaticMarkup(createElement(TaskActions,{...base,version:1,dueDate:null,onSaved:async()=>{}}));
  expect(markup).toContain('aria-haspopup="dialog"');expect(markup).toContain('aria-expanded="false"');
 });
 it('keeps search visible while secondary filters use a native disclosure',()=>{
  const markup=renderToStaticMarkup(createElement(TaskFilters,{search:'חיפוש',count:3,children:'מיון'}));
  expect(markup).toContain('<details');expect(markup).toContain('<summary>');
  expect(markup).not.toContain('<details open');expect(markup).toContain('3 משימות');
 });
});
