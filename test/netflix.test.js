import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankCollector, createNetflixRanks, netflixDataset } from '../server/netflix.js';

const header = 'country_iso2\tweek\tcategory\tweekly_rank\tshow_title\tseason_title';
function lines(week, country = 'ES') {
  return ['Films', 'TV'].flatMap(category => Array.from({ length: 10 }, (_, i) => `${country}\t${week}\t${category}\t${i + 1}\tTitle ${i + 1}\t${category === 'TV' ? 'Season 1' : 'N/A'}`));
}
test('official Netflix ranking selects latest Spanish week and keeps exact positions and seasons', () => {
  const collector = createRankCollector();
  [header, ...lines('2026-09-20'), ...lines('2026-09-27'), ...lines('2026-10-04', 'US'), ...lines('2026-08-02')].forEach(line => collector.line(line));
  const data = collector.result('tv');
  assert.equal(data.week, '2026-09-27'); assert.equal(data.results.length, 10);
  assert.equal(data.results[0].rank, 1); assert.equal(data.results[0].season, 'Season 1');
  assert.equal(data.source, 'Netflix Tudum'); assert.equal(collector.result('movie').results[0].season, '');
});
test('incomplete or changed ranking schemas fail explicitly instead of replacing with TMDB popularity', () => {
  const collector = createRankCollector(); collector.line(header); collector.line(lines('2026-09-27')[0]);
  assert.throws(() => collector.result('movie'), /incompleto/);
  assert.throws(() => createRankCollector().line('invalid\tcolumns'), /formato/);
});
test('mapping preserves unidentified and ambiguous ranks without fabricating playable identifiers; source cached', async () => {
  let downloads = 0;
  const ranks = createNetflixRanks({ identifyNetflixRank: async (type, title) => title === 'Title 1' ? { id: 100, type, title: 'Título 1' } : null }, async url => {
    assert.equal(url, netflixDataset); downloads++;
    return new Response([header, ...lines('2026-09-27')].join('\n'));
  });
  const data = await ranks.ranks('tv');
  assert.equal(data.results[0].id, 100); assert.equal(data.results[1].id, null);
  assert.equal(data.results[1].rank, 2); assert.equal(data.results.length, 10);
  await ranks.ranks('tv'); await ranks.ranks('movie'); assert.equal(downloads, 1);
});
