/* ════════════════════════════════════════════════════════════════════════
   ГДЕ ЖИТЬ — мини-апка «Карта доступа» (лид-магнит воронки).
   Один экран: выбери ЗАДАЧУ (кластер) → карта мира подсвечивает страны с
   доступом → тап страны = тизер (полупольза + 🔒) → переход в бота t-<cluster>-<ISO>.
   Самодостаточна: данные из статического map_data.json, бэкенд НЕ нужен.
   Карта (jsVectorMap) = прогрессивное улучшение: если не загрузилась — чипы
   стран + карточки + CTA всё равно работают.
   Контракт: MASTER-SPEC-v2 §3 (cluster-ключи, ISO-2, deep-link t-<cluster>-<ISO>).
   ════════════════════════════════════════════════════════════════════════ */

const BOT_USERNAME     = 'gde_zhit_YT_bot';   // @gde_zhit_YT_bot (Сессия 1)
const DEFAULT_CLUSTER  = 'birth';              // 1-й чип (money-headline) → активен+виден без скролла, карта горит по Латам/Европе
const FRESHNESS        = '06.2026';

/* ───────────────────────────────────────────────── Telegram bridge ────── */
const _realTg = window.Telegram && window.Telegram.WebApp;
const isTelegram = !!(_realTg && _realTg.initData);
const MOCK_TG = {
  initData: '', initDataUnsafe: {}, version: '6.0', colorScheme: 'dark', themeParams: {},
  isExpanded: true,
  ready() {}, expand() {}, close() {},
  onEvent() {}, offEvent() {},
  setHeaderColor() {}, setBackgroundColor() {},
  disableVerticalSwipes() {}, requestFullscreen() {},
  isVersionAtLeast() { return false; },
  openLink(url) { window.open(url, '_blank', 'noopener'); },
  openTelegramLink(url) { window.open(url, '_blank', 'noopener'); },
  HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
};
const tg = _realTg || MOCK_TG;
const atLeast = (v) => { try { return tg.isVersionAtLeast && tg.isVersionAtLeast(v); } catch { return false; } };

function haptic(kind = 'light') {
  if (!atLeast('6.1')) return;
  try {
    const h = tg.HapticFeedback; if (!h) return;
    if (['success', 'error', 'warning'].includes(kind)) h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind);
  } catch { /* noop */ }
}

async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

let _toastTimer = null;
function toast(msg) {
  document.getElementById('toast')?.remove();
  const el = document.createElement('div');
  el.id = 'toast'; el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.remove(), 2100);
}

function openTgLink(url) {
  if (!isTelegram) {
    const w = window.open(url, '_blank', 'noopener');
    if (!w) { copyText(url); toast('Ссылка скопирована — открой в Telegram'); }
    return;
  }
  try { if (atLeast('7.0')) tg.openTelegramLink(url); else tg.openLink(url); }
  catch { window.open(url, '_blank', 'noopener'); }
}

const THEME_KEYS = [
  'bg_color', 'text_color', 'hint_color', 'link_color', 'button_color',
  'button_text_color', 'secondary_bg_color', 'section_bg_color',
  'header_bg_color', 'accent_text_color', 'subtitle_text_color', 'destructive_text_color',
];
function applyTheme() {
  const tp = tg.themeParams || {};
  const root = document.documentElement.style;
  for (const k of THEME_KEYS) if (tp[k]) root.setProperty('--tg-theme-' + k.replace(/_/g, '-'), tp[k]);
  document.documentElement.dataset.scheme = tg.colorScheme || 'dark';
}

/* ───────────────────────────────────────────────── deep-link ──────────── */
const VALID = /^[A-Za-z0-9_-]{1,64}$/;
function payload(cluster, iso) {
  const c = VALID.test(`t-${cluster}`) ? cluster : 'unknown';   // защита fallback-ветки
  return iso && VALID.test(`t-${c}-${iso}`) ? `t-${c}-${iso}` : `t-${c}`;
}
function botLink(cluster, iso) { return `https://t.me/${BOT_USERNAME}?start=${payload(cluster, iso)}`; }

/* ───────────────────────────────────────────────── map palette ────────── */
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let PAL = {};
function readPalette() {
  PAL = {
    land:     css('--gzh-map-land')     || '#1a2233',
    stroke:   css('--gzh-map-stroke')   || 'rgba(255,255,255,.07)',
    active:   css('--gzh-map-active')   || '#e8b04b',
    selected: css('--gzh-map-selected') || '#f0c878',
    hover:    css('--gzh-map-hover')    || '#2a3550',
  };
}

