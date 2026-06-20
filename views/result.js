// views/result.js — main витрина: tier header + country cards + segment CTAs,
// or the fallback screen when has_result:false. Owns the shared CountryCard.
import {
  go, haptic, openTgLink, openExtLink, getTg,
  BOT_USERNAME, CHANNEL_USERNAME, PARTNERS,
} from '../main.js';
import { getResult, track, EVENTS } from '../api.js';

const RESULT_CACHE = 'gdezhit:result:v1';

const TIERS = {
  hot:  { emoji: '🔥', label: 'Горячо',  cls: 'hot',
          verdict: 'Срочный переезд оправдан — ниже страны с самым простым входом прямо сейчас.' },
  warm: { emoji: '🌡', label: 'Тепло',   cls: 'warm',
          verdict: 'Есть запас времени — подобрали страны под спокойный, продуманный переезд.' },
  cold: { emoji: '❄️', label: 'Холодно', cls: 'cold',
          verdict: 'Вы на стадии планирования — вот страны, с которых стоит начать.' },
};
const BUDGET_BANDS = { none: 'без бюджета', low: 'низкий', mid: 'средний', high: 'высокий' };

// §4.5 segments → RU CTA. Direct @username специалиста НЕ даём — только бот / 3-сторонний чат (§10).
const SEGMENTS = {
  visa_specialist:   { label: 'Получить помощь с визой/ВНЖ',
    sub: 'Передам ваш запрос профильному специалисту по визам и ВНЖ — он свяжется и подскажет путь под вашу ситуацию.',
    kind: 'bot', start: 'seg_visa' },
  residence_program: { label: 'Подобрать программу ВНЖ/ПМЖ',
    sub: 'Свяжу со специалистом по резидентским программам: ИП, недвижимость, цифровой кочевник — под ваш бюджет.',
    kind: 'bot', start: 'seg_residence' },
  birth_tourism:     { label: 'Роды и право почвы за рубежом',
    sub: 'Передам запрос специалисту по родовому туризму — гражданство ребёнку и путь для родителей.',
    kind: 'bot', start: 'seg_birth' },
  business_visa:     { label: 'Открыть бизнес / бизнес-виза',
    sub: 'Свяжу со специалистом по бизнес-иммиграции — регистрация компании и виза под ваш профиль.',
    kind: 'bot', start: 'seg_business' },
  online_courses:    { label: 'Освоить удалённую профессию',
    sub: 'Школа удалёнки: зарабатывайте из любой страны. Подбор курса под новичка.',
    kind: 'partner', partner: 'courses', start: 'seg_courses' },
  recruiter:         { label: 'Найти работу за рубежом',
    sub: 'Легальный рекрутер: платит работодатель, не вы. Подберут вакансии с релокацией.',
    kind: 'partner', partner: 'recruiter', start: 'seg_recruiter' },
  consumer_credit:   { label: 'Деньги на старт переезда',
    sub: 'Специалист по потребкредитам поможет оформить обычный заём на переезд — берёте, чтобы вернуть, как любой кредит.',
    kind: 'partner', partner: 'credit', start: 'seg_credit' },
  tickets_travelpayouts: { label: 'Найти дешёвые билеты',
    sub: 'Откройте калькулятор перелёта: живые цены и промокод на билеты в выбранную страну.',
    kind: 'in_app' },
  channel_only:      { label: 'Подписаться на канал «Где Жить»',
    sub: 'Пока рано переезжать — подпишитесь: разборы стран, границы и срочные изменения 2026.',
    kind: 'channel' },
};

// ───────────────────────────────────────────── fit-score → band/color ────
export function scoreBand(score) {
  if (score >= 85) return { key: 'hot',  color: 'var(--gzh-tier-hot)' };
  if (score >= 70) return { key: 'warm', color: 'var(--gzh-tier-warm)' };
  return { key: 'cold', color: 'var(--gzh-tier-cold)' };
}

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Flag emoji → ISO-3166 alpha-2 (regional indicators), so we can render crisp SVG
// flags consistently everywhere (Windows/desktop don't render flag emoji as flags).
function emojiToISO2(flag) {
  const cp = [...String(flag || '')].map((c) => c.codePointAt(0));
  if (cp.length >= 2 && cp[0] >= 0x1f1e6 && cp[0] <= 0x1f1ff && cp[1] >= 0x1f1e6 && cp[1] <= 0x1f1ff) {
    return String.fromCharCode(cp[0] - 0x1f1e6 + 65, cp[1] - 0x1f1e6 + 65).toLowerCase();
  }
  return null;
}
export function flagMarkup(flagEmoji, cls = 'flag') {
  const iso = emojiToISO2(flagEmoji);
  const e = esc(flagEmoji);
  if (iso) {
    return `<img class="flag-img" src="https://flagcdn.com/w80/${iso}.png" srcset="https://flagcdn.com/w160/${iso}.png 2x" alt="${e}" loading="lazy"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls}',textContent:this.alt}))">`;
  }
  return `<span class="${cls}">${e}</span>`;
}

