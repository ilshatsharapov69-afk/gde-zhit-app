/* ════════════════════════════════════════════════════════════════════════
   ГДЕ ЖИТЬ — Telegram Mini App · entry point
   ────────────────────────────────────────────────────────────────────────
   ▶ PHASE 2 SWITCH — when Session 1 publishes RAILWAY_URL in
     gde-zhit-funnel/CONTRACT.md, replace the line below with that URL:
        export const BASE_URL = 'https://<railway>.up.railway.app';
     Leaving it as 'MOCK' keeps the app running on bundled fixtures
     (./mock/mock_app_data.json) — fully demo-able with no backend.
   ════════════════════════════════════════════════════════════════════════ */
export const BASE_URL = 'MOCK';

const _params = new URLSearchParams(location.search);
export const MOCK = BASE_URL === 'MOCK' || _params.has('mock');
// ?mock=empty → demo the "no result yet" fallback screen; default → hot витрина
export const MOCK_RESULT_KEY = _params.get('mock') === 'empty' ? 'result_empty' : 'result_hot';

export const BOT_USERNAME     = 'gde_zhit_YT_bot';   // Session 1 confirms in CONTRACT.md
export const CHANNEL_USERNAME = 'gde_zhit_YT';        // @gde_zhit_YT (id -1001415223550)

// Partner links — empty in Phase 1 → CTA falls back to "write to bot". Fill later.
export const PARTNERS = Object.freeze({
  courses:   '',
  recruiter: '',
  credit:    '',
  visa:      '',
  residence: '',
  birth:     '',
  business:  '',
});

import { render as renderResult }    from './views/result.js';
import { render as renderCountries } from './views/countries.js';
import { render as renderCalc }      from './views/calc.js';
import { render as renderReport }    from './views/report.js';
import { track, EVENTS }             from './api.js';

/* ───────────────────────────────────────────────── Telegram bridge ────── */
const _realTg = window.Telegram && window.Telegram.WebApp;
export const isTelegram = !!(_realTg && _realTg.initData);

// MOCK stub so the app renders outside Telegram (Pages preview / Playwright / file://)
const MOCK_TG = {
  initData: '',
  initDataUnsafe: {},
  version: '6.0',
  colorScheme: 'dark',
  themeParams: {},
  isExpanded: true,
  ready() {}, expand() {}, close() {},
  onEvent() {}, offEvent() {},
  setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {},
  isVersionAtLeast() { return false; },
  openLink(url) { window.open(url, '_blank', 'noopener'); },
  openTelegramLink(url) { window.open(url, '_blank', 'noopener'); },
  HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
  BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
  MainButton: {
    setText() { return this; }, show() { return this; }, hide() { return this; },
    onClick() { return this; }, offClick() { return this; },
    setParams() { return this; }, enable() { return this; }, disable() { return this; },
  },
};

const _tg = _realTg || MOCK_TG;
export function getTg() { return _tg; }

function atLeast(v) {
  try { return _tg.isVersionAtLeast && _tg.isVersionAtLeast(v); } catch { return false; }
}

export function haptic(kind = 'light') {
  if (!atLeast('6.1')) return; // HapticFeedback unsupported pre-6.1 (and outside Telegram)
  try {
    const h = _tg.HapticFeedback;
    if (!h) return;
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind); // light | medium | heavy | rigid | soft
  } catch { /* desktop: silently ignored */ }
}

export function openTgLink(url) {
  // Outside a real Telegram session, open in a normal browser tab.
  if (!isTelegram) { window.open(url, '_blank', 'noopener'); return; }
  // openTelegramLink <7.0 closes the app on some clients; openLink is safer there.
  try {
    if (atLeast('7.0')) _tg.openTelegramLink(url);
    else _tg.openLink(url);
  } catch { window.open(url, '_blank', 'noopener'); }
}
export function openExtLink(url) {
  if (!isTelegram) { window.open(url, '_blank', 'noopener'); return; }
  try { _tg.openLink(url); } catch { window.open(url, '_blank', 'noopener'); }
}

/* ───────────────────────────────────────────────── theme handling ────── */
const THEME_KEYS = [
  'bg_color', 'text_color', 'hint_color', 'link_color', 'button_color',
  'button_text_color', 'secondary_bg_color', 'section_bg_color',
  'header_bg_color', 'accent_text_color', 'subtitle_text_color', 'destructive_text_color',
];
function applyTheme() {
  const tp = _tg.themeParams || {};
  const root = document.documentElement.style;
  for (const k of THEME_KEYS) {
    if (tp[k]) root.setProperty('--tg-theme-' + k.replace(/_/g, '-'), tp[k]);
  }
  document.documentElement.dataset.scheme = _tg.colorScheme || 'dark';
}

/* ───────────────────────────────────────────────── clipboard + toast ─── */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

let _toastTimer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'toast'; el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.remove(), 1900);
}

/* ───────────────────────────────────────────────── router ─────────────── */
const ROUTES = {
  result:    { render: renderResult,    tab: 'result' },
  countries: { render: renderCountries, tab: 'countries' },
  calc:      { render: renderCalc,      tab: 'calc' },
  report:    { render: renderReport,    tab: 'report' },
};
const DEFAULT_ROUTE = 'result';
const app = () => document.getElementById('app');

export function go(name) {
  if (location.hash.slice(1) === name) { mount(name); return; }
  location.hash = name;
}

let _current = null;
function mount(name) {
  const route = ROUTES[name] || ROUTES[DEFAULT_ROUTE];
  _current = name;
  const root = app();
  root.innerHTML = '';
  window.scrollTo(0, 0);
  setActiveTab(route.tab);
  try {
    route.render(root);
  } catch (e) {
    console.error('[view error]', name, e);
    root.innerHTML = '<div class="empty-note">Что-то пошло не так. Откройте заново.</div>';
  }
}

function onHashChange() {
  const name = (location.hash.slice(1) || DEFAULT_ROUTE).replace(/^\/?/, '');
  mount(ROUTES[name] ? name : DEFAULT_ROUTE);
}

/* ───────────────────────────────────────────────── tab bar ────────────── */
const TABS = [
  { id: 'result',    icon: '🧭', label: 'Подбор' },
  { id: 'countries', icon: '🗂', label: 'Страны' },
  { id: 'calc',      icon: '✈️', label: 'Билеты' },
  { id: 'report',    icon: '📄', label: 'Отчёт' },
];
function buildTabbar() {
  const bar = document.createElement('nav');
  bar.className = 'tabbar'; bar.id = 'tabbar';
  bar.innerHTML = TABS.map((t) => `
    <button class="tab" data-tab="${t.id}" aria-label="${t.label}">
      <span class="ti">${t.icon}</span><span class="tl">${t.label}</span>
    </button>`).join('');
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    haptic('select');
    go(btn.dataset.tab);
  });
  document.body.appendChild(bar);
}
function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
}

/* ───────────────────────────────────────────────── boot ───────────────── */
function boot() {
  applyTheme();
  try { _tg.ready(); _tg.expand(); } catch { /* noop */ }
  // brand ink-navy chrome (version-gated; harmless no-op on old/mock)
  try {
    if (atLeast('6.1')) { _tg.setHeaderColor('#0a0c10'); _tg.setBackgroundColor('#0a0c10'); }
  } catch { /* noop */ }
  try { _tg.onEvent('themeChanged', applyTheme); } catch { /* noop */ }

  buildTabbar();
  window.addEventListener('hashchange', onHashChange);
  track(EVENTS.OPEN, { tg: isTelegram });

  if (!location.hash) location.hash = DEFAULT_ROUTE;
  else onHashChange();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