/* ───────────────────────────────────────────────── state ──────────────── */
let DATA = null;
let activeCluster = DEFAULT_CLUSTER;
let selectedISO = null;
let map = null;
let prevActive = new Set();
let hintShown = true;
let firstPaint = true;   // первый selectCluster из boot() не должен скроллить чипы (иначе 1-й money-чип уезжает)

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const flag = (iso, w = 40) => `https://flagcdn.com/w${w}/${iso.toLowerCase()}.png`;

/* ───────────────────────────────────────────────── render shell ───────── */
function renderShell() {
  const order = DATA.meta.cluster_order;
  const chips = order.map((cl) => {
    const c = DATA.clusters[cl];
    return `<button class="task-chip" role="tab" data-cluster="${esc(cl)}" data-tier="${esc(c.tier)}" aria-selected="false">
      <span class="tc-emoji">${esc(c.emoji)}</span><span class="tc-label">${esc(c.label)}</span>
    </button>`;
  }).join('');

  $('#app').innerHTML = `
    <header class="view-head map-head">
      <span class="kicker">Где Жить · карта релокации</span>
      <h1>🗺️ Карта доступа</h1>
      <p>Выбери задачу — карта покажет, где есть выход. Тапни страну → что доступно.</p>
    </header>

    <nav class="task-chips" role="tablist" aria-label="Задачи">${chips}</nav>

    <section class="map-stage">
      <div id="map-canvas"></div>
      <div class="map-count" id="map-count"></div>
      <div class="map-hint" id="map-hint">Тапни подсвеченную страну</div>
    </section>

    <div class="map-global" id="map-global" hidden></div>
    <p class="map-disclaimer">Данные на <b>${FRESHNESS}</b> · «доступно» = есть рабочий путь, не гарантия.</p>

    <div class="country-strip-wrap">
      <span class="kicker" id="strip-kicker"></span>
      <div class="country-strip" id="country-strip"></div>
    </div>
  `;

  // sticky CTA (вне #app, fixed)
  let cta = document.querySelector('.sticky-cta');
  if (!cta) {
    cta = document.createElement('div');
    cta.className = 'sticky-cta';
    cta.innerHTML = `
      <button class="btn btn-gold" id="cta-btn">Проверить мой случай →</button>
      <p class="cta-sub"><b>Бесплатно</b> · ответит консультант</p>`;
    document.body.appendChild(cta);
  }

  // events
  $('.task-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.task-chip'); if (!b) return;
    haptic('select'); selectCluster(b.dataset.cluster);
  });
  $('#country-strip').addEventListener('click', (e) => {
    const p = e.target.closest('.country-pill'); if (!p) return;
    haptic('light'); openSheet(p.dataset.iso);
  });
  $('#map-global').addEventListener('click', () => { haptic('light'); openTgLink(botLink(activeCluster, null)); });
  $('#cta-btn').addEventListener('click', () => { haptic('medium'); openTgLink(botLink(activeCluster, selectedISO)); });
}