// ───────────────────────────────────────────── shared CountryCard ────────
let _cardSeq = 0;
export function renderCountryCard(card, opts = {}) {
  const { rank = 0, delay = 0 } = opts;
  const band = scoreBand(card.fit_score);
  const el = document.createElement('article');
  el.className = 'plate';
  el.style.animationDelay = delay + 'ms';
  el.dataset.open = 'false';
  el.dataset.code = card.code;

  const why = Array.isArray(card.why) ? card.why : [];
  const whyFirst = why[0] || '';
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const C = 150.8; // 2πr, r=24
  const sid = 'st' + (++_cardSeq);

  const rankBadge = rank ? `<span class="kicker" style="position:absolute;top:14px;right:46px;">№${rank}</span>` : '';

  el.innerHTML = `
    ${rankBadge}
    <div class="card-top">
      ${flagMarkup(card.flag_emoji)}
      <div class="card-id">
        <h2 class="card-name">${esc(card.name_ru)}</h2>
        <p class="card-headline">${esc(card.headline)}</p>
      </div>
      <div class="fitstamp" aria-label="балл соответствия ${card.fit_score}">
        <svg viewBox="0 0 56 56">
          <circle class="track" cx="28" cy="28" r="24" fill="none" stroke-width="4"></circle>
          <circle class="arc" id="${sid}" cx="28" cy="28" r="24" fill="none" stroke-width="4"
                  stroke="${band.color}" stroke-dasharray="${C}" stroke-dashoffset="${C}"></circle>
        </svg>
        <div class="num"><b data-target="${card.fit_score}">0</b><span>балл</span></div>
      </div>
    </div>

    <div class="chips">
      <span class="chip"><span class="ico">💵</span><span class="val">$${esc(card.budget_month_usd)}</span><span class="muted">/мес</span></span>
      <span class="chip visa"><span class="ico">🛂</span><span class="val">${esc(card.visa_pattern)}</span></span>
    </div>

    <div class="card-teaser">
      <div class="why-first">${esc(whyFirst)}</div>
      <div class="risk-line clamp"><span class="rk">⚠️</span><span class="rk-text">${esc(card.risk)}</span></div>
    </div>

    <div class="card-body"><div class="inner"><div class="body-pad">
      <ul class="why-list">${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
      <div class="dossier">
        <div class="drow"><span class="dlabel">Виза</span><span class="dval">${esc(card.visa_pattern)}</span></div>
        <div class="drow"><span class="dlabel">Безвиз</span><span class="dval mono">${card.visa_free_days} дн.</span></div>
        <div class="drow">
          <span class="dlabel">Карты</span>
          <span class="rail-pair">
            <span class="mark ${card.mir_works ? 'yes' : 'no'}">${card.mir_works ? '✓' : '✗'} МИР</span>
            <span class="mark ${card.unionpay_works ? 'yes' : 'no'}">${card.unionpay_works ? '✓' : '✗'} UnionPay</span>
          </span>
        </div>
        ${card.birth_right ? `<div class="drow"><span class="dlabel">Право почвы</span><span class="mark yes">✓ гражданство ребёнку</span></div>` : ''}
      </div>
      <div class="risk-full"><span>⚠️</span><span>${esc(card.risk)}</span></div>
      <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div></div></div>

    <div class="expand-hint"><span class="lbl-txt">подробнее</span><span class="chev">▾</span></div>
  `;

  let opened = false;
  let counted = false;
  el.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    opened = !opened;
    el.dataset.open = String(opened);
    el.querySelector('.risk-line').classList.toggle('clamp', !opened);
    el.querySelector('.lbl-txt').textContent = opened ? 'свернуть' : 'подробнее';
    haptic('light');
    if (opened && !counted) { counted = true; track(EVENTS.OPEN_COUNTRY, { code: card.code }); }
  });

  // animate the passport stamp once the card is in the DOM
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const arc = el.querySelector('#' + sid);
    const off = C * (1 - Math.max(0, Math.min(100, card.fit_score)) / 100);
    if (arc) arc.style.strokeDashoffset = String(off);
    countUp(el.querySelector('.num b'), card.fit_score);
  }));

  return el;
}

