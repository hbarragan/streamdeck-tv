import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

test('HTTP server exposes configuration status, protects secrets and validates requests', async t => {
  const server = createApp({});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(base + '/api/status', { headers: { Origin: 'https://appassets.androidplatform.net' } });
  assert.equal(status.headers.get('access-control-allow-origin'), 'https://appassets.androidplatform.net');
  assert.deepEqual(await status.json(), { tmdbConfigured: false, plexConfigured: false, region: 'ES' });
  assert.equal((await fetch(base + '/api/providers')).status, 503);
  assert.equal((await fetch(base + '/api/catalog?type=invalid')).status, 400);
  assert.equal((await fetch(base + '/api/catalog?page=-1')).status, 400);
  assert.equal((await fetch(base + '/api/details?id=../../.env')).status, 400);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/server/index.js')).status, 404);
  assert.equal((await fetch(base + '/api/status', { method: 'POST' })).status, 405);
  const html = await fetch(base); assert.equal(html.status, 200);
  assert.ok(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.match(await html.text(), /StreamDeck/);
});