/* ───────────────────────────────────────────────── cluster switch ─────── */
function selectCluster(cl) {
  if (!DATA.clusters[cl]) return;
  activeCluster = cl; selectedISO = null;
  document.querySelectorAll('.task-chip').forEach((el) => {
    const on = el.dataset.cluster === cl;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && !firstPaint) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
  paintCluster();
  renderCountryStrip();
  renderGlobalPlate();
  updateCount();
}

function updateCount() {
  const c = DATA.clusters[activeCluster];
  const n = c.iso_list.length;
  const el = $('#map-count');
  // у global-кластеров счётчик «N стран» противоречит «из любой страны» → прячем (смысл несёт плашка)
  if (c.global) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `${n} ${plural(n, 'страна', 'страны', 'стран')}`;
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function renderGlobalPlate() {
  const c = DATA.clusters[activeCluster];
  const el = $('#map-global');
  if (c.global) {
    const n = c.iso_list.length;
    // согласуем смыслы: «работает отовсюду» + N как «направления», а не «только эти N стран»
    const txt = n ? `🌐 Работает из любой страны · ${n} ${plural(n, 'направление', 'направления', 'направлений')}`
                  : '🌐 Доступно из любой страны';
    el.innerHTML = `<span>${esc(txt)}</span><span class="mg-go">→</span>`;
    el.hidden = false;
  } else { el.hidden = true; }
}

function renderCountryStrip() {
  const c = DATA.clusters[activeCluster];
  $('#strip-kicker').textContent = 'Страны доступа · тапни';
  $('#country-strip').innerHTML = c.iso_list.map((iso) => {
    const co = c.countries[iso];
    return `<button class="country-pill" data-iso="${esc(iso)}">
      <img class="flag-img" src="${flag(iso, 40)}" alt="" loading="lazy">
      <span>${esc(co.name)}</span>
    </button>`;
  }).join('');
}

/* ───────────────────────────────────────────────── map ────────────────── */
function initMap() {
  const JVM = window.jsVectorMap;
  const canvas = $('#map-canvas');
  if (!JVM || !canvas) {
    if (canvas) canvas.innerHTML = `<div class="map-fallback">Карта не загрузилась — выбирай страну из списка ниже 👇</div>`;
    return;
  }
  const active = new Set(DATA.clusters[activeCluster].iso_list);
  const values = {}; active.forEach((iso) => (values[iso] = 'active'));
  prevActive = active;
  try {
    map = new JVM({
      selector: '#map-canvas',
      map: 'world_merc',
      zoomButtons: false, zoomOnScroll: false, draggable: false, bindTouchEvents: true,
      showTooltip: false, backgroundColor: 'transparent',
      regionStyle: {
        initial: { fill: PAL.land, stroke: PAL.stroke, strokeWidth: 0.5 },
        hover: { fill: PAL.hover, cursor: 'pointer' },
      },
      series: { regions: [{ attribute: 'fill', scale: { active: PAL.active, off: PAL.land, sel: PAL.selected }, values }] },
      onRegionClick: (e, code) => { haptic('light'); openSheet(code); },
    });
  } catch (err) {
    console.warn('[map] init failed', err);
    canvas.innerHTML = `<div class="map-fallback">Карта не загрузилась — выбирай страну из списка ниже 👇</div>`;
    map = null; return;
  }
  // рекон-фикс: либа ставит touch-action:none на <svg> в рантайме → вернуть pan-y
  const svg = canvas.querySelector('svg');
  if (svg) svg.style.touchAction = 'pan-y';
}

function paintCluster() {
  if (!map) return;
  const active = new Set(DATA.clusters[activeCluster].iso_list);
  const union = new Set([...prevActive, ...active]);
  const values = {};
  union.forEach((iso) => (values[iso] = active.has(iso) ? 'active' : 'off'));
  try { map.series.regions[0].setValues(values); }
  catch (err) { console.warn('[map] setValues failed → rebuild', err); rebuildMap(); }
  prevActive = active;
}

function rebuildMap() {
  if (map) { try { map.destroy(); } catch {} map = null; }
  initMap();
}

function setMapSelected(iso) {
  if (!map) return;
  const v = {};
  if (selectedISO && DATA.clusters[activeCluster].countries[selectedISO]) v[selectedISO] = 'active';
  if (iso && DATA.clusters[activeCluster].countries[iso]) v[iso] = 'sel';
  if (Object.keys(v).length) { try { map.series.regions[0].setValues(v); } catch {} }
}

/* ───────────────────────────────────────────────── bottom sheet ───────── */
function ensureSheet() {
  if (document.querySelector('.country-sheet')) return;
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim'; scrim.id = 'sheet-scrim'; scrim.hidden = true;
  const sheet = document.createElement('aside');
  sheet.className = 'country-sheet'; sheet.id = 'country-sheet'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  document.body.appendChild(scrim); document.body.appendChild(sheet);
  scrim.addEventListener('click', closeSheet);
  // свайп вниз по «ручке»/листу → закрыть
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  // non-passive: гасим нативный скролл страницы за скримом во время свайпа-закрытия (iOS-фикс)
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) { e.preventDefault(); sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: false });
  sheet.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = (e.changedTouches[0].clientY - y0);
    sheet.style.transform = '';
    if (dy > 80) closeSheet();
    y0 = null;
  });
  sheet.addEventListener('touchcancel', () => { sheet.style.transform = ''; y0 = null; });
}

