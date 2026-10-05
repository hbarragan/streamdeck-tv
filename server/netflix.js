import { ApiError } from './catalog.js';

export const netflixDataset = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv';
const sourceUrl = 'https://www.netflix.com/tudum/top10/spain';
export function createRankCollector() {
  let columns, week = '', rows = [];
  return {
    line(line) {
      const cells = line.replace(/\r$/, '').split('\t').map(value => value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value);
      if (!columns) {
        columns = Object.fromEntries(cells.map((name, i) => [name.replace(/^\uFEFF/, ''), i]));
        if (['country_iso2', 'week', 'category', 'weekly_rank', 'show_title', 'season_title'].some(key => columns[key] === undefined)) throw new ApiError(502, 'Netflix ha cambiado el formato de su ranking público.');
        return;
      }
      if (cells[columns.country_iso2] !== 'ES') return;
      const date = cells[columns.week], rank = Number(cells[columns.weekly_rank]), category = cells[columns.category];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['Films', 'TV'].includes(category) || !Number.isInteger(rank) || rank < 1 || rank > 10) return;
      if (date < week) return;
      if (date > week) { week = date; rows = []; }
      rows.push({ rank, type: category === 'Films' ? 'movie' : 'tv', title: cells[columns.show_title], season: cells[columns.season_title] === 'N/A' ? '' : cells[columns.season_title] });
    },
    result(type) {
      const results = rows.filter(x => x.type === type).sort((a, b) => a.rank - b.rank);
      if (results.length !== 10 || new Set(results.map(r => r.rank)).size !== 10) throw new ApiError(502, 'El ranking publicado de Netflix para España está incompleto.');
      return { week, source: 'Netflix Tudum', sourceUrl, results };
    }
  };
}

export function createNetflixRanks(catalog, fetcher = fetch) {
  let until = 0, pending, collector;
  const mapped = new Map();
  async function load() {
    let response;
    try { response = await fetcher(netflixDataset, { signal: AbortSignal.timeout(60000) }); }
    catch { throw new ApiError(502, 'No se pudo descargar el ranking oficial de Netflix.'); }
    if (!response.ok || !response.body) throw new ApiError(502, 'El ranking oficial de Netflix no está disponible temporalmente.');
    const next = createRankCollector(), decoder = new TextDecoder();
    let text = '', bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 100 * 1024 * 1024) throw new ApiError(502, 'El archivo de rankings de Netflix supera el tamaño admitido.');
      text += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = text.indexOf('\n')) >= 0) { next.line(text.slice(0, index)); text = text.slice(index + 1); }
    }
    text += decoder.decode(); if (text.trim()) next.line(text);
    next.result('tv'); next.result('movie');
    collector = next; until = Date.now() + 6 * 60 * 60 * 1000; mapped.clear();
  }
  async function ranks(type) {
    if (!collector || Date.now() >= until) {
      if (!pending) pending = load().finally(() => { pending = null; });
      await pending;
    }
    if (mapped.has(type)) return mapped.get(type);
    const data = collector.result(type);
    const results = await Promise.all(data.results.map(async row => {
      let item;
      try { item = await catalog.identifyNetflixRank(type, row.title); } catch { /* Preserve the official slot if metadata cannot be identified. */ }
      return { ...(item || { id: null, type, title: row.title, year: '', score: 0, poster: null, backdrop: null }),
        rank: row.rank, rankTitle: row.title, rankSeason: row.season, identified: Boolean(item) };
    }));
    const result = { ...data, results };
    mapped.set(type, result); return result;
  }
  return { ranks };
}
