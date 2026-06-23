/* ════════════════════════════════════════════════════════════════════════
   manager-flow.js — МОК-ПРОТОТИП флоу «Связаться с менеджером» (Где Жить).
   За флагом ?managerflow=1 (живой экран «Карты доступа» не трогает).
   Машина состояний по SPEC-manager-contact-flow.md §1; данные вопросов из
   questions.mock.json; стык с ботом = мок-слой mgrApi (BASE_URL='MOCK').
   Общается с app-map.js через window.GZH. РЕАЛЬНЫЙ API ждёт готового бота (seam §10/§11).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  const G = window.GZH;
  if (!G || !G.cfg || !G.cfg.flag) return;   // флаг выкл → прототип спит, живая апка не меняется

  const params = new URLSearchParams(location.search);
  const FORCE_NOTG = params.has('notg');                 // ?notg=1 — демо ветки «вне Telegram»
  const MOCK = G.cfg.baseUrl === 'MOCK';
  // демо: флаг подразумевает «как будто в Telegram» (есть user_id для сохранения), если не forced notg
  const hasTg = () => !FORCE_NOTG && (G.isTelegram || G.cfg.flag);

  const LS = {
    get: (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  if (params.has('answered')) LS.set('gzh_mock_answered', params.get('answered') === '0' ? '0' : '1');

  const uuid = () => 'sub-' + Math.abs(hashStr(String(LS.get('gzh_submit_seed') || seedOnce()))).toString(36) + '-' + (LS.get('gzh_submit_n') || '0');
  function seedOnce() { const s = String(performance.now()) + location.search; LS.set('gzh_submit_seed', s); return s; }
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

  /* ── вопросы (мок-снимок; в проде GET /api/questions) ───────────────────── */
  let Q = null;
  async function loadQuestions() {
    if (Q) return Q;
    try { Q = await (await fetch('./questions.mock.json', { cache: 'no-cache' })).json(); }
    catch (e) { console.warn('[mgr] questions load failed', e); Q = { version: 'none', clusters: {}, country_step: {} }; }
    return Q;
  }
  const stepByKey = (cluster, key) => (Q.clusters[cluster]?.steps || []).find((s) => s.key === key) || null;

  /* ── мок-слой API (стык с ботом; реальные эндпоинты — seam §11) ─────────── */
  const mgrApi = {
    async getProfile() {
      if (MOCK) return { answered: LS.get('gzh_mock_answered') === '1', task: G.cluster, country: G.iso, countries: G.iso ? [G.iso] : [], answers: {} };
      const r = await fetch(G.cfg.baseUrl + '/api/profile', { headers: authHdr() });
      if (!r.ok) throw new Error('profile ' + r.status);
      return r.json();
    },
    async postAnswers(payload) {
      if (MOCK) {
        LS.set('gzh_mock_answered', '1'); LS.set('gzh_seen_submit', '1');
        LS.set('gzh_quiz_draft', JSON.stringify({ v: Q.version, cluster: payload.cluster, answers: payload.answers, c: payload.countries }));
        return { ok: true, answered: true, deep_link: G.botLink(payload.cluster, payload.countries[0] || null) };
      }
      const r = await fetch(G.cfg.baseUrl + '/api/answers', { method: 'POST', headers: { ...authHdr(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('answers ' + r.status);
      return r.json();
    },
    async deleteAnswers() {
      if (MOCK) { LS.del('gzh_quiz_draft'); LS.del('gzh_mock_answered'); LS.del('gzh_seen_submit'); return { ok: true }; }
      const r = await fetch(G.cfg.baseUrl + '/api/answers', { method: 'DELETE', headers: authHdr() });
      return r.ok ? { ok: true } : { ok: false };
    },
    event(type, data = {}) {
      // приватность §5: чувствительные значения НЕ уходят в событие
      const safe = {}; for (const k in data) { const st = stepByKey(state.cluster, k); safe[k] = st && st.sensitive ? '<hidden>' : data[k]; }
      console.log('[mgr-event]', type, { cluster: state.cluster, ...safe });
    },
  };
  function authHdr() { try { return { Authorization: 'tma ' + (G.tg.initData || '') }; } catch { return {}; } }

  /* ── состояние флоу ─────────────────────────────────────────────────────── */
  const state = { cluster: null, iso: null, answers: {}, steps: [], idx: 0, submitId: null };

  function appSteps(cluster) {
    const br = Q.clusters[cluster];
    if (!br) return [];
    return br.steps.filter((s) => {
      if (s.key in state.answers) return false;                       // уже отвечен (инв.7)
      if (s.kind === 'country' || s.kind === 'country_multi') return !state.iso;  // страна с карты → пропуск
      return s.app_ask === true;                                      // срез §9
    });
  }
  function countryOptions(step) {
    const cl = step.country_cluster;
    const list = (G.data()?.clusters?.[cl]?.iso_list) || [];
    return list.map((iso) => ({ value: iso, label: G.data().clusters[cl].countries[iso].name }));
  }

  /* ── helpers UI ─────────────────────────────────────────────────────────── */
  const esc = G.esc;
  function clusterLabel(cl) { const c = G.data()?.clusters?.[cl]; return c ? `${c.emoji} ${c.label}` : cl; }
  function answerLabel(cluster, key, val) {
    const st = stepByKey(cluster, key); if (!st) return val;
    if (st.kind === 'country') return G.data().clusters[st.country_cluster]?.countries?.[val]?.name || val;
    if (st.kind === 'multi') return (val || []).map((v) => (st.options.find((o) => o.value === v)?.label || v)).join(', ');
    return st.options.find((o) => o.value === val)?.label || val;
  }
  function sheet() { return G.ensureSheet('mgr-sheet'); }
  function open(html, wire) { const s = sheet(); s.innerHTML = `<div class="sheet-grab"></div>` + html; G.showSheet(s); wire && wire(s); }

  /* ── ВХОД ───────────────────────────────────────────────────────────────── */
  async function enter() {
    await loadQuestions();
    state.cluster = G.cluster; state.iso = G.iso; state.answers = {}; state.idx = 0;
    mgrApi.event('mgr_open');
    if (!hasTg()) { G.openTgLink(G.botLink(state.cluster, state.iso)); G.toast('Откройте в Telegram, чтобы продолжить'); return; }
    if (!state.cluster) return needSubject();
    prefillFromMap();
    let prof;
    try { prof = await mgrApi.getProfile(); }
    catch { return LS.get('gzh_seen_submit') === '1' ? handoff() : quizIntro(); }   // ветка В §1
    if (prof.answered && state.cluster && state.iso) return confirm();              // Сценарий 1
    if (!state.iso && needCountry()) return needSubject('country');                 // нет страны и она нужна
    return quizIntro();                                                             // Сценарий 2
  }
  function prefillFromMap() {
    // страна с карты → пред-заполняем country-шаг (атомарно к subject)
    if (!state.iso) return;
    const ck = Q.country_step?.[state.cluster];
    if (ck) state.answers[ck] = state.iso;
    state.answers._countries = [state.iso];
  }
  function needCountry() { return !!Q.country_step?.[state.cluster]; }

  /* ── NEED_SUBJECT ───────────────────────────────────────────────────────── */
  function needSubject(missing) {
    if (!state.cluster) {
      open(`<header class="mgr-head"><h3>С чем помочь?</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
        <p class="mgr-sub">Сначала выберите задачу — и консультант разберёт ваш случай.</p>
        <button class="btn btn-gold" id="mgr-pick-task">Выбрать задачу →</button>`, (s) => {
        s.querySelector('.sheet-close').onclick = G.closeSheet;
        s.querySelector('#mgr-pick-task').onclick = () => { G.closeSheet(); G.openTaskPicker(); };
      });
      return;
    }
    // задача есть, страны нет
    open(`<header class="mgr-head"><h3>Уточним страну</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
      <div class="mgr-subject"><span class="mgr-row"><b>Задача</b> ${esc(clusterLabel(state.cluster))}</span></div>
      <p class="mgr-sub">Отметьте страну на карте — или разберёмся вместе.</p>
      <button class="btn btn-gold" id="mgr-pick-country">Выбрать страну на карте</button>
      <button class="btn btn-ghost" id="mgr-skip">Пропустить — разберёмся вместе</button>`, (s) => {
      s.querySelector('.sheet-close').onclick = G.closeSheet;
      s.querySelector('#mgr-pick-country').onclick = () => {
        G.closeSheet(); G.toast('Тапните страну на карте'); G.awaitCountry = (iso) => { G.setCountry(iso); state.iso = iso; prefillFromMap(); enter(); };
      };
      s.querySelector('#mgr-skip').onclick = () => { quizIntro(); };
    });
  }

  /* ── CONFIRM (Сценарий 1) ───────────────────────────────────────────────── */
  function confirm() {
    mgrApi.event('confirm_shown');
    const iso = state.iso, isoName = iso ? G.data().clusters[state.cluster]?.countries?.[iso]?.name : null;
    open(`<header class="mgr-head"><h3>Передаю консультанту</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
      <p class="mgr-sub">Разберём ваш случай:</p>
      <div class="mgr-subject">
        <span class="mgr-row"><b>Задача</b> ${esc(clusterLabel(state.cluster))}</span>
        <span class="mgr-row"><b>Страна</b> ${iso ? esc(isoName) : '<i>не выбрана</i>'}</span>
      </div>
      <div class="mgr-locked"><span>🔒</span><span>Сроки, стоимость и как именно в вашем случае — разберёт лично консультант.</span></div>
      <button class="btn btn-gold" id="mgr-yes">Да, передать →</button>
      <button class="btn btn-ghost" id="mgr-change">Поменять</button>
      <p class="mgr-foot"><b>Бесплатно</b> · отвечает консультант</p>`, (s) => {
      s.querySelector('.sheet-close').onclick = G.closeSheet;
      s.querySelector('#mgr-yes').onclick = () => { mgrApi.event('confirm_yes'); handoff(); };
      s.querySelector('#mgr-change').onclick = () => { mgrApi.event('confirm_edit'); changeMenu(); };
    });
  }

  function changeMenu() {
    open(`<header class="mgr-head"><h3>Что поменять?</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
      <button class="btn btn-ghost" id="mgr-ch-task">Сменить задачу</button>
      <button class="btn btn-ghost" id="mgr-ch-country">Сменить страну</button>`, (s) => {
      s.querySelector('.sheet-close').onclick = G.closeSheet;
      s.querySelector('#mgr-ch-task').onclick = () => { G.closeSheet(); G.openTaskPicker(); };   // смена задачи → picker (answers сброс при новом enter)
      s.querySelector('#mgr-ch-country').onclick = () => {
        G.closeSheet(); G.toast('Тапните другую страну на карте');
        G.awaitCountry = (iso) => { G.setCountry(iso); state.iso = iso; // смена ТОЛЬКО страны: answers сохранены, country перезаписан (инв.2/9)
          const ck = Q.country_step?.[state.cluster]; if (ck) state.answers[ck] = iso; state.answers._countries = [iso]; confirm(); };
      };
    });
  }

  /* ── QUIZ ───────────────────────────────────────────────────────────────── */
  function quizIntro() {
    restoreDraft();
    state.steps = appSteps(state.cluster);
    if (!state.steps.length) return review();   // нечего спрашивать → сразу ревью
    const n = state.steps.length;
    const isoName = state.iso ? G.data().clusters[state.cluster]?.countries?.[state.iso]?.name : null;
    open(`<header class="mgr-head"><h3>Перед связью — пара вопросов</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
      <p class="mgr-sub">Консультант подберёт точнее.</p>
      <div class="mgr-subject"><span class="mgr-row"><b>Задача</b> ${esc(clusterLabel(state.cluster))}</span>${isoName ? `<span class="mgr-row"><b>Страна</b> ${esc(isoName)}</span>` : ''}</div>
      <p class="mgr-consent">Ответы видит только консультант. Не передаём третьим лицам. <button class="mgr-del" id="mgr-del">Удалить мои ответы</button></p>
      <button class="btn btn-gold" id="mgr-start">Ответить (${n}) →</button>
      <button class="btn btn-ghost" id="mgr-change2">Поменять</button>`, (s) => {
      s.querySelector('.sheet-close').onclick = G.closeSheet;
      s.querySelector('#mgr-start').onclick = () => { mgrApi.event('test_started'); state.idx = 0; G.closeSheet(); quizStep(); };
      s.querySelector('#mgr-change2').onclick = () => changeMenu();
      s.querySelector('#mgr-del').onclick = async () => { await mgrApi.deleteAnswers(); state.answers = {}; prefillFromMap(); G.toast('Ответы удалены'); };
    });
  }

  function quizStep() {
    // state.steps фиксируется в quizIntro (НЕ пересчитываем тут — иначе отвеченный выпадает И idx растёт = пропуск шага)
    if (!state.steps || state.idx >= state.steps.length) return review();
    const st = state.steps[state.idx];
    const total = state.steps.length, num = state.idx + 1;
    const opts = (st.kind === 'country' || st.kind === 'country_multi') ? countryOptions(st) : st.options;
    const isMulti = st.kind === 'multi' || st.kind === 'country_multi';
    const sel = new Set(isMulti ? (state.answers[st.key] || []) : []);

    const layer = ensureQuizLayer();
    layer.innerHTML = `
      <div class="mgrq-top">
        <button class="mgrq-back" id="mgrq-back">←&nbsp;Назад</button>
        <span class="mgrq-count">Вопрос ${num} из ${total}</span>
      </div>
      <div class="mgrq-bar"><i style="width:${Math.round((num / total) * 100)}%"></i></div>
      <div class="mgrq-body">
        <span class="mgrq-kicker">${esc(clusterLabel(state.cluster))}</span>
        <h2 class="mgrq-q">${st.text}</h2>
        <div class="mgrq-opts ${isMulti ? 'is-multi' : ''}">
          ${opts.map((o) => `<button class="mgrq-opt${sel.has(o.value) ? ' is-on' : ''}" data-v="${esc(o.value)}">${esc(o.label)}<span class="mgrq-tick">✓</span></button>`).join('')}
        </div>
      </div>
      <div class="mgrq-foot">
        ${isMulti ? `<button class="btn btn-gold" id="mgrq-done">Готово</button>` : ''}
        <button class="mgrq-changetask" id="mgrq-changetask">Сменить задачу</button>
      </div>`;
    showQuizLayer();

    layer.querySelector('#mgrq-back').onclick = () => { if (state.idx > 0) { state.idx--; quizStep(); } else { hideQuizLayer(); quizIntro(); } };
    layer.querySelector('#mgrq-changetask').onclick = () => { hideQuizLayer(); state.answers = {}; G.openTaskPicker(); };  // смена задачи → answers сброс (инв.2)
    layer.querySelectorAll('.mgrq-opt').forEach((b) => {
      b.onclick = () => {
        G.haptic && G.haptic('select');
        const v = b.dataset.v;
        if (isMulti) {
          const max = st.multi_max || 3;
          if (sel.has(v)) sel.delete(v); else { if (sel.size >= max) { G.toast(`Максимум ${max}`); return; } sel.add(v); }
          b.classList.toggle('is-on', sel.has(v)); state.answers[st.key] = [...sel];
        } else {
          state.answers[st.key] = v; saveDraft();
          state.idx++; quizStep();                       // single → авто-переход
        }
      };
    });
    const done = layer.querySelector('#mgrq-done');
    if (done) done.onclick = () => {
      if (!(state.answers[st.key] || []).length) { G.toast('Отметьте хотя бы одну'); return; }
      saveDraft(); state.idx++; quizStep();
    };
  }

  function review() {
    hideQuizLayer();
    const iso = state.iso, isoName = iso ? G.data().clusters[state.cluster]?.countries?.[iso]?.name : null;
    const ck = Q.country_step?.[state.cluster];
    const rows = Object.keys(state.answers)
      .filter((k) => k[0] !== '_' && k !== ck && !['country', 'country_multi'].includes(stepByKey(state.cluster, k)?.kind))
      .map((k) => `<div class="mgr-arow"><span class="mgr-aq">${esc(qText(k))}</span><span class="mgr-aa">${esc(answerLabel(state.cluster, k, state.answers[k]))}</span></div>`).join('');
    open(`<header class="mgr-head"><h3>Проверьте ответы</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
      <div class="mgr-subject"><span class="mgr-row"><b>Задача</b> ${esc(clusterLabel(state.cluster))}</span>${isoName ? `<span class="mgr-row"><b>Страна</b> ${esc(isoName)}</span>` : ''}</div>
      ${rows ? `<div class="mgr-answers">${rows}</div>` : ''}
      <button class="btn btn-gold" id="mgr-submit">Отправить и связаться →</button>
      <button class="btn btn-ghost" id="mgr-edit">Изменить ответы</button>`, (s) => {
      s.querySelector('.sheet-close').onclick = G.closeSheet;
      s.querySelector('#mgr-edit').onclick = () => { G.closeSheet(); state.idx = 0; quizStep(); };
      s.querySelector('#mgr-submit').onclick = (e) => submit(e.currentTarget);
    });
  }
  function qText(k) { const st = stepByKey(state.cluster, k); return st ? st.text.replace(/<[^>]+>/g, '') : k; }

  async function submit(btn) {
    btn.disabled = true; btn.textContent = 'Отправляю…'; btn.classList.add('is-loading');
    if (!state.submitId) state.submitId = uuid();
    const payload = { cluster: state.cluster, countries: state.iso ? [state.iso] : [], answers: stripMeta(state.answers), source_raw: LS.get('gzh_src') || null, client_submit_id: state.submitId };
    mgrApi.event('test_submitted', stripMeta(state.answers));
    try {
      const res = await mgrApi.postAnswers(payload);
      LS.del('gzh_quiz_draft');
      open(`<header class="mgr-head"><h3>Готово ✓</h3></header>
        <p class="mgr-sub">Открываю чат с консультантом…</p>
        <button class="btn btn-gold" id="mgr-openchat">Открыть чат</button>`, (s) => {
        s.querySelector('#mgr-openchat').onclick = () => G.openTgLink(res.deep_link || G.botLink(state.cluster, state.iso));
      });
      setTimeout(() => G.openTgLink(res.deep_link || G.botLink(state.cluster, state.iso)), 600);
    } catch (e) {
      console.warn('[mgr] submit failed', e);
      open(`<header class="mgr-head"><h3>Не отправилось</h3><button class="sheet-close" aria-label="Закрыть">✕</button></header>
        <p class="mgr-sub">Связь подвела. Можно повторить или продолжить в боте.</p>
        <button class="btn btn-gold" id="mgr-retry">Повторить</button>
        <button class="btn btn-ghost" id="mgr-tobot">Продолжить в боте</button>`, (s) => {
        s.querySelector('.sheet-close').onclick = G.closeSheet;
        s.querySelector('#mgr-retry').onclick = (ev) => submit(ev.currentTarget);     // тот же submitId — бэк дедупит
        s.querySelector('#mgr-tobot').onclick = () => handoff();
      });
    }
  }

  function handoff() {
    G.openTgLink(G.botLink(state.cluster, state.iso));   // финал «менеджер свяжется» рисует БОТ
    G.closeSheet();
  }

  /* ── черновик ───────────────────────────────────────────────────────────── */
  function saveDraft() { LS.set('gzh_quiz_draft', JSON.stringify({ v: Q.version, cluster: state.cluster, answers: state.answers })); }
  function restoreDraft() {
    try {
      const d = JSON.parse(LS.get('gzh_quiz_draft') || 'null');
      if (d && d.v === Q.version && d.cluster === state.cluster && Q.clusters[d.cluster]) {
        for (const k in d.answers) if (!(k in state.answers)) state.answers[k] = d.answers[k];  // best-effort префилл
      } else if (d) { LS.del('gzh_quiz_draft'); }   // версия/кластер не те → выкинуть молча (инв.12)
    } catch { LS.del('gzh_quiz_draft'); }
  }
  function stripMeta(a) { const o = {}; for (const k in a) if (k[0] !== '_') o[k] = a[k]; return o; }

  /* ── полноэкранный слой квиза ───────────────────────────────────────────── */
  function ensureQuizLayer() {
    let el = document.getElementById('mgr-quiz');
    if (!el) { el = document.createElement('div'); el.id = 'mgr-quiz'; el.className = 'mgr-quiz'; el.hidden = true; document.body.appendChild(el); }
    return el;
  }
  function showQuizLayer() { const el = ensureQuizLayer(); el.hidden = false; el.scrollTop = 0; }
  function hideQuizLayer() { const el = document.getElementById('mgr-quiz'); if (el) el.hidden = true; }

  /* ── привязка кнопки + видимость по tier (через делегирование) ───────────── */
  document.addEventListener('click', (e) => { if (e.target.closest('#mgr-cta-btn')) { G.haptic && G.haptic('medium'); enter(); } });

  loadQuestions();
})();
