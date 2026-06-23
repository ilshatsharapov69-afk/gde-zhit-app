/* ════════════════════════════════════════════════════════════════════════
   ГДЕ ЖИТЬ — мини-апка «Карта доступа» (лид-магнит воронки). V1.
   Один фильтр-ЗАДАЧА (bottom-sheet picker, открыт при входе) → крупная карта
   мира подсвечивает страны золотом (зум + имя по тапу) → вертикальный список
   карточек стран («что доступно» из whitelist-софтенера) → тап = тизер →
   переход в бота t-<cluster>-<ISO>. Страна = drill-down, НЕ co-фильтр.
   Самодостаточна: данные из статического map_data.json, бэкенд НЕ нужен.
   Контракт: MASTER-SPEC-v2 §3 (cluster-ключи, ISO-2, deep-link t-<cluster>-<ISO>).
   ════════════════════════════════════════════════════════════════════════ */

const BOT_USERNAME    = 'gde_zhit_YT_bot';   // @gde_zhit_YT_bot (Сессия 1)
const DEFAULT_CLUSTER = 'birth';             // 1-я денежная задача (виден сразу при закрытии picker'а)
const FRESHNESS       = '06.2026';
const BRAND           = 'Где Жить';
const TAGLINE         = 'Что реально оформить за рубежом';
const MANAGER_FLOW    = new URLSearchParams(location.search).has('managerflow'); // МОК-флаг флоу «Связаться с менеджером» (живая апка по умолчанию без него)

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
  const c = VALID.test(`t-${cluster}`) ? cluster : DEFAULT_CLUSTER;   // защита fallback-ветки (валидный ключ §3.1)
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
let prevActive = new Set();   // прошлый набор подсвеченных (для setValues-перекраски без rebuild)
let currentSheet = null;   // открытый лист (#task-sheet | #country-sheet)

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const flag = (iso, w = 40) => `https://flagcdn.com/w${w}/${iso.toLowerCase()}.png`;

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
const variantsLabel = (n) => `${n} ${plural(n, 'вариант', 'варианта', 'вариантов')}`;

// строка услуг карточки: ведём НАИБОЛЕЕ УНИКАЛЬНОЙ для страны фразой (реже встречается в кластере),
// иначе Бразилия/Аргентина выглядят близнецами. freq считается в renderCountryList. Фолбэк → 1-й буллет.
function cardServiceLine(cluster, co, freq) {
  if (co.services && co.services.length) {
    const s = co.services.slice().sort((a, b) => (freq[a] ?? 99) - (freq[b] ?? 99));
    return s.slice(0, 2).join(' · ');
  }
  const b = cluster.bullets;
  return b && b.length ? b[0] : '';
}

/* ───────────────────────────────────────────────── render shell ───────── */
function renderShell() {
  $('#app').innerHTML = `
    <header class="brand-bar">
      <img class="brand-avatar" src="./favicon.svg" alt="" />
      <div class="brand-id">
        <span class="brand-name">${esc(BRAND)}</span>
        <span class="brand-tag">${esc(TAGLINE)}</span>
      </div>
    </header>

    <button class="task-bar" id="task-bar" aria-haspopup="dialog">
      <span class="tb-emoji" id="tb-emoji"></span>
      <span class="tb-label" id="tb-label"></span>
      <span class="tb-change">сменить&nbsp;<span class="tb-caret">▾</span></span>
    </button>

    <section class="map-stage">
      <div id="map-canvas"></div>
      <div class="map-hint" id="map-hint">Тапни страну — покажу, что доступно</div>
    </section>

    <div class="map-global" id="map-global" hidden></div>
    <p class="map-disclaimer">Данные на <b>${FRESHNESS}</b> · «доступно» = есть рабочий путь, не гарантия.</p>

    <div class="country-list-wrap">
      <span class="kicker" id="list-kicker"></span>
      <div class="country-list" id="country-list"></div>
    </div>
  `;

  // sticky CTA (вне #app, fixed)
  let cta = document.querySelector('.sticky-cta');
  if (!cta) {
    cta = document.createElement('div');
    cta.className = 'sticky-cta';
    cta.innerHTML = `
      <button class="btn btn-gold" id="cta-btn">Проверить мой случай →</button>
      ${MANAGER_FLOW ? '<button class="btn mgr-cta" id="mgr-cta-btn" hidden>Связаться с менеджером</button>' : ''}
      <p class="cta-sub"><b>Бесплатно</b> · ответит консультант</p>`;
    document.body.appendChild(cta);
  }

  // events
  $('#task-bar').addEventListener('click', () => { haptic('light'); openTaskPicker(); });
  $('#country-list').addEventListener('click', (e) => {
    const card = e.target.closest('.country-card'); if (!card) return;
    haptic('light'); openCountrySheet(card.dataset.iso);
  });
  $('#map-global').addEventListener('click', () => { haptic('light'); openTgLink(botLink(activeCluster, null)); });
  $('#cta-btn').addEventListener('click', () => { haptic('medium'); openTgLink(botLink(activeCluster, selectedISO)); });
}

