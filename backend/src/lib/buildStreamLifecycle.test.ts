import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { bindBuildStreamDisconnect } from './buildStreamLifecycle.js';

describe('build stream lifecycle', () => {
  it('does not cancel SSE when the request body closes normally', () => {
    const request = new EventEmitter();
    const response = new EventEmitter();
    let aborted = 0;
    bindBuildStreamDisconnect(request, response, () => { aborted += 1; });

    request.emit('close');
    assert.equal(aborted, 0);
  });

  it('detaches transport on an interrupted request or response disconnect', () => {
    for (const [source, event] of [['request', 'aborted'], ['response', 'close']] as const) {
      const request = new EventEmitter();
      const response = new EventEmitter();
      let aborted = 0;
      bindBuildStreamDisconnect(request, response, () => { aborted += 1; });

      (source === 'request' ? request : response).emit(event);
      assert.equal(aborted, 1);
    }
  });

  it('runs disconnect cleanup once when both transport events fire', () => {
    const request = new EventEmitter();
    const response = new EventEmitter();
    let disconnected = 0;
    bindBuildStreamDisconnect(request, response, () => { disconnected += 1; });

    request.emit('aborted');
    response.emit('close');
    assert.equal(disconnected, 1);
  });
});
