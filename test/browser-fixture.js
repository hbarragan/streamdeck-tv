// Isolated UI verification only. Production server never imports this module.
import { createApp } from '../server/app.js';
const providers = [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 9, provider_name: 'Amazon Prime Video' }, { provider_id: 350, provider_name: 'Apple TV Plus' }, { provider_id: 63, provider_name: 'Movistar Plus+' }];
const titles = [
  { id: 66732, name: 'Stranger Things', title: 'Stranger Things', overview: 'En un pequeño pueblo, la desaparición de un niño revela un misterio extraordinario.', poster_path: '/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg', backdrop_path: '/56v2KjBlU4XaOv9rVYEQypROD7P.jpg', first_air_date: '2016-07-15', release_date: '2016-07-15', vote_average: 8.6 },
  { id: 100, name: 'Título de prueba', title: 'Título de prueba', overview: 'Ficha sintética para comprobar la interfaz.', first_air_date: '2025-04-01', release_date: '2025-04-01', vote_average: 7.5 }
];
const json = data => new Response(JSON.stringify(data));
createApp({ tmdbToken: 'fixture-not-a-real-key' }, async url => {
  if (url.pathname.includes('/watch/providers/')) return json({ results: providers });
  if (url.pathname.endsWith('/watch/providers')) return json({ results: { ES: { flatrate: providers, link: 'https://www.themoviedb.org' } } });
  if (url.pathname.includes('/discover/')) return json({ results: titles, page: Number(url.searchParams.get('page')), total_pages: 2, total_results: 4 });
  if (url.pathname.includes('/search/')) return json({ results: titles.filter(t => t.name.toLowerCase().includes(url.searchParams.get('query').toLowerCase())), page: 1, total_pages: 1 });
  return json({ ...titles.find(t => String(t.id) === url.pathname.split('/').at(-1)), genres: [{ name: 'Misterio' }], number_of_seasons: 4 });
}).listen(3478, '127.0.0.1', () => console.log('TEST-ONLY browser fixture http://127.0.0.1:3478'));