/* ───────────────────────────────────────────────── cluster switch ─────── */
function selectCluster(cl) {
  if (!DATA || !DATA.clusters[cl]) return;
  activeCluster = cl; selectedISO = null;
  try { localStorage.setItem('gzh_task', cl); } catch {}   // вернувшемуся юзеру picker не открываем
  renderActiveTask();
  rebuildMap();            // пересоздать карту под кластер (подписи = ТОЛЬКО активные/жёлтые страны)
  renderCountryList();
  renderGlobalPlate();
  syncMgrBtn();
}

// ghost «Связаться с менеджером» видна только на money-кластерах (tier=high) — SPEC §6
function syncMgrBtn() {
  if (!MANAGER_FLOW) return;
  const m = document.getElementById('mgr-cta-btn');
  if (m) m.hidden = !(DATA && DATA.clusters[activeCluster] && DATA.clusters[activeCluster].tier === 'high');
}

function renderActiveTask() {
  const c = DATA.clusters[activeCluster];
  $('#tb-emoji').textContent = c.emoji;
  $('#tb-label').textContent = c.label;
}

// плейсхолдеры до прихода map_data.json — без пустого тёмного экрана в WebView
function renderSkeleton() {
  const te = $('#tb-emoji'); if (te) te.textContent = '⏳';
  const tl = $('#tb-label'); if (tl) tl.textContent = 'Загрузка…';
  const lk = $('#list-kicker'); if (lk) lk.textContent = 'Подбираем направления…';
  const cv = $('#map-canvas'); if (cv) cv.innerHTML = '<div class="map-skel"></div>';
  const cl = $('#country-list');
  if (cl) cl.innerHTML = Array.from({ length: 4 }, () =>
    '<div class="country-card skel"><span class="skel-flag"></span><span class="cc-body"><span class="skel-line w60"></span><span class="skel-line w90"></span></span></div>').join('');
}

function renderGlobalPlate() {
  const c = DATA.clusters[activeCluster];
  const el = $('#map-global');
  if (c.global) {
    const n = c.iso_list.length;
    const txt = n ? `🌐 Работает из любой страны · ${n} ${plural(n, 'направление', 'направления', 'направлений')}`
                  : '🌐 Доступно из любой страны';
    el.innerHTML = `<span>${esc(txt)}</span><span class="mg-go">→</span>`;
    el.hidden = false;
  } else { el.hidden = true; }
}

