import {describe,expect,it} from 'vitest';
import {activitySwipeProgress,canDismissActivityWithSwipe} from '../src/lib/activity-swipe';

describe('RTL activity removal gesture',()=>{
 it('recognizes a deliberate physical right swipe like the existing task controls',()=>{
  expect(activitySwipeProgress(20,3)).toBe('right');
  expect(canDismissActivityWithSwipe(56,8)).toBe(true);
 });
 it('keeps taps, short drags, left swipes and vertical scroll from requesting removal',()=>{
  expect(activitySwipeProgress(5,4)).toBe('pending');
  expect(activitySwipeProgress(-45,8)).toBe('cancel');
  expect(activitySwipeProgress(9,30)).toBe('cancel');
  expect(canDismissActivityWithSwipe(55,0)).toBe(false);
  expect(canDismissActivityWithSwipe(-80,0)).toBe(false);
  expect(canDismissActivityWithSwipe(60,58)).toBe(false);
 });
});