function countUp(node, target) {
  if (!node) return;
  const dur = 650, t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ───────────────────────────────────────────── skeleton ──────────────────
function skeletonCard(delay) {
  const el = document.createElement('article');
  el.className = 'plate skel';
  el.style.animationDelay = delay + 'ms';
  el.innerHTML = `
    <div class="card-top">
      <span class="sk-bar sk-flag"></span>
      <div class="card-id" style="flex:1"><span class="sk-bar sk-title"></span></div>
      <span class="sk-bar sk-circ"></span>
    </div>
    <div class="chips"><span class="sk-bar sk-chip"></span><span class="sk-bar sk-chip"></span></div>
    <div class="card-teaser"><span class="sk-bar sk-line" style="display:block;width:80%"></span></div>`;
  return el;
}

// ───────────────────────────────────────────── view ──────────────────────
export function render(root) {
  // skeleton while loading
  const head = document.createElement('div');
  head.className = 'view-head';
  head.innerHTML = `<span class="kicker">Ваш подбор</span><h1>Куда уехать</h1>`;
  root.appendChild(head);
  const slot = document.createElement('div');
  root.appendChild(slot);
  [0, 90, 180].forEach((d) => slot.appendChild(skeletonCard(d)));

  getResult().then((res) => {
    slot.innerHTML = '';
    if (!res || res.has_result === false) {
      head.remove();
      renderFallback(root);
      return;
    }
    const data = res.data || res;
    try { localStorage.setItem(RESULT_CACHE, JSON.stringify(data)); } catch { /* noop */ }
    track(EVENTS.VIEW_RESULT, { tier: data.score_tier });
    renderResultBody(root, slot, head, data);
  });
}

function renderResultBody(root, slot, head, data) {
  const tier = TIERS[data.score_tier] || TIERS.warm;
  head.querySelector('h1').textContent = 'Ваши страны';

  // tier strip
  const strip = document.createElement('div');
  strip.className = 'tier-strip';
  strip.innerHTML = `
    <div class="tier-row">
      <span class="tier-emoji">${tier.emoji}</span>
      <span class="tier-label" style="color:var(--gzh-tier-${tier.cls})">${tier.label}</span>
    </div>
    <p class="verdict">${tier.verdict}</p>
    <div class="band">Бюджет: <b>${BUDGET_BANDS[data.budget_band] || '—'}</b></div>`;
  root.insertBefore(strip, slot);

  const cards = (data.top_countries || []).slice(0, 5);
  cards.forEach((c, i) => slot.appendChild(renderCountryCard(c, { rank: i + 1, delay: i * 90 })));

  renderSegments(root, data.segments || []);
}

function renderSegments(root, segments) {
  if (!segments.length) return;
  const block = document.createElement('div');
  block.className = 'segment-block';
  block.innerHTML = `<span class="kicker">Что дальше</span>`;
  segments.slice(0, 3).forEach((segId) => {
    const seg = SEGMENTS[segId];
    if (!seg) return;
    const card = document.createElement('div');
    card.className = 'segment-card';
    card.innerHTML = `
      <h3>${esc(seg.label)}</h3>
      <p>${esc(seg.sub)}</p>
      <button class="btn btn-gold">${esc(seg.label)}</button>`;
    card.querySelector('button').addEventListener('click', () => runSegment(segId, seg));
    block.appendChild(card);
  });
  root.appendChild(block);
}

function runSegment(segId, seg) {
  track(EVENTS.CLICK_SEGMENT_CTA, { segment: segId });
  haptic('medium');
  if (seg.kind === 'in_app') return go('calc');
  if (seg.kind === 'channel') return openTgLink('https://t.me/' + CHANNEL_USERNAME);
  if (seg.kind === 'partner') {
    const url = PARTNERS[seg.partner];
    if (url) return openExtLink(url);
  }
  // default / partner-empty → write to bot, segment carried in start_param
  openTgLink('https://t.me/' + BOT_USERNAME + '?start=' + (seg.start || 'lead'));
}

// ───────────────────────────────────────────── fallback ──────────────────
function renderFallback(root) {
  track(EVENTS.FALLBACK_SHOWN);
  const wrap = document.createElement('div');
  wrap.className = 'fallback';
  wrap.innerHTML = `
    <div class="seal">🧭</div>
    <h2>Подбор ещё не пройден</h2>
    <p>Чтобы увидеть свои страны — пройдите быстрый подбор в боте: 5 вопросов, 1 минута.</p>
    <div class="btn-row">
      <button class="btn btn-gold" data-act="bot">Пройти подбор в боте</button>
      <button class="btn btn-ghost btn-sub" data-act="countries">Посмотреть все страны</button>
      <button class="btn btn-ghost btn-sub" data-act="calc">Калькулятор перелёта</button>
    </div>`;
  wrap.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    haptic('light');
    if (act === 'bot') openTgLink('https://t.me/' + BOT_USERNAME + '?start=app');
    else go(act);
  });
  root.appendChild(wrap);
}
