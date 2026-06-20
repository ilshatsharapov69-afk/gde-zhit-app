// views/calc.js — переезд calculator: from/to/date → /api/calc → price + promo + deep_link.
import { haptic, openExtLink, copyText, toast } from '../main.js';
import { getCalc, track, EVENTS } from '../api.js';

const ORIGINS = [
  ['MOW', 'Москва'], ['LED', 'Санкт-Петербург'], ['SVX', 'Екатеринбург'],
  ['OVB', 'Новосибирск'], ['KZN', 'Казань'], ['AER', 'Сочи'],
];
const DESTS = [
  ['TBS', 'Тбилиси · Грузия'], ['EVN', 'Ереван · Армения'], ['BEG', 'Белград · Сербия'],
  ['ALA', 'Алматы · Казахстан'], ['TAS', 'Ташкент · Узбекистан'], ['BKK', 'Бангкок · Таиланд'],
  ['HAN', 'Ханой · Вьетнам'], ['ASU', 'Асунсьон · Парагвай'], ['KUL', 'Куала-Лумпур · Малайзия'],
  ['GRU', 'Сан-Паулу · Бразилия'], ['MNL', 'Манила · Филиппины'], ['TGD', 'Подгорица · Черногория'],
  ['EZE', 'Буэнос-Айрес · Аргентина'], ['DPS', 'Денпасар · Бали'], ['PTY', 'Панама'],
  ['LCA', 'Ларнака · Кипр'], ['DXB', 'Дубай · ОАЭ'], ['MEX', 'Мехико · Мексика'],
  ['TLV', 'Тель-Авив · Израиль'], ['IST', 'Стамбул · Турция'],
];
const CODE_IATA = {
  georgia: 'TBS', armenia: 'EVN', serbia: 'BEG', kazakhstan: 'ALA', uzbekistan: 'TAS',
  thailand: 'BKK', vietnam: 'HAN', paraguay: 'ASU', malaysia: 'KUL', brazil: 'GRU',
  philippines: 'MNL', montenegro: 'TGD', argentina: 'EZE', bali: 'DPS', panama: 'PTY',
  cyprus: 'LCA', uae: 'DXB', mexico: 'MEX', israel: 'TLV', turkey: 'IST',
};

function defaultDest() {
  try {
    const r = JSON.parse(localStorage.getItem('gdezhit:result:v1') || 'null');
    const top = r && r.top_countries && r.top_countries[0];
    if (top && CODE_IATA[top.code]) return CODE_IATA[top.code];
  } catch { /* noop */ }
  return 'TBS';
}
function plusDaysISO(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
const labelOf = (list, code) => (list.find((x) => x[0] === code) || [code, code])[1];

export function render(root) {
  track(EVENTS.OPEN_CALC);
  const toDefault = defaultDest();

  const head = document.createElement('div');
  head.className = 'view-head';
  head.innerHTML = `<span class="kicker">Калькулятор переезда</span><h1>Билеты в один конец</h1>
    <p>Живые цены и промокод на перелёт в выбранную страну.</p>`;
  root.appendChild(head);

  const form = document.createElement('div');
  form.className = 'form-card';
  form.innerHTML = `
    <div class="freshness">цены этого месяца · проверьте дату</div>
    <div class="field sel">
      <label>Откуда</label>
      <select id="from">${ORIGINS.map(([c, n]) => `<option value="${c}" ${c === 'MOW' ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="field sel">
      <label>Куда</label>
      <select id="to">${DESTS.map(([c, n]) => `<option value="${c}" ${c === toDefault ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Когда</label>
      <input type="date" id="depart" value="${plusDaysISO(14)}" min="${todayISO()}" />
    </div>
    <button class="btn btn-gold" id="calc-go">Посчитать перелёт</button>`;
  root.appendChild(form);

  const result = document.createElement('div');
  result.id = 'calc-result';
  root.appendChild(result);

  form.querySelector('#calc-go').addEventListener('click', () => {
    const from = form.querySelector('#from').value;
    const to = form.querySelector('#to').value;
    const depart = form.querySelector('#depart').value || plusDaysISO(14);
    haptic('medium');
    track(EVENTS.CALC_QUERY, { from, to, depart });
    submit(result, { from, to, depart });
  });
}

function submit(result, q) {
  result.innerHTML = `<div class="price-block skel"><span class="sk-bar sk-line" style="display:block;height:38px;width:60%"></span></div>`;
  getCalc(q).then((res) => {
    if (!res || res.ok === false) {
      result.innerHTML = `<div class="calc-error">Цены временно недоступны, попробуйте позже.</div>`;
      haptic('error');
      return;
    }
    const cur = res.currency === 'USD' ? '$' : (res.currency || '');
    const route = `${labelOf(ORIGINS, q.from)} → ${labelOf(DESTS, q.to)} · ${q.depart}`;
    result.innerHTML = `
      <div class="price-block">
        <div class="route">${route}</div>
        <div class="price-big">от ${cur}${res.price_usd}<small> в одну сторону</small></div>
        ${res.promo ? `<div class="promo-chip" id="promo">Промокод: <span class="code">${res.promo}</span><span class="copy">копировать</span></div>` : ''}
        <button class="btn btn-gold" id="buy" style="margin-top:16px">Найти билет</button>
      </div>`;
    haptic('success');

    const promo = result.querySelector('#promo');
    if (promo) promo.addEventListener('click', async () => {
      const ok = await copyText(res.promo);
      toast(ok ? 'Промокод скопирован' : res.promo);
      haptic('light');
    });
    result.querySelector('#buy').addEventListener('click', () => {
      track(EVENTS.CLICK_CALC_BUY, { to: q.to });
      haptic('medium');
      // deep_link is opaque (may carry TP_MARKER in mock) — never parse/rewrite client-side
      openExtLink(res.deep_link || 'https://www.aviasales.ru/');
    });
  });
}