function renderCountryList() {
  const c = DATA.clusters[activeCluster];
  const n = c.iso_list.length;
  $('#list-kicker').textContent = `Что доступно · ${c.emoji} ${c.label} · ${n} ${plural(n, 'страна', 'страны', 'стран')}`;
  // частота канон-фраз по кластеру → карточка ведёт уникализирующей фразой (различает близкие страны)
  const freq = {};
  c.iso_list.forEach((iso) => (c.countries[iso].services || []).forEach((s) => { freq[s] = (freq[s] || 0) + 1; }));
  $('#country-list').innerHTML = c.iso_list.map((iso) => {
    const co = c.countries[iso];
    const badge = co.n >= 2 ? `<span class="cc-count">${variantsLabel(co.n)}</span>` : '';
    return `<button class="country-card" data-iso="${esc(iso)}">
      <img class="flag-img" src="${flag(iso, 40)}" alt="" loading="lazy">
      <span class="cc-body">
        <span class="cc-top"><span class="cc-name">${esc(co.name)}</span>${badge}</span>
        <span class="cc-svc">${esc(cardServiceLine(c, co, freq))}</span>
      </span>
      <span class="cc-go">›</span>
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
  canvas.innerHTML = '';   // destroy() не всегда чистит контейнер → иначе SVG кластеров копятся (union подсветок)
  const active = new Set(DATA.clusters[activeCluster].iso_list);
  const values = {}; active.forEach((iso) => (values[iso] = 'active'));
  prevActive = active;
  try {
    map = new JVM({
      selector: '#map-canvas',
      map: 'world_merc',
      // крупная ИНТЕРАКТИВНАЯ карта: зум кнопками/колесом/пинчем + перетаскивание (доехать до мелких стран на зуме)
      zoomButtons: true, zoomOnScroll: true, draggable: true, bindTouchEvents: true,
      zoomMax: 9, zoomMin: 1, zoomStep: 1.7,
      showTooltip: true, backgroundColor: 'transparent',
      regionStyle: {
        initial: { fill: PAL.land, stroke: PAL.stroke, strokeWidth: 0.5 },
        hover: { fillOpacity: 1, fill: PAL.hover, cursor: 'pointer' },
      },
      // подписи: ТОЛЬКО активные (жёлтые) страны кластера; позиция = центр bbox + оффсет (US: от Аляски к материку);
      // прогресс по размеру (мелкие появляются на бóльшем зуме) — в updateLabelProgressive(scale).
      labels: { regions: {
        render: (code) => { const c = DATA.clusters[activeCluster]; return (c && c.countries[code]) ? c.countries[code].name : ''; },
        offsets: (code) => LABEL_OFFSETS[code] || [0, 0],
      } },
      regionLabelStyle: { initial: { fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fill: '#f6efe0' } },
      series: { regions: [{ attribute: 'fill', scale: { active: PAL.active, off: PAL.land, sel: PAL.selected }, values }] },
      // имя страны по тапу/наведению + статус доступа
      onRegionTooltipShow: (e, tooltip, code) => {
        const co = DATA.clusters[activeCluster].countries[code];
        const nm = co ? co.name : isoName(code);
        tooltip.text(co ? `${nm} · есть доступ` : nm, false);
      },
      onRegionClick: (e, code) => { haptic('light'); openCountrySheet(code); },
      onViewportChange: (scale) => updateLabelProgressive(scale),
    });
    measureLabels();             // размеры активных стран (для порога появления подписи)
    updateLabelProgressive(1);   // старт: видны только крупные страны
  } catch (err) {
    console.warn('[map] init failed', err);
    canvas.innerHTML = `<div class="map-fallback">Карта не загрузилась — выбирай страну из списка ниже 👇</div>`;
    map = null; return;
  }
}

function rebuildMap() {
  if (map) { try { map.destroy(); } catch {} map = null; }
  initMap();
}

// перекраска подсветки под новый кластер БЕЗ пересоздания карты (иначе теряются подписи) — setValues union(prev,active)
function paintCluster() {
  if (!map) { rebuildMap(); return; }
  const active = new Set(DATA.clusters[activeCluster].iso_list);
  const union = new Set([...prevActive, ...active]);
  const v = {};
  union.forEach((iso) => (v[iso] = active.has(iso) ? 'active' : 'off'));
  try { map.series.regions[0].setValues(v); }
  catch (err) { console.warn('[map] setValues failed → rebuild', err); rebuildMap(); }
  prevActive = active;
}

// центр bbox уезжает у стран с дальними территориями → ручной сдвиг к основной части (map-units)
// у США bbox растянут на всю карту (Аляска/Алеуты через антимеридиан) → центр в Атлантике; сдвигаем на материк
const LABEL_OFFSETS = { US: [-260, -26] };
let labelSizes = {};                      // code → min(bbox.w, bbox.h) активных стран
const LABEL_SHOW = 70;                    // подпись видна, когда minDim*scale ≥ этого (мелкие — на бóльшем зуме)

function measureLabels() {
  labelSizes = {};
  if (!map || !map.regions || !DATA.clusters[activeCluster]) return;
  for (const code of DATA.clusters[activeCluster].iso_list) {
    const reg = map.regions[code];
    if (reg && reg.element && reg.element.shape) {
      try { const bb = reg.element.shape.getBBox(); labelSizes[code] = Math.min(bb.width, bb.height); } catch {}
    }
  }
}
// per-country видимость: крупная страна показывает имя раньше, мелкая — только когда достаточно увеличена
function updateLabelProgressive(scale) {
  if (!map || !map.regions) return;
  const s = scale || 1;
  if (s > 1.15) { const h = document.getElementById('map-hint'); if (h) h.style.opacity = '0'; }  // подсказка не мешает подписям при зуме
  for (const code in labelSizes) {
    const reg = map.regions[code];
    const node = reg && reg.element && reg.element.label && reg.element.label.node;
    if (node) node.style.opacity = (labelSizes[code] * s >= LABEL_SHOW) ? '1' : '0';
  }
}

function setMapSelected(iso) {
  if (!map) return;
  const v = {};
  if (selectedISO && DATA.clusters[activeCluster].countries[selectedISO]) v[selectedISO] = 'active';
  if (iso && DATA.clusters[activeCluster].countries[iso]) v[iso] = 'sel';
  if (Object.keys(v).length) { try { map.series.regions[0].setValues(v); } catch {} }
}

/* ───────────────────────────────────────────────── sheet infra ────────── */
function ensureScrim() {
  let scrim = $('#sheet-scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'sheet-scrim'; scrim.id = 'sheet-scrim'; scrim.hidden = true;
    document.body.appendChild(scrim);
    scrim.addEventListener('click', closeSheet);
  }
  return scrim;
}

function attachSwipeClose(sheet) {
  if (sheet._swipeBound) return;
  sheet._swipeBound = true;
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
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

function ensureSheet(id) {
  let sheet = document.getElementById(id);
  if (!sheet) {
    sheet = document.createElement('aside');
    sheet.className = 'app-sheet'; sheet.id = id; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
    attachSwipeClose(sheet);
  }
  return sheet;
}

function showSheet(sheet) {
  const scrim = ensureScrim();
  scrim.hidden = false;
  sheet.hidden = false; sheet.classList.remove('closing'); sheet.style.transform = '';
  sheet.scrollTop = 0;
  currentSheet = sheet;
}

function closeSheet() {
  const sheet = currentSheet;
  const scrim = $('#sheet-scrim');
  if (!sheet || sheet.hidden) return;
  sheet.classList.add('closing');
  if (scrim) scrim.hidden = true;
  const done = () => {
    sheet.hidden = true; sheet.classList.remove('closing'); sheet.style.transform = '';
    sheet.removeEventListener('animationend', done); clearTimeout(fallback);
  };
  // fallback-таймер: при prefers-reduced-motion animationend не стрельнёт
  const fallback = setTimeout(done, 320);
  sheet.addEventListener('animationend', done);
  if (sheet.id === 'country-sheet' && selectedISO) setMapSelected(null);
  currentSheet = null;
}

/* ───────────────────────────────────────────────── task picker ────────── */
function openTaskPicker() {
  if (!DATA) return;
  const sheet = ensureSheet('task-sheet');
  const order = DATA.meta.cluster_order;
  const high = order.filter((cl) => DATA.clusters[cl].tier === 'high');
  const low = order.filter((cl) => DATA.clusters[cl].tier !== 'high');

  const row = (cl) => {
    const c = DATA.clusters[cl];
    const on = cl === activeCluster ? ' is-active' : '';
    const dot = c.tier === 'high' ? '<span class="tr-dot"></span>' : '';
    return `<button class="task-row${on}" data-cluster="${esc(cl)}">
      <span class="tr-emoji">${esc(c.emoji)}</span>
      <span class="tr-text"><span class="tr-label">${esc(c.label)}</span><span class="tr-blurb">${esc(c.blurb)}</span></span>
      ${dot}${on ? '<span class="tr-check">✓</span>' : ''}
    </button>`;
  };

  sheet.innerHTML = `
    <div class="sheet-grab"></div>
    <header class="picker-head">
      <h3>Что вам нужно за рубежом?</h3>
      <button class="sheet-close" aria-label="Закрыть">✕</button>
    </header>
    <div class="picker-group">
      <span class="picker-kicker">Ради этого чаще всего едут</span>
      ${high.map(row).join('')}
    </div>
    <div class="picker-group">
      <span class="picker-kicker">Остальное</span>
      ${low.map(row).join('')}
    </div>
  `;

  sheet.querySelector('.sheet-close')?.addEventListener('click', closeSheet);
  sheet.querySelectorAll('.task-row').forEach((b) => {
    b.addEventListener('click', () => {
      haptic('select');
      selectCluster(b.dataset.cluster);
      closeSheet();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    });
  });

  showSheet(sheet);
}

/* ───────────────────────────────────────────────── country teaser ─────── */
function openCountrySheet(iso) {
  if (!DATA) return;
  // режим «смены страны» из флоу менеджера: тап страны кормит флоу, а не открывает тизер
  if (window.GZH && window.GZH.awaitCountry) { const f = window.GZH.awaitCountry; window.GZH.awaitCountry = null; f(iso); return; }
  const sheet = ensureSheet('country-sheet');
  const c = DATA.clusters[activeCluster];
  const co = c.countries[iso];

  const hint = $('#map-hint'); if (hint) hint.style.opacity = '0';

  if (co) {
    // активная страна — полный тизер: services (или кластерные bullets) + факт + 🔒 + CTA
    selectedISO = iso; setMapSelected(iso);
    const items = (co.services && co.services.length) ? co.services : c.bullets;
    const factHtml = co.fact ? `<p class="sheet-fact">${esc(co.fact)}</p>` : '';
    const cntHtml = co.n >= 2 ? `<span class="sheet-count">${esc(variantsLabel(co.n))} доступа</span>` : '';
    sheet.innerHTML = `
      <div class="sheet-grab"></div>
      <header class="sheet-head">
        <img class="flag-img" src="${flag(iso, 80)}" alt="">
        <div class="sheet-id">
          <h3 class="sheet-name">${esc(co.name)}</h3>
          <span class="sheet-cluster">${esc(c.emoji)} ${esc(c.label)}</span>
        </div>
        <button class="sheet-close" aria-label="Закрыть">✕</button>
      </header>
      ${cntHtml}
      <ul class="sheet-bullets">${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      ${factHtml}
      <div class="sheet-locked">
        <span class="lk-ico">🔒</span>
        <span>Сроки, стоимость и как именно в твоём случае — на консультации.</span>
      </div>
      <button class="btn btn-gold sheet-cta" data-link="${botLink(activeCluster, iso)}">Проверить мой случай — бесплатно →</button>
    `;
  } else {
    // серая страна — нет прямого доступа по задаче → конверт промаха в бота
    selectedISO = null;
    sheet.innerHTML = `
      <div class="sheet-grab"></div>
      <header class="sheet-head">
        <img class="flag-img" src="${flag(iso, 80)}" alt="">
        <div class="sheet-id">
          <h3 class="sheet-name">${esc(isoName(iso))}</h3>
          <span class="sheet-cluster">${esc(c.emoji)} ${esc(c.label)}</span>
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
  sheet.querySelector('#sheet-change')?.addEventListener('click', () => { closeSheet(); openTaskPicker(); });

  showSheet(sheet);
}

function isoName(iso) {
  for (const cl of DATA.meta.cluster_order) {
    const co = DATA.clusters[cl].countries[iso];
    if (co) return co.name;
  }
  return iso;
}

/* ───────────────────────────────────────────────── boot ───────────────── */
async function boot() {
  applyTheme();
  readPalette();
  try { tg.ready(); tg.expand(); } catch {}
  try {
    if (atLeast('6.1')) { tg.setHeaderColor('#0a0c10'); tg.setBackgroundColor('#0a0c10'); }
    if (atLeast('7.7')) tg.disableVerticalSwipes(); // карта/жесты не закрывают апку свайпом
  } catch {}
  try { tg.onEvent('themeChanged', () => { applyTheme(); readPalette(); }); } catch {}

  // iOS: не дать TG перехватить свайп как «закрыть» при scrollTop=0
  try {
    document.documentElement.style.setProperty('min-height', 'calc(100% + 1px)');
    window.addEventListener('scroll', () => { if (window.scrollY === 0) window.scrollTo(0, 1); }, { passive: true });
  } catch {}

  renderShell();
  renderSkeleton();   // плейсхолдеры ДО fetch — без пустого тёмного экрана

  try {
    const res = await fetch('./map_data.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (err) {
    $('#app').innerHTML = `<div class="empty-note">Не удалось загрузить карту. Обнови страницу.</div>`;
    console.error('[map_data] load failed', err); return;
  }

  // вернувшийся юзер → его задача (picker не открываем); первый холодный вход → дефолт + picker
  const saved = (() => { try { return localStorage.getItem('gzh_task'); } catch { return null; } })();
  if (saved && DATA.clusters[saved]) activeCluster = saved;
  else if (!DATA.clusters[activeCluster]) activeCluster = DATA.meta.cluster_order[0];

  renderActiveTask();
  initMap();
  renderCountryList();
  renderGlobalPlate();
  syncMgrBtn();

  if (!saved) openTaskPicker();   // гейт ПОСЛЕ выбора — только для первого входа
}

// мост для manager-flow.js (МОК-прототип флоу «Связаться с менеджером»; активен только за флагом managerflow)
window.GZH = {
  cfg: { flag: MANAGER_FLOW, baseUrl: 'MOCK', bot: BOT_USERNAME },
  get cluster() { return activeCluster; },
  get iso() { return selectedISO; },
  set iso(v) { selectedISO = v; },
  data: () => DATA,
  selectCluster, openTaskPicker,
  setCountry(iso) { selectedISO = iso; setMapSelected(iso); },
  botLink, openTgLink, haptic, toast, esc, plural, flag, atLeast,
  ensureSheet, showSheet, closeSheet,
  isTelegram, tg,
  awaitCountry: null,
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
