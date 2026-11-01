import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { openPlaywrightQaDriver } from './playwrightQaDriver.js';

test('real isolated QA browser blocks unapproved POST, page sockets and child-worker sockets', async () => {
  let posts = 0, sockets = 0;
  const external = createServer((_req, res) => res.end('fixture'));
  const ws = new WebSocketServer({ server: external });
  ws.on('connection', socket => { sockets++; socket.close(); });
  await new Promise<void>(resolve => external.listen(0, '127.0.0.1', resolve));
  const socketUrl = 'ws://127.0.0.1:' + (external.address() as AddressInfo).port;
  const app = createServer((req, res) => {
    if (req.method === 'POST') { posts++; res.end('unapproved'); return; }
    res.setHeader('content-type', 'text/html');
    res.end('<html><body>Fixture<script>fetch("/unapproved",{method:"POST",body:"fixture"}).catch(()=>{});new WebSocket(' + JSON.stringify(socketUrl) + ');new Worker(URL.createObjectURL(new Blob([' + JSON.stringify('new WebSocket(' + JSON.stringify(socketUrl) + ')') + '],{type:"text/javascript"})));</script></body></html>');
  });
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  let driver: Awaited<ReturnType<typeof openPlaywrightQaDriver>> | undefined;
  try {
    driver = await openPlaywrightQaDriver({ baseUrl: 'http://127.0.0.1:' + (app.address() as AddressInfo).port, readOnly: true });
    const page = await driver.open('desktop');
    assert.equal((await page.goto('/')).status, 200);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.match(await page.bodyText(), /Fixture/);
    assert.equal(posts, 0, 'page scripts cannot create unapproved writes');
    assert.equal(sockets, 0, 'both page and child-worker sockets must remain local denials');
    await page.close();
  } finally {
    await driver?.close();
    for (const socket of ws.clients) socket.terminate();
    ws.close();
    await Promise.all([new Promise<void>(resolve => app.close(() => resolve())), new Promise<void>(resolve => external.close(() => resolve()))]);
  }
});
