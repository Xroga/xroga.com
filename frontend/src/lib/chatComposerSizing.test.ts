import assert from 'node:assert/strict';
import test from 'node:test';
import { composerMaxHeightForViewport } from './chatComposerSizing';

test('desktop composer grows substantially without covering the whole terminal', () => {
  assert.equal(composerMaxHeightForViewport(1440, 900), 468);
  assert.equal(composerMaxHeightForViewport(1920, 1200), 480);
});

test('tablet composer remains large but below the desktop ceiling', () => {
  assert.equal(composerMaxHeightForViewport(800, 900), 380);
  assert.equal(composerMaxHeightForViewport(800, 600), 264);
});

test('mobile composer follows the keyboard-adjusted visual viewport', () => {
  assert.equal(composerMaxHeightForViewport(390, 800), 300);
  assert.equal(composerMaxHeightForViewport(390, 500), 190);
  assert.equal(composerMaxHeightForViewport(390, 300), 160);
});
