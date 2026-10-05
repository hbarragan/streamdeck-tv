import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlex, plexLinks } from '../server/plex.js';
const json = data => new Response(JSON.stringify({ MediaContainer: data }));

test('Plex resolves exact GUID and media type across paginated libraries', async () => {
  const calls = [];
  const plex = createPlex({ url: 'http://plex.local:32400', token: 'never-return-me' }, async (url, options) => {
    calls.push(url.href);
    assert.equal(options.headers['X-Plex-Token'], 'never-return-me');
    if (url.pathname === '/identity') return json({ machineIdentifier: 'server123' });
    if (url.pathname === '/library/sections') return json({ Directory: [{ key: '1', type: 'movie' }, { key: '2', type: 'show' }] });
    if (url.pathname.includes('/sections/1/')) {
      const second = url.searchParams.get('X-Plex-Container-Start') === '1';
      return json({ totalSize: 2, Metadata: [{ ratingKey: second ? '22' : '11', title: 'Same title', Guid: [{ id: second ? 'tmdb://55' : 'tmdb://1' }] }] });
    }
    return json({ totalSize: 1, Metadata: [{ ratingKey: '33', title: 'Show', Guid: [{ id: 'tmdb://55' }] }] });
  });
  const movie = await plex.resolve('movie', 55);
  assert.equal(movie.ratingKey, '22'); assert.ok(movie.nativeUrl.endsWith('/22?autoPlay=1'));
  assert.ok(!JSON.stringify(movie).includes('never-return-me'));
  const show = await plex.resolve('tv', 55); assert.equal(show.ratingKey, '33'); assert.ok(show.nativeUrl.endsWith('/33/children'));
  assert.equal((await plex.resolve('movie', 999)).found, false);
  assert.equal(calls.length, 5); // Cached index used for second and third resolution.
});
test('not configured means no invented title links', async () => {
  assert.deepEqual(await createPlex({}).resolve('movie', 1), { configured: false, found: false });
});
test('Plex link encodes server identifiers and web keys without exposing authentication', () => {
  const link = plexLinks('server id', '123', 'movie');
  assert.ok(link.nativeUrl.includes('server%20id')); assert.ok(link.webUrl.includes('%2Flibrary%2Fmetadata%2F123'));
});
test('configured Plex home always addresses the selected server and correct media library', () => {
  const plex = createPlex({ serverId: 'macflys5', libraryIds: '1,2', serverName: 'Servidor de prueba', homeUrl: 'https://app.plex.tv/desktop/#!/media/macflys5/com.plexapp.plugins.library?source=1' });
  assert.ok(plex.home('tv').webUrl.endsWith('source=2'));
  assert.ok(plex.home('movie').nativeUrl.endsWith('/sections/1/all'));
  assert.equal(plex.home('tv').serverName, 'Servidor de prueba');
});
test('Plex rejects a connection to a different server rather than generating mismatched playback links', async () => {
  const plex = createPlex({ url: 'https://plex.local', token: 'secret', serverId: 'expected' }, async url => json(url.pathname === '/identity' ? { machineIdentifier: 'other' } : { Directory: [] }));
  await assert.rejects(plex.resolve('movie', 1), /no corresponde/);
});

