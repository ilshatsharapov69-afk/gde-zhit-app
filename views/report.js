// views/report.js — saved подбор (localStorage), instant render + background revalidate + share.
import { go, haptic, openTgLink, copyText, toast, BOT_USERNAME } from '../main.js';
import { getResult, track, EVENTS } from '../api.js';
import { flagMarkup } from './result.js';

const CACHE = 'gdezhit:result:v1';
const TIERS = {
  hot:  { emoji: '🔥', label: 'Горячо',  cls: 'hot' },
  warm: { emoji: '🌡', label: 'Тепло',   cls: 'warm' },
  cold: { emoji: '❄️', label: 'Холодно', cls: 'cold' },
};
const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; }
}

export function render(root) {
  const head = document.createElement('div');
  head.className = 'view-head';
  head.innerHTML = `<span class="kicker">Сохранённый отчёт</span><h1>Ваш подбор</h1>`;
  root.appendChild(head);

  const body = document.createElement('div');
  root.appendChild(body);

  const cached = readCache();
  if (cached && cached.top_countries) paint(body, cached);
  else body.innerHTML = `<div class="empty-note">Здесь появится ваш подбор.<br>Сначала откройте вкладку «Подбор».</div>
    <button class="btn btn-gold" id="to-result" style="margin-top:16px">Перейти к подбору</button>`;

  const toRes = body.querySelector('#to-result');
  if (toRes) toRes.addEventListener('click', () => { haptic('light'); go('result'); });

  // background revalidate
  getResult().then((res) => {
    if (res && res.has_result !== false) {
      const data = res.data || res;
      try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* noop */ }
      if (!cached || JSON.stringify(cached.top_countries) !== JSON.stringify(data.top_countries)) {
        body.innerHTML = '';
        paint(body, data);
      }
    }
  });
}

function paint(body, data) {
  const tier = TIERS[data.score_tier] || TIERS.warm;
  const top3 = (data.top_countries || []).slice(0, 3);

  const strip = document.createElement('div');
  strip.className = 'tier-strip';
  strip.innerHTML = `<div class="tier-row">
      <span class="tier-emoji">${tier.emoji}</span>
      <span class="tier-label" style="color:var(--gzh-tier-${tier.cls})">${tier.label}</span>
    </div>
    <p class="verdict">Топ-${top3.length} стран под вашу ситуацию. Сохранено на этом устройстве.</p>`;
  body.appendChild(strip);

  top3.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'report-mini';
    row.innerHTML = `${flagMarkup(c.flag_emoji)}
      <div class="nm">${esc(c.name_ru)}<div class="bd">$${esc(c.budget_month_usd)}/мес</div></div>
      <span class="sc">${c.fit_score}</span>`;
    row.addEventListener('click', () => { haptic('light'); go('result'); });
    body.appendChild(row);
  });

  const shareText = buildShareText(data);

  const share = document.createElement('div');
  share.style.marginTop = '24px';
  share.innerHTML = `
    <div class="btn-row">
      <button class="btn btn-gold" id="share">Поделиться подбором</button>
      <button class="btn btn-ghost btn-sub" id="copy">Скопировать текст</button>
      <button class="btn btn-ghost btn-sub" id="refresh">Обновить подбор</button>
    </div>
    <div class="share-preview">${esc(shareText)}</div>`;
  body.appendChild(share);

  share.querySelector('#share').addEventListener('click', () => doShare(shareText));
  share.querySelector('#copy').addEventListener('click', async () => {
    const ok = await copyText(shareText);
    toast(ok ? 'Текст скопирован' : 'Не удалось скопировать');
    haptic('light');
    track(EVENTS.SHARE_REPORT, { method: 'clipboard' });
  });
  share.querySelector('#refresh').addEventListener('click', () => { haptic('light'); go('result'); });
}

function buildShareText(data) {
  const lines = (data.top_countries || []).slice(0, 3)
    .map((c, i) => `${i + 1}. ${c.flag_emoji} ${c.name_ru} — ${c.fit_score}/100`);
  return `🧭 Мой подбор страны для переезда — «Где Жить»\n${lines.join('\n')}\n\nПройти свой подбор: t.me/${BOT_USERNAME}`;
}

async function doShare(text) {
  const botLink = 'https://t.me/' + BOT_USERNAME;
  haptic('medium');
  // 1) Telegram share sheet (canonical, works in & out of Telegram)
  try {
    openTgLink('https://t.me/share/url?url=' + encodeURIComponent(botLink) + '&text=' + encodeURIComponent(text));
    track(EVENTS.SHARE_REPORT, { method: 'tg_share' });
    return;
  } catch { /* fall through */ }
  // 2) native web share
  if (navigator.share) {
    try { await navigator.share({ text }); track(EVENTS.SHARE_REPORT, { method: 'web_share' }); return; } catch { /* fall through */ }
  }
  // 3) clipboard
  const ok = await copyText(text);
  toast(ok ? 'Скопировано — вставьте в чат' : text);
  track(EVENTS.SHARE_REPORT, { method: 'clipboard' });
}
