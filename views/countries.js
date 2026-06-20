// views/countries.js — all countries menu (retention): tier-band filter + sort.
import { haptic } from '../main.js';
import { getCountries, track, EVENTS } from '../api.js';
import { renderCountryCard, scoreBand } from './result.js';

const CACHE = 'gdezhit:countries:v1';
const TTL = 24 * 3600 * 1000;

const FILTERS = [
  { id: 'all',  label: 'Все' },
  { id: 'hot',  label: '🔥 Лёгкий' },
  { id: 'warm', label: '🌡 Средний' },
  { id: 'cold', label: '❄️ Сложный' },
];
const SORTS = [
  { id: 'score',  label: 'по баллу' },
  { id: 'budget', label: 'по бюджету' },
  { id: 'visa',   label: 'по визе' },
];

const lowBudget = (s) => {
  const m = String(s || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 99999;
};

let _state = { filter: 'all', sort: 'score' };

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (raw && Date.now() - raw.t < TTL && Array.isArray(raw.c)) return raw.c;
  } catch { /* noop */ }
  return null;
}
function writeCache(countries) {
  try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), c: countries })); } catch { /* noop */ }
}

export function render(root) {
  track(EVENTS.VIEW_COUNTRIES);

  const head = document.createElement('div');
  head.className = 'view-head';
  head.innerHTML = `<span class="kicker">База стран · 2026</span><h1>Куда можно уехать</h1>
    <p>Реальные правила въезда, банки и риски — обновляется по изменениям 2026 года.</p>`;
  root.appendChild(head);

  // filter / sort bar
  const bar = document.createElement('div');
  bar.className = 'filterbar';
  bar.innerHTML = `
    <div class="seg-control" id="filters">
      <span class="seg-thumb"></span>
      ${FILTERS.map((f, i) => `<button data-f="${f.id}" class="${i === 0 ? 'active' : ''}">${f.label}</button>`).join('')}
    </div>
    <div class="sort-row">
      <span class="lbl">Сортировка</span>
      <div class="sort-pills">
        ${SORTS.map((s, i) => `<button class="sort-pill ${i === 0 ? 'active' : ''}" data-s="${s.id}">${s.label}</button>`).join('')}
      </div>
    </div>`;
  root.appendChild(bar);

  const count = document.createElement('div');
  count.className = 'list-count';
  root.appendChild(count);

  const list = document.createElement('div');
  list.id = 'country-list';
  root.appendChild(list);

  let all = readCache();
  if (all) {
    paint(list, count, all);
  } else {
    [0, 80, 160].forEach((d) => list.appendChild(skel(d)));
  }

  getCountries().then((res) => {
    all = (res && res.countries) || all || [];
    if (res && res.countries) writeCache(res.countries);
    paint(list, count, all);
  });

  // thumb positioning
  const seg = bar.querySelector('.seg-control');
  const thumb = bar.querySelector('.seg-thumb');
  function moveThumb() {
    const btns = [...seg.querySelectorAll('button')];
    const idx = btns.findIndex((b) => b.dataset.f === _state.filter);
    const w = 100 / btns.length;
    thumb.style.width = `calc(${w}% - 3px)`;
    thumb.style.transform = `translateX(calc(${idx * 100}% + ${idx ? 3 : 3}px))`;
  }
  requestAnimationFrame(moveThumb);

  bar.addEventListener('click', (e) => {
    const fb = e.target.closest('[data-f]');
    const sb = e.target.closest('[data-s]');
    if (fb) {
      _state.filter = fb.dataset.f;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === fb));
      moveThumb(); haptic('select'); paint(list, count, all);
    } else if (sb) {
      _state.sort = sb.dataset.s;
      bar.querySelectorAll('.sort-pill').forEach((b) => b.classList.toggle('active', b === sb));
      haptic('select'); paint(list, count, all);
    }
  });
}

function paint(list, count, all) {
  if (!all || !all.length) { list.innerHTML = `<div class="empty-note">Список стран недоступен.</div>`; count.textContent = ''; return; }
  let rows = all.filter((c) => _state.filter === 'all' || scoreBand(c.fit_score).key === _state.filter);

  if (_state.sort === 'score') rows.sort((a, b) => b.fit_score - a.fit_score);
  else if (_state.sort === 'budget') rows.sort((a, b) => lowBudget(a.budget_month_usd) - lowBudget(b.budget_month_usd));
  else if (_state.sort === 'visa') rows.sort((a, b) => (b.visa_free_days || 0) - (a.visa_free_days || 0));

  count.textContent = `${rows.length} ${plural(rows.length)}`;
  list.innerHTML = '';
  if (!rows.length) { list.innerHTML = `<div class="empty-note">Нет стран в этой категории.</div>`; return; }
  rows.forEach((c, i) => list.appendChild(renderCountryCard(c, { delay: Math.min(i, 6) * 50 })));
}

function plural(n) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'страна';
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'страны';
  return 'стран';
}

function skel(delay) {
  const el = document.createElement('article');
  el.className = 'plate skel';
  el.style.animationDelay = delay + 'ms';
  el.innerHTML = `<div class="card-top"><span class="sk-bar sk-flag"></span>
    <div class="card-id" style="flex:1"><span class="sk-bar sk-title"></span></div>
    <span class="sk-bar sk-circ"></span></div>
    <div class="chips"><span class="sk-bar sk-chip"></span><span class="sk-bar sk-chip"></span></div>`;
  return el;
}