function openSheet(iso) {
  ensureSheet();
  const c = DATA.clusters[activeCluster];
  const co = c.countries[iso];
  const sheet = $('#country-sheet'); const scrim = $('#sheet-scrim');

  if (hintShown) { const h = $('#map-hint'); if (h) h.style.opacity = '0'; hintShown = false; }

  if (co) {
    // активная страна — полный тизер
    selectedISO = iso; setMapSelected(iso);
    const factHtml = co.fact ? `<p class="sheet-fact">${esc(co.fact)}</p>` : '';
    const hookHtml = co.hook ? `<p class="sheet-hook">${esc(co.hook)}</p>` : '';
    sheet.innerHTML = `
      <div class="sheet-grab"></div>
      <header class="sheet-head">
        <img class="flag-img" src="${flag(iso, 80)}" alt="">
        <div class="sheet-id">
          <h3 class="sheet-name">${esc(co.name)}</h3>
          <span class="sheet-cluster">${c.emoji} ${esc(c.label)}</span>
        </div>
        <button class="sheet-close" aria-label="Закрыть">✕</button>
      </header>
      ${hookHtml}
      <ul class="sheet-bullets">${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      ${factHtml}
      <div class="sheet-locked">
        <span class="lk-ico">🔒</span>
        <span>Сроки, стоимость и как именно в твоём случае — на консультации.</span>
      </div>
      <button class="btn btn-gold sheet-cta" data-link="${botLink(activeCluster, iso)}">Проверить мой случай — бесплатно →</button>
    `;
  } else {
    // серая страна — нет прямого доступа → конверт промаха в бота
    selectedISO = null;
    sheet.innerHTML = `
      <div class="sheet-grab"></div>
      <header class="sheet-head">
        <img class="flag-img" src="${flag(iso, 80)}" alt="">
        <div class="sheet-id">
          <h3 class="sheet-name">${esc(isoName(iso))}</h3>
          <span class="sheet-cluster">${c.emoji} ${esc(c.label)}</span>
        </div>
        <button class="sheet-close" aria-label="Закрыть">✕</button>
      </header>
      <div class="sheet-empty-note">
        <span class="ne-ico">🧭</span>
        <span>По этой задаче здесь пока нет прямого выхода. Но направление можно разобрать — или выбери другую задачу.</span>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-gold sheet-cta" data-link="${botLink(activeCluster, iso)}">Спросить про эту страну →</button>
        <button class="btn btn-ghost" id="sheet-change">Сменить задачу</button>
      </div>
    `;
  }

  sheet.querySelector('.sheet-close')?.addEventListener('click', closeSheet);
  sheet.querySelector('.sheet-cta')?.addEventListener('click', (e) => {
    haptic('medium'); openTgLink(e.currentTarget.dataset.link);
  });
  sheet.querySelector('#sheet-change')?.addEventListener('click', () => {
    closeSheet(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  scrim.hidden = false; sheet.hidden = false; sheet.classList.remove('closing');
  sheet.scrollTop = 0;
}

function isoName(iso) {
  // имя серой страны: ищем в любом кластере, иначе сам код
  for (const cl of DATA.meta.cluster_order) {
    const co = DATA.clusters[cl].countries[iso];
    if (co) return co.name;
  }
  return iso;
}

function closeSheet() {
  const sheet = $('#country-sheet'); const scrim = $('#sheet-scrim');
  if (!sheet || sheet.hidden) return;
  sheet.classList.add('closing');
  scrim.hidden = true;
  const done = () => {
    sheet.hidden = true; sheet.classList.remove('closing'); sheet.style.transform = '';
    sheet.removeEventListener('animationend', done); clearTimeout(fallback);
  };
  // fallback-таймер: при prefers-reduced-motion анимация подавлена → animationend не стрельнёт,
  // иначе лист завис бы видимым и заблокировал экран
  const fallback = setTimeout(done, 320);
  sheet.addEventListener('animationend', done);
  if (selectedISO) { setMapSelected(null); }
}

/* ───────────────────────────────────────────────── boot ───────────────── */
async function boot() {
  applyTheme();
  readPalette();
  try { tg.ready(); tg.expand(); } catch {}
  try {
    if (atLeast('6.1')) { tg.setHeaderColor('#0a0c10'); tg.setBackgroundColor('#0a0c10'); }
    if (atLeast('7.7')) tg.disableVerticalSwipes(); // карта не закрывает апку свайпом
  } catch {}
  try { tg.onEvent('themeChanged', () => { applyTheme(); readPalette(); }); } catch {}

  // iOS: не дать TG перехватить свайп как «закрыть» при scrollTop=0
  try {
    document.documentElement.style.setProperty('min-height', 'calc(100% + 1px)');
    window.addEventListener('scroll', () => { if (window.scrollY === 0) window.scrollTo(0, 1); }, { passive: true });
  } catch {}

  try {
    const res = await fetch('./map_data.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (err) {
    $('#app').innerHTML = `<div class="empty-note">Не удалось загрузить карту. Обнови страницу.</div>`;
    console.error('[map_data] load failed', err); return;
  }

  if (!DATA.clusters[activeCluster]) activeCluster = DATA.meta.cluster_order[0];

  renderShell();
  initMap();
  selectCluster(activeCluster);
  firstPaint = false;   // дальше переключения чипов уже скроллят активный в центр
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
