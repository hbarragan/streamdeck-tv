import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, supportedProviders } from '../server/catalog.js';

const providers = [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 9, provider_name: 'Amazon Prime Video' },
  { provider_id: 119, provider_name: 'Amazon Prime Video with Ads' }, { provider_id: 999, provider_name: 'Apple TV Amazon Channel' },
  { provider_id: 337, provider_name: 'Disney Plus' }];
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('only providers confirmed for Spain are exposed; channels are not misidentified', () => {
  const result = supportedProviders(providers, [{ provider_id: 63, provider_name: 'Filmin' }]);
  assert.deepEqual(result.map(p => p.key), ['prime', 'netflix', 'disney', 'filmin']);
  assert.deepEqual(result[0].ids.movie, [9, 119]);
  assert.deepEqual(result.at(-1).ids.movie, []);
});
test('discover is restricted to Spanish subscriptions and preserves API pagination', async () => {
  const catalog = createCatalog('secret', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer secret');
    if (url.pathname.includes('/watch/providers/')) { assert.equal(url.searchParams.get('watch_region'), 'ES'); return json({ results: providers }); }
    assert.equal(url.searchParams.get('watch_region'), 'ES');
    assert.equal(url.searchParams.get('with_watch_monetization_types'), 'flatrate');
    assert.equal(url.searchParams.get('with_watch_providers'), '8');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('sort_by'), 'vote_average.desc');
    assert.equal(url.searchParams.get('vote_count.gte'), '100');
    return json({ results: [{ id: 1, title: 'Título', release_date: '2024-01-01' }], page: 2, total_pages: 800 });
  });
  const data = await catalog.discover('netflix', 'movie', 'rated', 2);
  assert.equal(data.results[0].year, '2024'); assert.equal(data.totalPages, 500);
  await assert.rejects(catalog.discover('apple', 'movie'), /no tiene catálogo/);
});
test('search excludes rental, other regions and other platforms instead of showing unfiltered hits', async () => {
  const catalog = createCatalog('token', async url => {
    if (url.pathname.includes('/watch/providers/')) return json({ results: providers });
    if (url.pathname.includes('/search/')) return json({ results: [1, 2, 3, 4].map(id => ({ id, title: 'Test ' + id })), page: 1, total_pages: 2 });
    const id = Number(url.pathname.split('/')[3]);
    return json({ results: id === 1 ? { ES: { flatrate: [{ provider_id: 8 }] } } : id === 2 ? { ES: { rent: [{ provider_id: 8 }] } } : id === 3 ? { US: { flatrate: [{ provider_id: 8 }] } } : { ES: { flatrate: [{ provider_id: 9 }] } } });
  });
  const result = await catalog.search('netflix', 'movie', 'test', 1);
  assert.deepEqual(result.results.map(x => x.id), [1]);
  assert.equal(result.totalPages, 2);
});
test('unconfigured and invalid tokens are explicit errors; never fabricated catalogues', async () => {
  await assert.rejects(createCatalog('').providers(), /Falta el token/);
  await assert.rejects(createCatalog('bad', async () => new Response('', { status: 401 })).providers(), /no es válido/);
});
test('title details recheck Spanish availability before returning content', async () => {
  const catalog = createCatalog('token', async url => {
    if (url.pathname.includes('/watch/providers/')) return json({ results: providers });
    if (url.pathname.endsWith('/watch/providers')) return json({ results: { ES: { rent: [{ provider_id: 8 }] } } });
    return json({ id: 1, title: 'Not included' });
  });
  await assert.rejects(catalog.details('netflix', 'movie', '1'), /ya no figura incluido/);
});
