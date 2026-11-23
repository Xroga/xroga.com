import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitChatbarPopover } from '../components/ui/useChatbarPopoverLayout';

test('idle menus stay below the complete composer and scroll within a small phone', () => {
  const frame = { left: 21, top: 205, bottom: 305, height: 100 };
  const popup = fitChatbarPopover(frame, 280, 350, 430, { left: 0, top: 0, width: 320, height: 568 }, false);
  assert.equal(popup.top, 313);
  assert.equal(popup.offset, 0);
  assert.equal(popup.left, 12);
  assert.equal(popup.width, 296);
  assert.equal(popup.top + popup.maxHeight, 556);
});

test('a bottom-docked composer moves up so its menu can open below without leaving the screen', () => {
  const frame = { left: 21, top: 730, bottom: 832, height: 102 };
  const popup = fitChatbarPopover(frame, 200, 330, 400, { left: 0, top: 0, width: 390, height: 844 }, true, 110);
  assert.equal(popup.top, frame.bottom - popup.offset + 8);
  assert(popup.offset > 0);
  assert.equal(popup.top + popup.maxHeight, 832);
  assert(frame.top - popup.offset >= 110);
});

test('an open mobile keyboard limits menus to the visible viewport', () => {
  const frame = { left: 10, top: 640, bottom: 740, height: 100 };
  const viewport = { left: 0, top: 410, width: 360, height: 330 };
  const popup = fitChatbarPopover(frame, -30, 350, 430, viewport, true);
  assert.equal(popup.left, 12);
  assert(popup.top >= viewport.top + 12);
  assert(popup.top + popup.maxHeight <= viewport.top + viewport.height - 12);
  assert(frame.top - popup.offset >= viewport.top + 12);
});
