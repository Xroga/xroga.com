import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { bindBuildStreamAbort } from './buildStreamLifecycle.js';

describe('build stream lifecycle', () => {
  it('does not cancel SSE when the request body closes normally', () => {
    const request = new EventEmitter();
    const response = new EventEmitter();
    let aborted = 0;
    bindBuildStreamAbort(request, response, () => ({ responseEnded: false, codeReady: false }), () => { aborted += 1; });

    request.emit('close');
    assert.equal(aborted, 0);
  });

  it('cancels unfinished work on an interrupted request or response disconnect', () => {
    for (const [source, event] of [['request', 'aborted'], ['response', 'close']] as const) {
      const request = new EventEmitter();
      const response = new EventEmitter();
      let aborted = 0;
      bindBuildStreamAbort(request, response, () => ({ responseEnded: false, codeReady: false }), () => { aborted += 1; });

      (source === 'request' ? request : response).emit(event);
      assert.equal(aborted, 1);
    }
  });

  it('preserves shipping after code is ready and ignores a completed response', () => {
    for (const state of [
      { responseEnded: false, codeReady: true },
      { responseEnded: true, codeReady: false },
    ]) {
      const request = new EventEmitter();
      const response = new EventEmitter();
      let aborted = 0;
      bindBuildStreamAbort(request, response, () => state, () => { aborted += 1; });

      response.emit('close');
      assert.equal(aborted, 0);
    }
  });
});
