/* StreamDeck: bundled in the APK and also served directly by Node. */
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imageUrl = (path, size = 'w500') => /^\/[a-zA-Z0-9._-]+$/.test(path || '') ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const isAndroid = typeof Android !== 'undefined';
const defaultApiBase = isAndroid && typeof Android.getApiBase === 'function' ? Android.getApiBase() : '';
let apiBase = localStorage.getItem('streamdeck.api') || defaultApiBase;
let providers = [], status = {}, state = { view: 'home', provider: null, type: 'tv', sort: 'popular', page: 1, query: '' }, revision = 0;
let returnFocus, toastTimer, detailRevision = 0;
async function api(path, params = {}) {
  if (isAndroid && !apiBase) throw new Error('Conecta el Fire TV con el servidor desde Ajustes.');
  let response;
  try { response = await fetch(`${apiBase}/api/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(60000) }); }
  catch { throw new Error('No se pudo conectar con el servidor. Comprueba su dirección y que esté encendido.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo.');
  return data;
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6500); }
function closeDetail() { detailRevision++; if ($('#detail').open) $('#detail').close(); }
function go(next) { closeDetail(); state = { ...state, page: 1, query: '', ...next }; render(); window.scrollTo(0, 0); }
function params(extra = {}) { return { provider: state.provider.key, type: state.type, ...extra }; }
function meta(item) { return `<div class="meta"><span class="score">★ ${Number(item.score).toFixed(1)}</span><span>${esc(item.year)}</span><span class="tag">${item.type === 'tv' ? 'SERIE' : 'PELÍCULA'}</span></div>`; }
function card(item, rank) {
  const src = imageUrl(item.poster, 'w342');
  return `<button class="poster" ${item.id ? `data-title="${item.id}" data-type="${item.type}"` : 'disabled'} aria-label="${item.id ? 'Ver ficha de' : 'Ficha sin identificar:'} ${esc(item.title)}"><span class="poster-visual">${src ? `<img src="${src}" alt="" loading="lazy">` : '<span class="fallback">▰</span>'}${rank ? `<span class="poster-rank">${rank}</span>` : ''}</span><span class="poster-title">${esc(item.title)}</span><span class="poster-year">${item.rankSeason ? esc(item.rankSeason) : `${esc(item.year)} · ${item.type === 'tv' ? 'Serie' : 'Película'}`}${item.id ? '' : ' · Ficha sin identificar'}</span></button>`;
}
function wireImages() { document.querySelectorAll('img').forEach(img => { img.onerror = () => { img.style.display = 'none'; }; }); }
function wireTitles(items, scope = document) {
  scope.querySelectorAll('[data-title]').forEach(button => button.onclick = () => {
    const item = items.find(x => String(x.id) === button.dataset.title && x.type === button.dataset.type);
    if (item) {
      if (button.dataset.play === 'true') searchPlex(item.title, item.type, item.id);
      else showDetail(item);
    }
  });
  wireImages();
}
function navigation() {
  $('#navigation').innerHTML = state.provider ? `<button id="nav-start" class="${state.view === 'browse' ? 'active' : ''}">Inicio</button><button id="nav-catalog" class="${state.view === 'catalog' ? 'active' : ''}">Catálogo</button>` : '';
  if ($('#nav-start')) $('#nav-start').onclick = () => go({ view: 'browse' });
  if ($('#nav-catalog')) $('#nav-catalog').onclick = () => go({ view: 'catalog' });
  document.body.dataset.platform = state.provider?.key || '';
}
async function render() {
  const version = ++revision;
  navigation();
  const main = $('#main');
  if (state.view === 'home') return home(version);
  main.innerHTML = '<div class="loading"><span class="spinner"></span> Buscando tu próxima historia…</div>';
  try {
    if (state.view === 'browse') {
      const [popular, rated, recent] = await Promise.all(['popular', 'rated', 'recent'].map(sort => api('catalog', params({ sort }))));
      if (version !== revision) return;
      const featured = popular.results.find(x => x.backdrop) || popular.results[0];
      const rows = [[popular, 'Populares · TMDB', false], [recent, 'Estrenos recientes', false], [rated, 'Mejor valoradas', false]];
      main.innerHTML = `<section class="browse">${platformBar()}${featured ? `<section class="hero">${imageUrl(featured.backdrop, 'w1280') ? `<img class="hero-image" src="${imageUrl(featured.backdrop, 'w1280')}" alt="">` : ''}<div class="hero-content"><div class="eyebrow">Para tu próxima sesión</div><h1>${esc(featured.title)}</h1>${meta(featured)}<p>${esc(featured.overview || 'Descubre este título disponible en España.')}</p><div class="actions"><button class="primary" data-play="true" data-title="${featured.id}" data-type="${featured.type}">▶ &nbsp; Ver en Plex</button><button class="secondary" data-title="${featured.id}" data-type="${featured.type}">＋ &nbsp; Más información</button></div></div></section>` : '<div class="results"><div class="empty"><h2>No hay títulos disponibles</h2><p>La API no devuelve contenido incluido en esta suscripción para España.</p></div></div>'}<div class="shelves">${rows.map(([data, title, rank]) => data.results.length ? `<section class="shelf"><div class="section-heading"><h2>${title}</h2><span>${state.type === 'tv' ? 'Series' : 'Películas'} · España</span></div><div class="rail">${data.results.map((x, i) => card(x, rank ? i + 1 : 0)).join('')}</div></section>` : '').join('')}<p class="catalog-note">Popularidad y valoraciones de TMDB, filtradas por disponibilidad en España. No representan las audiencias oficiales de ${esc(state.provider.name)}. «Estrenos recientes» se ordena por fecha del título, no por fecha de incorporación a la plataforma.</p></div></section>`;
      wirePlatform(); wireTitles(rows.flatMap(([data]) => data.results));
      if (state.provider.key === 'netflix') {
        main.querySelector('.shelves').insertAdjacentHTML('afterbegin', '<section class="shelf official-ranking" id="netflix-ranking"><div class="section-heading"><h2>Top 10 oficial en España</h2><span>Netflix · Semanal</span></div><p class="catalog-note"><span class="spinner"></span> Consultando el último ranking publicado por Netflix…</p></section>');
        loadNetflixRanking(version);
        main.querySelector('.shelves').insertAdjacentHTML('beforeend', '<div id="netflix-genres"></div>');
        loadNetflixGenres(version);
      }
    } else {
      const search = state.view === 'search';
      const data = await api(search ? 'search' : 'catalog', params({ sort: state.sort, page: state.page, ...(search ? { q: state.query } : {}) }));
      if (version !== revision) return;
      main.innerHTML = `${platformBar()}<section class="results"><div class="eyebrow">${esc(state.provider.name)} · España</div><h1>${search ? `Resultados para «${esc(state.query)}»` : 'Encuentra algo que te apetezca'}</h1>${search ? '<p class="catalog-note">Solo títulos incluidos en esta plataforma. Si no hay resultados, puedes consultar la siguiente página.</p>' : `<div class="sort-tabs">${[['popular', 'Populares'], ['recent', 'Estrenos recientes'], ['rated', 'Mejor valoradas']].map(([key, name]) => `<button data-sort="${key}" class="${state.sort === key ? 'active' : ''}">${name}</button>`).join('')}</div>`}<div class="grid">${data.results.map(x => card(x)).join('')}</div>${!data.results.length ? '<div class="empty"><h2>No hay resultados en esta página</h2><p>Prueba otra búsqueda o la siguiente página si está disponible.</p></div>' : ''}<div class="pager"><button id="previous" class="secondary" ${state.page <= 1 ? 'disabled' : ''}>← Anterior</button><span>Página ${state.page} de ${data.totalPages || 1}</span><button id="next" class="secondary" ${state.page >= data.totalPages ? 'disabled' : ''}>Siguiente →</button></div></section>`;
      wirePlatform(); wireTitles(data.results);
      document.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => go({ sort: b.dataset.sort }));
      $('#previous').onclick = () => go({ page: state.page - 1, query: state.query });
      $('#next').onclick = () => go({ page: state.page + 1, query: state.query });
    }
  } catch (error) {
    if (version !== revision) return;
    main.innerHTML = `<div class="results">${platformBar()}<div class="empty"><h2>No pudimos cargar el catálogo</h2><p>${esc(error.message)}</p><div class="actions"><button id="retry" class="primary">Volver a intentar</button><button id="error-home" class="secondary">Plataformas</button></div></div></div>`;
    $('#retry').onclick = render; $('#error-home').onclick = () => go({ view: 'home', provider: null }); wirePlatform();
  }
}
async function loadNetflixGenres(version) {
  try {
    const data = await api('shelves', params());
    if (version !== revision || !$('#netflix-genres')) return;
    const section = $('#netflix-genres');
    section.innerHTML = data.shelves.filter(row => row.results.length).map(row => `<section class="shelf"><div class="section-heading"><h2>${esc(row.title)}</h2><span>Incluido en Netflix · España</span></div><div class="rail">${row.results.map(x => card(x)).join('')}</div></section>`).join('');
    wireTitles(data.shelves.flatMap(row => row.results), section);
  } catch { /* Optional genre shelves must never prevent browsing the core catalogue. */ }
}
async function loadNetflixRanking(version) {
  const type = state.type;
  try {
    const data = await api('netflix/top10', { type });
    if (version !== revision) return;
    const section = $('#netflix-ranking'); if (!section) return;
    const end = new Date(data.week + 'T12:00:00Z'), start = new Date(end); start.setUTCDate(end.getUTCDate() - 6);
    const format = date => date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    section.innerHTML = `<div class="section-heading"><h2>Top 10 ${type === 'tv' ? 'series' : 'películas'} en España</h2><span>Ranking oficial de Netflix</span></div><div class="rail">${data.results.map(x => card(x, x.rank)).join('')}</div><p class="catalog-note">Semana del ${format(start)} al ${format(end)} · <a href="${esc(data.sourceUrl)}" target="_blank" rel="noreferrer">Netflix Tudum ↗</a>. ${data.results.some(x => !x.identified) ? 'Los títulos sin ficha identificada conservan su puesto oficial y no ofrecen reproducción.' : ''}</p>`;
    wireTitles(data.results.filter(x => x.id), section);
    const featured = data.results.find(x => x.identified && x.backdrop);
    const hero = $('#main .hero');
    if (featured && hero) {
      hero.innerHTML = `<img class="hero-image" src="${imageUrl(featured.backdrop, 'w1280')}" alt=""><div class="hero-content"><div class="eyebrow">Nº ${featured.rank} en España · Netflix semanal</div><h1>${esc(featured.title)}</h1>${meta(featured)}<p>${esc(featured.overview || 'Uno de los títulos del ranking oficial de Netflix en España.')}</p><div class="actions"><button class="primary" data-play="true" data-title="${featured.id}" data-type="${featured.type}">▶ &nbsp; Ver en Plex</button><button class="secondary" data-title="${featured.id}" data-type="${featured.type}">＋ &nbsp; Más información</button></div></div>`;
      wireTitles([featured], hero);
    }
  } catch {
    if (version !== revision || !$('#netflix-ranking')) return;
    $('#netflix-ranking').innerHTML = '<div class="section-heading"><h2>Top 10 oficial en España</h2></div><p class="catalog-note">No se pudo consultar el ranking de Netflix. <a href="https://www.netflix.com/tudum/top10/spain" target="_blank" rel="noreferrer">Ver la fuente oficial ↗</a></p>';
  }
}
async function home(version) {
  let errorMessage = '';
  $('#main').innerHTML = '<div class="loading"><span class="spinner"></span> Conectando con tus plataformas…</div>';
  try {
    status = await api('status');
    providers = status.tmdbConfigured ? (await api('providers')).providers : [];
  } catch (error) { providers = []; status = {}; errorMessage = error.message; }
  if (version !== revision) return;
  $('#main').innerHTML = `<section class="chooser"><div class="eyebrow">Una pantalla. Todas tus historias.</div><h1>¿Qué te apetece<br><em>ver esta noche?</em></h1><p class="intro">Elige una plataforma. Explora su catálogo. Dale al play en Plex.</p><div class="section-heading"><h2>Tus plataformas</h2><span>${providers.length ? `${providers.length} disponibles en España` : 'Conecta tu catálogo'}</span></div>${providers.length ? `<div class="providers">${providers.map(p => `<button class="provider" data-brand="${p.key}"><span class="provider-mark">${esc(p.mark)}</span><small>${p.ids.movie.length && p.ids.tv.length ? 'Películas y series' : p.ids.tv.length ? 'Series' : 'Películas'}</small></button>`).join('')}</div>` : `<div class="setup-card"><span class="step-label">PREPARA TU PRIMERA SESIÓN</span><h2>${errorMessage ? 'Conecta con tu servidor' : status.tmdbConfigured ? 'Sin plataformas disponibles' : 'Tu catálogo empieza aquí'}</h2><p>${errorMessage ? esc(errorMessage) : status.tmdbConfigured ? 'La API no devuelve ninguna de las plataformas admitidas para España.' : 'Añade el token de TMDB al servidor para descubrir las plataformas con catálogo disponible en España. Solo aparecerán servicios confirmados por la API.'}</p><div class="actions"><button id="connect" class="primary">⚙ &nbsp; Conexión y ajustes</button><button id="retry-home" class="secondary">Actualizar</button></div></div>`}<div class="connection-strip"><span><strong>Tu catálogo, tu reproductor.</strong> Elige aquí. Disfrútalo en Plex.</span><span><b>PLEX</b> &nbsp; ${status.plexConfigured ? 'Servidor configurado' : 'Pendiente de conectar'}</span></div><p class="setup-footnote">Disponibilidad de suscripción para España, facilitada por JustWatch a través de TMDB.<br>Los títulos pueden variar según tu plan. La reproducción requiere que estén en tu biblioteca Plex.</p></section>`;
  document.querySelectorAll('[data-brand]').forEach(button => button.onclick = () => {
    const p = providers.find(x => x.key === button.dataset.brand);
    go({ view: 'browse', provider: p, type: p.ids.tv.length ? 'tv' : 'movie', sort: 'popular' });
  });
  if ($('#connect')) $('#connect').onclick = settings;
  if ($('#retry-home')) $('#retry-home').onclick = render;
  if (status.plexServerName) $('.connection-strip span:last-child').innerHTML = `<b>PLEX</b> &nbsp; ${esc(status.plexServerName)} · configurado`;
}
function platformBar() {
  const p = state.provider;
  return `<div class="platform-bar"><span class="platform-logo">${esc(p.mark)}</span><div class="type-tabs">${[['tv', 'Series'], ['movie', 'Películas']].filter(([type]) => p.ids[type].length).map(([type, name]) => `<button data-kind="${type}" class="${type === state.type ? 'active' : ''}">${name}</button>`).join('')}</div><form class="search-form" id="search-form"><input aria-label="Buscar en ${esc(p.name)}" placeholder="Buscar en ${esc(p.name)}" id="search-input" value="${esc(state.query)}" minlength="2" maxlength="120" required><button type="submit" aria-label="Buscar">⌕ &nbsp; Buscar</button></form></div>`;
}
function wirePlatform() {
  document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => go({ type: button.dataset.kind, view: state.view === 'search' ? 'catalog' : state.view }));
  if ($('#search-form')) $('#search-form').onsubmit = event => { event.preventDefault(); const query = $('#search-input').value.trim(); if (query.length >= 2) go({ view: 'search', query }); };
}
async function showDetail(item) {
  const version = ++detailRevision;
  returnFocus = document.activeElement;
  const dialog = $('#detail');
  dialog.innerHTML = '<div class="dialog-body"><div class="loading"><span class="spinner"></span> Cargando ficha…</div><button class="secondary" id="cancel-detail">Cerrar</button></div>';
  dialog.showModal(); $('#cancel-detail').onclick = closeDetail;
  const p = state.provider;
  try {
    const data = await api('details', { provider: p.key, type: item.type, id: item.id });
    if (!dialog.open || state.provider !== p || version !== detailRevision) return;
    dialog.innerHTML = `<button class="close-button" id="close-detail" aria-label="Cerrar ficha">×</button>${imageUrl(data.backdrop, 'w1280') ? `<div class="detail-cover"><img src="${imageUrl(data.backdrop, 'w1280')}" alt=""></div>` : ''}<div class="dialog-body"><div class="eyebrow">Incluido en ${esc(p.name)} · España</div><h2>${esc(data.title)}</h2>${meta(data)}<div class="genres">${data.genres.map(esc).join(' · ')}${data.runtime ? ` · ${data.runtime} min` : ''}${data.seasons ? ` · ${data.seasons} temporada(s)` : ''}</div><p>${esc(data.overview || 'Sin sinopsis disponible en español.')}</p><div class="actions"><button id="play-plex" class="primary">▶ &nbsp; Ver en Plex</button><button id="open-plex" class="secondary">Abrir Plex</button></div><div class="plex-status" id="plex-status">Se buscará este título en tu biblioteca Plex.</div></div>`;
    $('#close-detail').onclick = closeDetail;
    $('#plex-status').textContent = 'Abre la búsqueda de este título en Plex al instante.';
    $('#open-plex').onclick = launchPlex;
    $('#play-plex').onclick = () => searchPlex(data.title, item.type, item.id);
    wireImages(); $('#play-plex').focus();
  } catch (error) {
    if (!dialog.open || version !== detailRevision) return;
    dialog.innerHTML = `<div class="dialog-body"><h2>No se pudo abrir la ficha</h2><p>${esc(error.message)}</p><button id="close-detail" class="primary">Cerrar</button></div>`;
    $('#close-detail').onclick = closeDetail; $('#close-detail').focus();
  }
}
function searchPlex(title, type, id) {
  const webUrl = `https://app.plex.tv/desktop/#!/search?pivot=top&query=${encodeURIComponent(title)}`;
  if (isAndroid && typeof Android.searchPlex === 'function') Android.searchPlex(title, type || state.type, String(id || ''));
  else {
    const popup = window.open(webUrl, '_blank');
    if (popup) popup.opener = null;
    else window.location.assign(webUrl);
  }
  if ($('#plex-status')) $('#plex-status').textContent = `Abriendo la búsqueda de «${title}» en Plex…`;
}
async function launchPlex() {
  if (isAndroid && typeof Android.openPlexHome === 'function') { Android.openPlexHome(state.type); return; }
  // Reserve the browser window while still in the click event to avoid popup blocking.
  const popup = isAndroid ? null : window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  try {
    const link = await api('plex/home', { type: state.type });
    if (isAndroid) Android.openPlex(link.nativeUrl); else if (popup) popup.location = link.webUrl;
    else toast('Permite abrir pestañas para ir a tu biblioteca Plex.');
  } catch (error) { popup?.close(); toast(error.message); }
}
function settings() {
  const dialog = $('#preferences');
  dialog.innerHTML = `<button class="close-button" id="close-settings" aria-label="Cerrar ajustes">×</button><div class="dialog-body"><div class="eyebrow">Tu centro de conexión</div><h2 id="settings-title">Todo listo para esta noche</h2><p>El servidor mantiene tu catálogo actualizado y conecta tus títulos con Plex.</p><div class="config-state"><span class="${status.tmdbConfigured ? 'ok' : 'warning'}">${status.tmdbConfigured ? '●' : '○'} TMDB ${status.tmdbConfigured ? 'configurado' : 'pendiente'}</span><span class="${status.plexConfigured ? 'ok' : 'warning'}">${status.plexConfigured ? '●' : '○'} Plex ${status.plexConfigured ? 'configurado' : 'pendiente'}</span></div><form id="connection-form"><label class="settings-field">Dirección del servidor Node<input id="api-address" type="url" placeholder="http://192.168.1.100:3477" value="${esc(apiBase)}" ${isAndroid ? 'required' : ''}></label><p class="settings-note">En Fire TV usa la IP del equipo donde ejecutas Node. En este navegador puedes dejarla vacía para usar el servidor actual.</p><button class="primary" type="submit">Guardar y comprobar</button></form><p id="connection-result" role="status"></p><p class="settings-note">En el equipo servidor: copia <code>.env.example</code> como <code>.env</code>, añade <code>TMDB_TOKEN</code> y ejecuta <code>npm start</code>. Para Plex, añade <code>PLEX_URL</code> y <code>PLEX_TOKEN</code>. Reinicia Node después de cambiar esos datos.</p><p class="settings-note"><a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">Obtener el token de lectura de TMDB ↗</a></p><p class="attribution"><img src="tmdb.svg" alt="TMDB">This product uses the TMDB API but is not endorsed or certified by TMDB.<br>Disponibilidad de streaming proporcionada por JustWatch. StreamDeck es una aplicación independiente de las plataformas mostradas.</p></div>`;
  dialog.showModal(); $('#close-settings').onclick = () => dialog.close();
  if (status.plexServerName) dialog.querySelector('.config-state span:last-child').textContent = `● Plex · ${status.plexServerName} · configurado`;
  $('#connection-form').onsubmit = async event => {
    event.preventDefault(); const candidate = $('#api-address').value.trim().replace(/\/+$/, '');
    if (candidate) {
      try { const url = new URL(candidate); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(); }
      catch { $('#connection-result').textContent = 'Usa una dirección http:// o https:// con IP o dominio y puerto, sin rutas ni contraseñas.'; return; }
    }
    const old = apiBase; apiBase = candidate;
    $('#connection-result').textContent = 'Comprobando conexión…';
    try { status = await api('status'); localStorage.setItem('streamdeck.api', candidate); dialog.close(); go({ view: 'home', provider: null }); toast('Servidor conectado.'); }
    catch (error) { apiBase = old; $('#connection-result').textContent = `No se pudo conectar: ${error.message}`; }
  };
}
// Geometry-based navigation: works with Fire TV's D-pad and normal keyboard arrows.
function focusables() {
  const scope = $('#preferences').open ? $('#preferences') : $('#detail').open ? $('#detail') : document;
  return [...scope.querySelectorAll('button:not(:disabled),input,select,a[href]')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}
function back() {
  if ($('#preferences').open) { $('#preferences').close(); return true; }
  if ($('#detail').open) { closeDetail(); return true; }
  if (state.view !== 'home') { go({ view: state.view === 'browse' ? 'home' : 'browse', ...(state.view === 'browse' ? { provider: null } : {}) }); return true; }
  return false;
}
window.streamdeckBack = back;
window.streamdeckNativeError = message => toast(message);
window.streamdeckRemote = (direction) => moveFocus(direction);
function moveFocus(key) {
  const elements = focusables(), current = document.activeElement;
  if (!elements.includes(current)) { elements[0]?.focus(); return; }
  const rect = current.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  const vertical = ['ArrowUp', 'ArrowDown'].includes(key), positive = ['ArrowDown', 'ArrowRight'].includes(key);
  const candidates = elements.filter(el => el !== current).map(el => {
    const r = el.getBoundingClientRect(), dx = r.x + r.width / 2 - x, dy = r.y + r.height / 2 - y;
    const primary = vertical ? dy : dx, cross = vertical ? Math.abs(dx) : Math.abs(dy);
    return { el, primary, score: Math.abs(primary) + cross * 3 };
  }).filter(p => positive ? p.primary > 5 : p.primary < -5).sort((a, b) => a.score - b.score);
  if (candidates[0]) { candidates[0].el.focus({ preventScroll: true }); candidates[0].el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
}
document.addEventListener('keydown', event => {
  if (['Escape', 'BrowserBack'].includes(event.key)) { if (back()) event.preventDefault(); return; }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (document.activeElement?.matches('input') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); moveFocus(event.key);
});
$('#detail').addEventListener('close', () => returnFocus?.focus());
$('#home').onclick = () => go({ view: 'home', provider: null }); $('#settings').onclick = settings;
function updateClock() { $('#clock').textContent = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date()); }
updateClock(); setInterval(updateClock, 30000); render();
