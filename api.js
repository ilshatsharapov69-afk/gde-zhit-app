// api.js — single fetch layer. MOCK mode and LIVE mode share one code path;
// only BASE_URL / source differs. Every request carries Authorization: "tma <initData>".
import { BASE_URL, MOCK, MOCK_RESULT_KEY, getTg } from './main.js';

export const EVENTS = Object.freeze({
  OPEN:               'open',
  VIEW_RESULT:        'view_result',
  VIEW_COUNTRIES:     'view_countries',
  OPEN_CALC:          'open_calc',
  CALC_QUERY:         'calc_query',
  CLICK_SEGMENT_CTA:  'click_segment_cta',
  SHARE_REPORT:       'share_report',
  FALLBACK_SHOWN:     'fallback_shown',
  OPEN_COUNTRY:       'open_country',
  CLICK_CALC_BUY:     'click_calc_buy',
});

// ---------------------------------------------------------------- mock data
let _mockPromise = null;
function loadMock() {
  if (!_mockPromise) {
    _mockPromise = fetch('./mock/mock_app_data.json')
      .then((r) => r.json())
      .catch(() => ({ result_empty: { ok: true, has_result: false } }));
  }
  return _mockPromise;
}

// ---------------------------------------------------------------- core fetch
function authHeaders(extra) {
  const tg = getTg();
  return Object.assign(
    { Authorization: 'tma ' + (tg?.initData || '') },
    extra || {}
  );
}

async function apiGet(path) {
  const res = await fetch(BASE_URL + path, { headers: authHeaders() });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ---------------------------------------------------------------- endpoints
export async function getResult() {
  if (MOCK) {
    const m = await loadMock();
    return m[MOCK_RESULT_KEY] || m.result_hot || { ok: true, has_result: false };
  }
  try {
    const { status, body } = await apiGet('/api/result');
    // 401 (no/invalid session) is indistinguishable from "no quiz yet" for the user.
    if (status === 401) return { ok: true, has_result: false };
    return body;
  } catch {
    return { ok: true, has_result: false };
  }
}

export async function getCountries() {
  if (MOCK) {
    const m = await loadMock();
    return m.countries || { ok: true, countries: [] };
  }
  try {
    const { status, body } = await apiGet('/api/countries');
    if (status === 401) return { ok: true, countries: [] };
    return body;
  } catch {
    return { ok: false, countries: [] };
  }
}

export async function getCalc({ from, to, depart }) {
  if (MOCK) {
    const m = await loadMock();
    return m.calc_example || { ok: false };
  }
  try {
    const qs = new URLSearchParams({ from, to, depart }).toString();
    const { status, body } = await apiGet('/api/calc?' + qs);
    if (status >= 400) return { ok: false };
    return body;
  } catch {
    return { ok: false };
  }
}

export async function postAuth() {
  if (MOCK) return { ok: true, user: { id: 0, first_name: 'Demo' } };
  try {
    const res = await fetch(BASE_URL + '/api/auth', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------- telemetry
const _fired = new Set();
const _once = new Set([EVENTS.OPEN, EVENTS.VIEW_RESULT, EVENTS.FALLBACK_SHOWN]);

export function track(type, payload) {
  if (_once.has(type)) {
    if (_fired.has(type)) return;
    _fired.add(type);
  }
  if (MOCK) {
    if (location.search.includes('debug')) console.info('[event]', type, payload || '');
    return;
  }
  // fire-and-forget; never block UI, swallow all errors
  try {
    fetch(BASE_URL + '/api/event', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type, payload: payload || {} }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* noop */ }
}
