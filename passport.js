/* ════════════════════════════════════════════════════════════════════════
   ГДЕ ЖИТЬ — «Паспорт доступа»: персональная мини-диагностика (лид-магнит).
   Слой ПОВЕРХ карты. Квиз 6 тапов → персональная карточка: 2–3 рабочих пути
   под пользователя + у каждого ОДИН честный нюанс (открытый разрыв, который
   закрывает живой специалист) + финанс-крючок (карта/счёт нужны всем) + CTA
   на бесплатную консультацию + «Поделиться».

   ПРИНЦИПЫ (зашиты в логику):
   • Никакого фейкового eligibility. Логика клиентская, детерминированная,
     на данных map_data.json (есть партнёры n>0 → «путь есть» — это правда).
   • Нюанс = реальная кейс-зависимая переменная (паспорт/срок/состав), НЕ
     выдуманная проблема. Полный готовый ответ не даём — иначе незачем к спецу.
   • Бюджет цифрами не спрашиваем и не показываем. «Бизнес/инвестор» в Q6 —
     честный прокси «есть капитал», без чисел.
   ════════════════════════════════════════════════════════════════════════ */

(function () {
  const G = window.GZH;
  if (!G) { console.warn('[passport] GZH bridge missing'); return; }

  const LS_KEY = 'gzh_passport';

  /* ───────────────────────────────── вопросы (≤7; прогресс-бар обязателен) */
  const QUESTIONS = [
    { id: 'goal', kind: 'cluster', q: 'Что тебе нужно за рубежом?', help: 'С этого начнём подбор' },
    { id: 'family', q: 'С кем планируешь?', opts: [
      { v: 'solo',   e: '🧍', l: 'Один' },
      { v: 'couple', e: '👫', l: 'В паре' },
      { v: 'kids',   e: '👨‍👩‍👧', l: 'С детьми' },
    ] },
    { id: 'urgency', q: 'Насколько это срочно?', opts: [
      { v: 'fast',    e: '🔥', l: 'Надо как можно скорее' },
      { v: 'year',    e: '🗓️', l: 'В течение года' },
      { v: 'explore', e: '🧭', l: 'Пока просто изучаю' },
    ] },
    { id: 'lang', q: 'Какими языками владеешь?', opts: [
      { v: 'ru', e: '🗣️', l: 'Только русский' },
      { v: 'en', e: '🇬🇧', l: 'Английский — ок' },
      { v: 'es', e: '🇪🇸', l: 'Испанский' },
      { v: 'eu', e: '🇪🇺', l: 'Другой европейский' },
    ] },
    { id: 'passport', q: 'Какой у тебя паспорт?', help: 'От него зависят сроки и документы', opts: [
      { v: 'ru',    l: '🇷🇺 Россия' },
      { v: 'by',    l: '🇧🇾 Беларусь' },
      { v: 'ua',    l: '🇺🇦 Украина' },
      { v: 'kz',    l: '🇰🇿 Казахстан' },
      { v: 'other', l: '🌍 Другой' },
      { v: 'dual',  l: '🛂 Два и более' },
    ] },
    { id: 'occupation', q: 'Чем занимаешься?', opts: [
      { v: 'it',       e: '💻', l: 'IT / удалёнка' },
      { v: 'employee', e: '🏢', l: 'Наёмная работа (офлайн)' },
      { v: 'business', e: '📈', l: 'Свой бизнес' },
      { v: 'investor', e: '💎', l: 'Инвестор / рантье' },
      { v: 'none',     e: '🤔', l: 'Сейчас не работаю' },
    ] },
  ];

  /* ───────────────────── словари ранжирования (где язык/профиль упрощают старт) */
  const ES = new Set(['ES','AR','MX','CL','PA','CR','UY','CO','PE','EC','DO','BO','PY','GT','NI','SV','HN','VE']);
  const EN = new Set(['AE','US','CA','GB','IE','MT','CY','SG','AU','NZ','NL','PH','GE']);
  const EU = new Set(['DE','FR','IT','PT','ES','PL','CZ','GR','NL','AT','BE','HU','RO','BG','HR','SI','SK','EE','LV','LT','FI','SE','DK','CH','IE','LU','MT','CY']);
  const RUF = new Set(['RS','GE','AM','KZ','KG','AZ','ME','TR','AE','UZ','TJ','TM']);
  const REMOTE = new Set(['PT','ES','GE','AE','RS','ME','HR','EE','TH','ID','MX','AR','CR','MT','CY','TR','AM','KZ','BR','CO','PA']);

  /* ───────────────────────────────────────────────────────── состояние слоя */
  let layer = null;
  let idx = 0;                 // индекс текущего вопроса
  const answers = {};

  const data = () => G.data();
  const esc = G.esc;

  /* ───────────────────────────────────────────────────── расчёт путей+нюансов */
  function isoIn(iso, cl) { const d = data(); return !!(d.clusters[cl] && d.clusters[cl].countries[iso]); }

  function langBonus(iso, lang) {
    if (lang === 'es') return ES.has(iso) ? 1 : 0;
    if (lang === 'en') return EN.has(iso) ? 1 : 0;
    if (lang === 'eu') return EU.has(iso) ? 1 : 0;
    if (lang === 'ru') return RUF.has(iso) ? 1 : 0;
    return 0;
  }
  function occBonus(iso, occ) {
    if (occ === 'it')       return REMOTE.has(iso) ? 1 : 0;
    if (occ === 'employee') return isoIn(iso, 'work') ? 1 : 0;
    if (occ === 'business') return isoIn(iso, 'business') ? 1 : 0;
    if (occ === 'investor') return isoIn(iso, 'invest') ? 1 : 0;
    return 0;
  }

  // 2–3 страны из кластера задачи, ранжированы языком → профилем → числом партнёров.
  // Ранжирование не заявляет eligibility, только «где старт проще / выбор шире».
  function computePaths(ans) {
    const d = data();
    const cl = d.clusters[ans.goal];
    if (!cl) return { cluster: ans.goal, paths: [] };
    const scored = cl.iso_list.map((iso) => {
      const co = cl.countries[iso];
      const score = langBonus(iso, ans.lang) * 100 + occBonus(iso, ans.occupation) * 30 + (co.n || 1);
      return { iso, co, score };
    }).sort((a, b) => (b.score - a.score) || a.co.name.localeCompare(b.co.name, 'ru'));

    const top = scored.slice(0, Math.min(3, scored.length));
    const nuances = buildNuancePool(ans);

    // частота канон-фраз по кластеру → ведём уникализирующей фразой (различает близкие страны)
    const freq = {};
    cl.iso_list.forEach((iso) => (cl.countries[iso].services || []).forEach((s) => { freq[s] = (freq[s] || 0) + 1; }));
    const svcOf = (co) => {
      if (co.services && co.services.length) {
        return co.services.slice().sort((a, b) => (freq[a] ?? 99) - (freq[b] ?? 99)).slice(0, 2);
      }
      return (cl.bullets || []).slice(0, 2);
    };

    return {
      cluster: ans.goal,
      label: cl.label,
      emoji: cl.emoji,
      paths: top.map((t, i) => ({
        iso: t.iso, name: t.co.name, services: svcOf(t.co),
        nuance: nuances[Math.min(i, nuances.length - 1)],
      })),
    };
  }

  // Пул честных нюансов: самый релевантный — первым; путям раздаём РАЗНЫЕ (пул всегда ≥3).
  function buildNuancePool(ans) {
    const pool = [];
    if (ans.occupation === 'employee') pool.push('Подойдёт ли именно твоя профессия под местные требования — проверяет специалист.');
    if (ans.occupation === 'investor') pool.push('Какой режим выгоднее под твой капитал — виза или паспорт — считают индивидуально.');
    if (ans.occupation === 'business') pool.push('Где налоговый режим выгоднее под твой бизнес — зависит от деталей.');
    pool.push('Сроки и список документов зависят от твоего паспорта.');
    if (ans.family !== 'solo') pool.push('Понадобятся документы на каждого члена семьи — состав влияет на сроки.');
    if (ans.urgency === 'fast') pool.push('Реальный срок зависит от того, какие документы уже на руках.');
    pool.push('Какой путь короче именно в твоём случае — подскажет специалист.');
    pool.push('С чего начать в твоей ситуации — разберёт специалист на бесплатной консультации.');
    return pool;
  }

  /* ───────────────────────────────────────────────────────── каркас слоя */
  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'passport-layer';
    layer.id = 'passport-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }
  function open() {
    ensureLayer().hidden = false;
    try { document.documentElement.style.overflow = 'hidden'; } catch {}
  }
  function close() {
    if (layer) layer.hidden = true;
    try { document.documentElement.style.overflow = ''; } catch {}
  }

  function head(showBack) {
    return `<header class="pp-head">
      ${showBack ? '<button class="pp-back" id="pp-back" aria-label="Назад">‹</button>' : '<span class="pp-back-spacer"></span>'}
      <span class="pp-brand"><img src="./favicon.svg" alt=""><b>Где Жить</b></span>
      <button class="pp-x" id="pp-x" aria-label="Закрыть">✕</button>
    </header>`;
  }

  /* ───────────────────────────────────────────────────────── экран: интро */
  function renderIntro() {
    open();
    layer.innerHTML = `
      ${head(false)}
      <div class="pp-body pp-intro">
        <div class="pp-seal">🪪</div>
        <h1 class="pp-title">Твой Паспорт доступа</h1>
        <p class="pp-lead">6 вопросов — и я покажу <b>рабочие пути за рубеж именно под тебя</b> и где их разобрать.</p>
        <ul class="pp-bullets">
          <li><span>🌍</span> Твои направления — на карте</li>
          <li><span>🧭</span> 2–3 пути под твою задачу</li>
          <li><span>⏱️</span> Меньше минуты, без регистрации</li>
        </ul>
        <button class="btn btn-gold" id="pp-start">Собрать Паспорт →</button>
        <button class="pp-skip" id="pp-skip">просто посмотреть карту</button>
      </div>`;
    layer.querySelector('#pp-start').onclick = () => { G.haptic('medium'); idx = 0; renderQuestion(); };
    layer.querySelector('#pp-skip').onclick = () => { G.haptic('light'); close(); G.openTaskPicker(); };
    layer.querySelector('#pp-x').onclick = () => { close(); G.openTaskPicker(); };
  }

  /* ───────────────────────────────────────────────────────── экран: вопрос */
  function renderQuestion() {
    const total = QUESTIONS.length;
    const Q = QUESTIONS[idx];
    open();
    const pct = Math.round(((idx) / total) * 100);

    let optsHtml;
    if (Q.kind === 'cluster') {
      const d = data();
      const order = d.meta.cluster_order;
      const hi = order.filter((c) => d.clusters[c].tier === 'high');
      const lo = order.filter((c) => d.clusters[c].tier !== 'high');
      const row = (c) => {
        const cc = d.clusters[c];
        const on = answers.goal === c ? ' is-on' : '';
        return `<button class="pp-opt pp-clo${on}" data-v="${esc(c)}">
          <span class="pp-opt-e">${esc(cc.emoji)}</span>
          <span class="pp-opt-t"><b>${esc(cc.label)}</b><span>${esc(cc.blurb)}</span></span>
        </button>`;
      };
      optsHtml = `<div class="pp-grp-k">Ради этого чаще всего едут</div>${hi.map(row).join('')}
        <div class="pp-grp-k">Остальное</div>${lo.map(row).join('')}`;
    } else {
      optsHtml = Q.opts.map((o) => {
        const on = answers[Q.id] === o.v ? ' is-on' : '';
        const e = o.e ? `<span class="pp-opt-e">${esc(o.e)}</span>` : '';
        return `<button class="pp-opt${on}" data-v="${esc(o.v)}">${e}<span class="pp-opt-l">${esc(o.l)}</span></button>`;
      }).join('');
    }

    layer.innerHTML = `
      ${head(true)}
      <div class="pp-progress"><span style="width:${pct}%"></span></div>
      <div class="pp-step">Шаг ${idx + 1} из ${total}</div>
      <div class="pp-body">
        <h2 class="pp-q">${esc(Q.q)}</h2>
        ${Q.help ? `<p class="pp-help">${esc(Q.help)}</p>` : ''}
        <div class="pp-opts${Q.kind === 'cluster' ? ' pp-opts-cluster' : ''}">${optsHtml}</div>
      </div>`;

    layer.querySelector('#pp-x').onclick = () => { close(); G.openTaskPicker(); };
    layer.querySelector('#pp-back').onclick = () => {
      G.haptic('light');
      if (idx === 0) renderIntro(); else { idx -= 1; renderQuestion(); }
    };
    layer.querySelectorAll('.pp-opt').forEach((b) => {
      b.onclick = () => {
        G.haptic('select');
        answers[Q.id] = b.dataset.v;
        if (idx < total - 1) { idx += 1; renderQuestion(); }
        else finish();
      };
    });
    // прокрутка наверх при смене вопроса
    try { layer.querySelector('.pp-body').scrollTop = 0; layer.scrollTop = 0; } catch {}
  }

  /* ───────────────────────────────────────────────────────── финиш → результат */
  function finish() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(answers)); } catch {}
    // выставляем задачу на карте позади (заодно сохраняет gzh_task → возврат не всплывает picker'ом)
    try { if (answers.goal) G.selectCluster(answers.goal); } catch {}
    renderResult(answers);
  }

  /* ───────────────────────────────────────────────────────── экран: результат */
  function renderResult(ans) {
    open();
    const res = computePaths(ans);
    const d = data();
    const topISO = res.paths[0] ? res.paths[0].iso : null;
    const ctaLink = G.botLink(res.cluster, topISO);

    const pathCard = (p, i) => `
      <div class="pp-path">
        <div class="pp-path-h">
          <img class="flag-img" src="${G.flag(p.iso, 40)}" alt="">
          <span class="pp-path-n">${esc(p.name)}</span>
          <span class="pp-path-rank">Путь ${i + 1}</span>
        </div>
        <ul class="pp-svc">${p.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="pp-nuance"><span class="nu-badge">нюанс</span><span>${esc(p.nuance)}</span></div>
      </div>`;

    // финанс-крючок (карта/счёт нужны всем) — кроме случая, когда задача и есть «деньги/карты»
    const fin = d.clusters.finance;
    const finStrip = (res.cluster !== 'finance' && fin) ? `
      <button class="pp-fin" id="pp-fin" data-link="${G.botLink('finance', null)}">
        <span class="pp-fin-e">💳</span>
        <span class="pp-fin-t"><b>И сразу — карта и счёт за рубежом</b><span>Нужны всем, кто уезжает. Можно начать с этого.</span></span>
        <span class="pp-fin-go">→</span>
      </button>` : '';

    layer.innerHTML = `
      ${head(false)}
      <div class="pp-body pp-result">
        <div class="pp-rkick">Твой Паспорт доступа</div>
        <h1 class="pp-rtitle">${esc(res.emoji)} ${esc(res.label)}</h1>
        <p class="pp-rsub">Под твою задачу есть <b>${res.paths.length} ${G.plural(res.paths.length, 'рабочее направление', 'рабочих направления', 'рабочих направлений')}</b>. Вот они 👇</p>

        ${res.paths.map(pathCard).join('')}
        ${finStrip}

        <div class="pp-consult">
          <h3>Разобрать твой случай — бесплатно</h3>
          <p>Специалист-навигатор посмотрит ситуацию, задаст пару уточняющих вопросов и подскажет, с чего начать. Консультация бесплатная и ни к чему не обязывает.</p>
          <p class="pp-safe">🛡️ Никаких документов, кодов или предоплаты — только вопросы о твоей ситуации.</p>
          <button class="btn btn-gold" id="pp-cta" data-link="${ctaLink}">Перейти к специалисту →</button>
        </div>

        <div class="pp-result-actions">
          <button class="btn btn-ghost" id="pp-share">📤 Поделиться</button>
          <button class="pp-map-link" id="pp-tomap">Посмотреть мои страны на карте</button>
          <button class="pp-redo" id="pp-redo">пройти заново</button>
        </div>
      </div>`;

    layer.querySelector('#pp-x').onclick = () => { close(); applyToMap(res); };
    layer.querySelector('#pp-cta').onclick = (e) => { G.haptic('medium'); G.openTgLink(e.currentTarget.dataset.link); };
    const finBtn = layer.querySelector('#pp-fin');
    if (finBtn) finBtn.onclick = (e) => { G.haptic('light'); G.openTgLink(e.currentTarget.dataset.link); };
    layer.querySelector('#pp-share').onclick = () => share(res);
    layer.querySelector('#pp-tomap').onclick = () => { G.haptic('light'); close(); applyToMap(res); };
    layer.querySelector('#pp-redo').onclick = () => { G.haptic('light'); idx = 0; renderIntro(); };
    try { layer.scrollTop = 0; } catch {}
  }

  // подсветить результат на основной карте (задача + 2–3 страны ярче)
  function applyToMap(res) {
    if (G.highlightResult) G.highlightResult(res.cluster, res.paths.map((p) => p.iso));
    else G.selectCluster(res.cluster);
  }

  /* ───────────────────────────────────────────────────────── поделиться */
  function share(res) {
    G.haptic('light');
    const names = res.paths.map((p) => p.name).join(', ');
    const text = `🪪 Мой Паспорт доступа — «Где Жить»\nЗадача: ${res.emoji} ${res.label}\nРабочие направления: ${names}\nСобери свой за минуту 👇`;
    const url = G.botLink(res.cluster, null);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    G.openTgLink(shareUrl);
  }

  /* ───────────────────────────────────────────────────────── публичный API */
  function hasResult() {
    try { return !!localStorage.getItem(LS_KEY); } catch { return false; }
  }
  function start(opts) {
    const mode = (opts && opts.mode) || 'manual';
    if (mode === 'result') {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
      if (saved && saved.goal && data() && data().clusters[saved.goal]) {
        Object.assign(answers, saved);
        renderResult(saved);
        return;
      }
    }
    renderIntro();   // cold / manual / нет валидного результата
  }

  window.GZH_PASSPORT = { start, hasResult, close };
})();
