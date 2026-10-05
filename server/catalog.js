export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const brands = [
  { key: 'prime', name: 'Prime Video', mark: 'prime video', color: '#00a8e1', match: /^Amazon Prime Video(?: with Ads)?$/i },
  { key: 'netflix', name: 'Netflix', mark: 'NETFLIX', color: '#e50914', match: /^Netflix(?: Standard with Ads)?$/i },
  { key: 'apple', name: 'Apple TV', mark: 'Apple TV', color: '#e4e4e7', match: /^Apple TV(?: Plus|\+)?$/i },
  { key: 'movistar', name: 'Movistar Plus+', mark: 'M+', color: '#00c7b1', match: /^Movistar(?: Plus| Plus\+|\+)?$/i },
  { key: 'disney', name: 'Disney+', mark: 'Disney+', color: '#85aaff', match: /^Disney Plus$/i },
  { key: 'max', name: 'HBO Max', mark: 'HBO max', color: '#a67cff', match: /^(?:HBO )?Max$/i },
  { key: 'sky', name: 'SkyShowtime', mark: 'skyshowtime', color: '#fcad45', match: /^SkyShowtime$/i },
  { key: 'filmin', name: 'Filmin', mark: 'filmin', color: '#5ee3b0', match: /^Filmin$/i }
];

export function supportedProviders(movie, tv) {
  return brands.flatMap(brand => {
    const matches = list => list.filter(p => brand.match.test(p.provider_name));
    const movies = matches(movie), series = matches(tv);
    if (!movies.length && !series.length) return [];
    return [{ key: brand.key, name: brand.name, mark: brand.mark, color: brand.color,
      logo: movies[0]?.logo_path || series[0]?.logo_path,
      ids: { movie: movies.map(p => p.provider_id), tv: series.map(p => p.provider_id) } }];
  });
}

export function normalize(item, type) {
  return { id: item.id, type, title: item.title || item.name, originalTitle: item.original_title || item.original_name,
    overview: item.overview || '', poster: item.poster_path, backdrop: item.backdrop_path,
    year: (item.release_date || item.first_air_date || '').slice(0, 4), score: item.vote_average || 0 };
}

export function createCatalog(token, fetcher = fetch) {
  const cache = new Map();
  async function request(path, params = {}) {
    if (!token) throw new ApiError(503, 'Falta el token de TMDB en el servidor. Consulta la guía de conexión.');
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.search = new URLSearchParams({ language: 'es-ES', ...params });
    const key = url.href;
    if (cache.get(key)?.until > Date.now()) return cache.get(key).promise;
    const promise = (async () => {
      let response;
      try { response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) }); }
      catch { throw new ApiError(502, 'No se pudo conectar con TMDB. Comprueba la conexión del servidor.'); }
      if (!response.ok) throw new ApiError(response.status === 401 ? 503 : 502,
        response.status === 401 ? 'El token de TMDB no es válido. Revisa la configuración del servidor.' : 'TMDB no está disponible temporalmente. Vuelve a intentarlo.');
      return response.json();
    })();
    if (cache.size > 600) cache.delete(cache.keys().next().value);
    cache.set(key, { until: Date.now() + 300000, promise });
    try { return await promise; } catch (error) { cache.delete(key); throw error; }
  }
  async function providers() {
    const [movie, tv] = await Promise.all(['movie', 'tv'].map(type => request(`/watch/providers/${type}`, { watch_region: 'ES' })));
    return supportedProviders(movie.results || [], tv.results || []);
  }
  async function provider(key, type) {
    const p = (await providers()).find(p => p.key === key);
    if (!p) throw new ApiError(404, 'Esta plataforma no tiene catálogo disponible en la API para España.');
    if (!p.ids[type]?.length) throw new ApiError(404, 'Este tipo de catálogo no está disponible para esta plataforma.');
    return p;
  }
  async function discover(key, type, sort = 'popular', page = 1, genre) {
    const p = await provider(key, type);
    const date = new Date().toISOString().slice(0, 10);
    const orders = { popular: 'popularity.desc', rated: 'vote_average.desc', recent: type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc' };
    const data = await request(`/discover/${type}`, { watch_region: 'ES', with_watch_providers: p.ids[type].join('|'),
      with_watch_monetization_types: 'flatrate', include_adult: 'false', page, sort_by: orders[sort] || orders.popular,
      ...(genre ? { with_genres: String(genre) } : {}),
      ...(sort === 'rated' ? { 'vote_count.gte': '100' } : {}),
      ...(sort === 'recent' ? { [type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte']: date } : {}) });
    return { results: (data.results || []).map(x => normalize(x, type)), page: data.page, totalPages: Math.min(data.total_pages || 0, 500), totalResults: data.total_results };
  }
  async function availability(type, id) { return (await request(`/${type}/${id}/watch/providers`)).results?.ES || {}; }
  async function search(key, type, query, page) {
    const p = await provider(key, type);
    const data = await request(`/search/${type}`, { query, page, include_adult: 'false' });
    // Search does not accept a provider filter: verify each hit against Spanish subscription availability.
    const results = await Promise.all((data.results || []).map(async item => {
      const es = await availability(type, item.id);
      return (es.flatrate || []).some(x => p.ids[type].includes(x.provider_id)) ? normalize(item, type) : null;
    }));
    return { results: results.filter(Boolean), page: data.page, totalPages: Math.min(data.total_pages || 0, 500), filteredSearch: true };
  }
  async function details(key, type, id) {
    const p = await provider(key, type);
    const [item, es] = await Promise.all([request(`/${type}/${id}`, { append_to_response: 'external_ids' }), availability(type, id)]);
    if (!(es.flatrate || []).some(x => p.ids[type].includes(x.provider_id))) throw new ApiError(404, 'El título ya no figura incluido en esta plataforma en España.');
    return { ...normalize(item, type), genres: (item.genres || []).map(g => g.name), runtime: item.runtime,
      seasons: item.number_of_seasons, imdb: item.imdb_id || item.external_ids?.imdb_id,
      tvdb: item.external_ids?.tvdb_id, availabilityUrl: es.link };
  }
  async function identifyNetflixRank(type, title) {
    const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const data = await request(`/search/${type}`, { query: title, language: 'en-US', include_adult: 'false' });
    const matches = (data.results || []).filter(item => [item.title, item.name, item.original_title, item.original_name].some(value => clean(value) === clean(title)));
    const included = [];
    for (const match of matches) {
      try { included.push(await details('netflix', type, match.id)); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    // Never attach a Plex link to an ambiguous title from the official ranking.
    return included.length === 1 ? included[0] : null;
  }
  async function shelves(key, type) {
    const genres = (await request(`/genre/${type}/list`)).genres || [];
    const preferred = type === 'tv' ? [9648, 35, 80] : [28, 35, 53];
    const selected = preferred.map(id => genres.find(g => g.id === id)).filter(Boolean);
    return Promise.all(selected.map(async genre => ({ title: genre.name, ...(await discover(key, type, 'popular', 1, genre.id)) })));
  }
  return { providers, discover, search, details, identifyNetflixRank, shelves };
}
