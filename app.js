/* Caddie — loops, roster, and revenue. All data stays on this phone. */
(function () {
  'use strict';

  const STORAGE_KEY = 'caddie.v1';
  const DRAFT_KEY = 'caddie.loopDraft';
  const NOTE_FIELDS = [
    ['clubs', 'Club selection & yardages', 'What they carry, and how far'],
    ['greens', 'Green reading', 'How they like a read'],
    ['pace', 'Pace & personality', 'Tempo, temperament, small talk'],
    ['drinks', 'Drinks & snacks', 'What to have waiting'],
    ['tipping', 'Tipping', 'How they usually take care of you'],
    ['other', 'Other', 'Anything else worth remembering'],
  ];
  const CATEGORIES = [
    ['gear', 'Gear'],
    ['travel', 'Travel'],
    ['uniform', 'Uniform'],
    ['other', 'Other'],
  ];
  const MAX_FORE = 12;

  const ui = {
    tab: 'loop',
    route: { name: 'loop' },
    stack: [],
    loopDraft: null,
    playerDraft: null,
    expenseDraft: null,
    year: new Date().getFullYear(),
    modal: null,
    toastTimer: null,
    rosterQuery: '',
    keepScroll: false,
    scrollTop: 0,
    lastKey: '',
    yearRevenueCents: 0,
  };

  let state = load();
  restoreDraft();

  const main = document.getElementById('main');
  const backBtn = document.getElementById('back-btn');
  const settingsBtn = document.getElementById('settings-btn');

  document.addEventListener('mousedown', (event) => {
    const el = event.target.closest('[data-action="pick-player"], [data-action="add-player"], [data-action="pick-course"]');
    if (el) event.preventDefault();
  });
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKeydown);

  render();
  registerServiceWorker();

  function onClick(event) {
    const el = event.target.closest('[data-action]');
    if (!el) {
      if (event.target.classList && event.target.classList.contains('modal-backdrop')) closeModal();
      return;
    }
    const action = el.dataset.action;
    if (action === 'tab') goTab(el.dataset.tab);
    else if (action === 'settings') push({ name: 'settings' });
    else if (action === 'back') back();
    else if (action === 'pick-bag') pickBag(el.dataset.bag);
    else if (action === 'change-bag') changeBag();
    else if (action === 'discard-draft') discardDraft();
    else if (action === 'set-holes') setHoles(Number(el.dataset.holes));
    else if (action === 'set-paid') setPaid(el.dataset.paid === '1');
    else if (action === 'player-count') changePlayerCount(Number(el.dataset.delta));
    else if (action === 'pick-course') pickCourse(Number(el.dataset.index));
    else if (action === 'pick-player') pickPlayer(Number(el.dataset.slot), el.dataset.id);
    else if (action === 'clear-player') clearPlayer(Number(el.dataset.slot));
    else if (action === 'add-player') addPlayerToSlot(Number(el.dataset.slot), el.dataset.type);
    else if (action === 'open-loop') openLoop(el.dataset.id);
    else if (action === 'toggle-paid') togglePaid(el.dataset.id);
    else if (action === 'edit-loop') editLoop(el.dataset.id);
    else if (action === 'delete-loop') askDeleteLoop(el.dataset.id);
    else if (action === 'open-player') openPlayer(el.dataset.id);
    else if (action === 'new-player') startNewPlayer();
    else if (action === 'edit-player') editPlayer(el.dataset.id);
    else if (action === 'delete-player') askDeletePlayer(el.dataset.id);
    else if (action === 'set-player-type') setPlayerType(el.dataset.type);
    else if (action === 'year-prev') shiftYear(-1);
    else if (action === 'year-next') shiftYear(1);
    else if (action === 'log-expense') startExpense(null);
    else if (action === 'expense-log') push({ name: 'expense-log' });
    else if (action === 'open-expense') startExpense(el.dataset.id);
    else if (action === 'delete-expense') askDeleteExpense(el.dataset.id);
    else if (action === 'set-category') setCategory(el.dataset.category);
    else if (action === 'export-json') exportJson();
    else if (action === 'export-loops') exportLoopsCsv();
    else if (action === 'export-expenses') exportExpensesCsv();
    else if (action === 'choose-import') document.getElementById('import-file').click();
    else if (action === 'clear-data') askClear();
    else if (action === 'modal-cancel') closeModal();
    else if (action === 'modal-confirm') confirmModal();
    else if (action === 'go-loop') goTab('loop');
  }

  function onInput(event) {
    const t = event.target;
    if (!t || !t.id && !t.dataset) return;
    if (t.dataset && t.dataset.searchSlot != null && ui.loopDraft) {
      const slot = Number(t.dataset.searchSlot);
      ui.loopDraft.queries[slot] = t.value;
      if (event.type === 'input') updateSuggest(slot);
      return;
    }
    if (t.id === 'roster-search') {
      ui.rosterQuery = t.value;
      const list = document.getElementById('roster-list');
      if (list) list.innerHTML = rosterItemsHTML();
      const count = document.getElementById('roster-count');
      if (count) count.textContent = rosterCountLabel();
      return;
    }
    if (t.id === 'loop-base' || t.id === 'loop-tip') {
      if (ui.loopDraft) {
        if (t.id === 'loop-base') ui.loopDraft.base = t.value;
        if (t.id === 'loop-tip') ui.loopDraft.tip = t.value;
      }
      refreshTotal();
      return;
    }
    if (t.id === 'tax-input') updateTaxFrom(t, false);
    if (t.id === 'setting-tax') updateTaxFrom(t, false);
    if (t.id === 'setting-name') {
      state.settings.name = t.value.slice(0, 40);
      save();
    }
    if (t.id === 'import-file') {
      if (event.type !== 'change' || !t.files || !t.files[0]) return;
      const file = t.files[0];
      t.value = '';
      readImport(file);
    }
  }

  function onFocusIn(event) {
    const t = event.target;
    if (t && t.dataset && t.dataset.searchSlot != null) updateSuggest(Number(t.dataset.searchSlot));
  }

  function onFocusOut(event) {
    const t = event.target;
    if (!t) return;
    if (t.id === 'loop-base' || t.id === 'loop-tip') blurMoney(t);
    if (t.id === 'tax-input' || t.id === 'setting-tax') updateTaxFrom(t, true);
    if (t.dataset && t.dataset.searchSlot != null) {
      const slot = Number(t.dataset.searchSlot);
      setTimeout(() => {
        const active = document.activeElement;
        const still = active && active.dataset && (active.dataset.searchSlot === String(slot) || active.dataset.slot === String(slot));
        if (!still) updateSuggest(slot);
      }, 120);
    }
  }

  function onSubmit(event) {
    if (event.target.id === 'loop-form') {
      event.preventDefault();
      saveLoop();
    } else if (event.target.id === 'player-form') {
      event.preventDefault();
      savePlayerForm();
    } else if (event.target.id === 'expense-form') {
      event.preventDefault();
      saveExpenseForm();
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && ui.modal) {
      event.preventDefault();
      closeModal();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target && event.target.matches && event.target.matches('[role="button"]')) {
      event.preventDefault();
      event.target.click();
    }
  }

  function goTab(tab) {
    ui.tab = tab;
    ui.stack = [];
    ui.route = { name: tab };
    ui.modal = null;
    render();
  }

  function push(route) {
    ui.stack.push(ui.route);
    ui.route = route;
    ui.modal = null;
    render();
  }

  function back() {
    ui.modal = null;
    ui.route = ui.stack.pop() || { name: ui.tab };
    render();
  }

  function routeKey() {
    const r = ui.route;
    return r.name + ':' + (r.id || '');
  }

  function render() {
    const focus = snapshotFocus();
    captureOpenForms();
    persistDraft();
    const scroll = ui.keepScroll ? ui.scrollTop : 0;
    ui.keepScroll = false;
    const key = routeKey();
    const animate = key !== ui.lastKey;
    ui.lastKey = key;
    backBtn.classList.toggle('is-invisible', ui.stack.length === 0);
    settingsBtn.setAttribute('aria-pressed', ui.route.name === 'settings' ? 'true' : 'false');
    document.querySelectorAll('.tab').forEach((tab) => {
      const on = tab.dataset.tab === ui.tab && ui.route.name !== 'settings';
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    main.innerHTML = `<div class="screen${animate ? ' rise' : ''}">${screenHTML()}</div>`;
    main.scrollTop = scroll;
    restoreFocus(focus);
    const alertEl = document.getElementById('form-error');
    if (alertEl) alertEl.scrollIntoView({ block: 'nearest' });
  }

  function screenHTML() {
    switch (ui.route.name) {
      case 'loop': return loopScreen();
      case 'recent': return recentScreen();
      case 'roster': return rosterScreen();
      case 'player': return playerScreen();
      case 'player-edit': return playerEditScreen();
      case 'revenue': return revenueScreen();
      case 'expense-edit': return expenseScreen();
      case 'expense-log': return expenseLogScreen();
      case 'settings': return settingsScreen();
      case 'loop-detail': return loopDetailScreen();
      default: return loopScreen();
    }
  }

  function loopScreen() {
    const d = ui.loopDraft;
    if (!d || !d.bagType) return loopChooser();
    return loopForm();
  }

  function bagSegment(current) {
    const item = (type, label) =>
      `<button type="button" data-action="pick-bag" data-bag="${type}" aria-pressed="${current === type ? 'true' : 'false'}">${label}</button>`;
    return `<div class="segment bag-segment" role="group" aria-label="Bag type">${item('single', 'Single')}${item('double', 'Double')}${item('forecaddie', 'Forecaddie')}</div>`;
  }

  function loopChooser() {
    const name = cleanName(state.settings.name);
    const dirty = ui.loopDraft && draftDirty(ui.loopDraft);
    return `
      <p class="eyebrow">${esc(formatFull(todayISO()))}</p>
      <h1 class="display">Welcome back</h1>
      ${name ? `<p class="display-name">${esc(name)}</p>` : ''}
      <p class="lede">What are you carrying today?</p>
      <div class="stack-lg">
        ${dirty ? '<p class="hint">Choose a bag to continue the loop you started.</p>' : ''}
        ${bagSegment(null)}
        <p class="hint">Single is one player. Double is two bags. Forecaddie is a group of 2 to 12.</p>
        ${dirty ? '<button type="button" class="btn-text" data-action="discard-draft">Discard this loop</button>' : ''}
      </div>`;
  }

  function loopForm() {
    const d = ui.loopDraft;
    return `
      <form id="loop-form" autocomplete="off" novalidate>
        <div class="card">
          <p class="kicker">${d.id ? 'Editing' : 'Bag'}</p>
          ${bagSegment(d.bagType)}
          ${d.error ? `<div class="alert" id="form-error" role="alert">${esc(d.error)}</div>` : ''}
          <label class="field">
            <span class="field-label">Date</span>
            <input id="loop-date" type="date" value="${esc(d.date)}" required>
          </label>
          <label class="field">
            <span class="field-label">Course</span>
            <input id="loop-course" type="text" maxlength="80" autocapitalize="words" autocomplete="off" placeholder="Where are you playing?" value="${esc(d.course)}">
          </label>
          ${courseChipsHTML()}
          <div id="player-slots">${slotsHTML()}</div>
        </div>
        <div id="preround">${preRoundHTML()}</div>
        <div class="card" style="margin-top:14px">
          <p class="kicker">The round</p>
          <div class="segment" role="group" aria-label="Holes">
            <button type="button" data-action="set-holes" data-holes="9" aria-pressed="${d.holes === 9 ? 'true' : 'false'}">9 holes</button>
            <button type="button" data-action="set-holes" data-holes="18" aria-pressed="${d.holes === 18 ? 'true' : 'false'}">18 holes</button>
          </div>
          <label class="field">
            <span class="field-label">Base pay</span>
            <span class="money-field">
              <span class="currency" aria-hidden="true">$</span>
              <input id="loop-base" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="10" placeholder="0.00" value="${esc(d.base)}">
            </span>
          </label>
          <label class="field">
            <span class="field-label">Tip</span>
            <span class="money-field">
              <span class="currency" aria-hidden="true">$</span>
              <input id="loop-tip" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="10" placeholder="0.00" value="${esc(d.tip)}">
            </span>
          </label>
          <div class="total-row">
            <span class="field-label">Total</span>
            <strong id="loop-total">${esc(totalLabel(d.base, d.tip))}</strong>
          </div>
          <div class="segment" role="group" aria-label="Paid">
            <button type="button" data-action="set-paid" data-paid="0" aria-pressed="${d.paid ? 'false' : 'true'}">Unpaid</button>
            <button type="button" data-action="set-paid" data-paid="1" aria-pressed="${d.paid ? 'true' : 'false'}">Paid</button>
          </div>
          <label class="field">
            <span class="field-label">Round notes</span>
            <textarea id="loop-notes" maxlength="4000" placeholder="Wind, pins, anything about the round">${esc(d.notes)}</textarea>
          </label>
        </div>
        <div class="savebar">
          <button type="submit" class="btn-primary">${d.id ? 'Save changes' : 'Save loop'}</button>
          <button type="button" class="btn-text" data-action="discard-draft">${d.id ? 'Cancel editing' : 'Discard'}</button>
        </div>
      </form>`;
  }

  function courseChipsHTML() {
    if (!state.courses.length) return '<p class="hint">Courses you use will be remembered here.</p>';
    return `<div class="chips">${state.courses.map((course, i) =>
      `<button type="button" class="chip" data-action="pick-course" data-index="${i}">${esc(course)}</button>`
    ).join('')}</div>`;
  }

  function slotsHTML() {
    const d = ui.loopDraft;
    let html = '';
    if (d.bagType === 'forecaddie') {
      html += `
        <div class="field">
          <span class="field-label">Players in the group</span>
          <div class="stepper">
            <button type="button" class="stepper-btn" data-action="player-count" data-delta="-1" aria-label="Fewer players" ${d.playerCount <= 2 ? 'disabled' : ''}>–</button>
            <strong id="player-count">${d.playerCount}</strong>
            <button type="button" class="stepper-btn" data-action="player-count" data-delta="1" aria-label="More players" ${d.playerCount >= MAX_FORE ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
    }
    d.slots.forEach((id, index) => {
      const player = id ? playerById(id) : null;
      html += `<p class="field-label slot-label">Player ${index + 1}</p>`;
      if (player) {
        html += `
          <div class="picked">
            <div>
              <strong>${esc(player.name)}</strong>
              <div class="meta" style="margin:2px 0 0">${esc(typeLabel(player.type))}${player.handicap ? ' · ' + esc(player.handicap) : ''}</div>
            </div>
            <button type="button" class="remove" data-action="clear-player" data-slot="${index}">Remove</button>
          </div>`;
      } else {
        html += `
          <input id="slot-search-${index}" data-search-slot="${index}" type="text" maxlength="80" autocapitalize="words" autocomplete="off" placeholder="Search or add a player" value="${esc(d.queries[index] || '')}">
          <div data-suggest-for="${index}">${suggestHTML(index)}</div>`;
      }
    });
    return html;
  }

  function suggestHTML(slotIndex) {
    const d = ui.loopDraft;
    if (!d) return '';
    const q = (d.queries[slotIndex] || '').trim();
    const active = document.activeElement;
    const focused = !!(active && active.dataset && active.dataset.searchSlot === String(slotIndex));
    const taken = new Set(d.slots.filter(Boolean));
    if (!q && !focused) return '<p class="hint">Search your roster, or type a new name.</p>';
    let matches;
    if (!q) {
      const recentIds = recentPlayerIds().filter((id) => !taken.has(id));
      matches = recentIds.map(playerById).filter(Boolean).slice(0, 6);
      if (!matches.length) matches = state.players.filter((p) => !taken.has(p.id)).slice(0, 6);
    } else {
      const nq = q.toLowerCase();
      matches = state.players.filter((p) => !taken.has(p.id) && p.name.toLowerCase().includes(nq)).slice(0, 6);
    }
    let html = '';
    if (!q && !matches.length) return '<p class="hint">Type a name to add someone new.</p>';
    if (matches.length) {
      html += '<div class="suggest" role="listbox">';
      if (!q) html += '<p class="hint">Recent players</p>';
      matches.forEach((p) => {
        html += `<button type="button" class="suggest-item" data-action="pick-player" data-slot="${slotIndex}" data-id="${esc(p.id)}">
          <span>${esc(p.name)}</span>
          <span class="pill">${esc(typeLabel(p.type))}${p.handicap ? ' · ' + esc(p.handicap) : ''}</span>
        </button>`;
      });
      html += '</div>';
    }
    const exact = q && state.players.some((p) => p.name.toLowerCase() === q.toLowerCase());
    if (q && !exact) {
      html += `<div class="add-inline">
        <p>Add <strong>${esc(q)}</strong> to the roster</p>
        <div class="row-gap">
          <button type="button" class="btn-ghost" data-action="add-player" data-slot="${slotIndex}" data-type="member">Member</button>
          <button type="button" class="btn-ghost" data-action="add-player" data-slot="${slotIndex}" data-type="guest">Guest</button>
        </div>
      </div>`;
    } else if (q && !matches.length) {
      html += '<p class="hint">Already on this loop.</p>';
    }
    return html;
  }

  function updateSuggest(slot) {
    const box = document.querySelector(`[data-suggest-for="${slot}"]`);
    if (box) box.innerHTML = suggestHTML(slot);
  }

  function preRoundHTML() {
    const d = ui.loopDraft;
    if (!d) return '';
    const players = d.slots.map(playerById).filter(Boolean);
    if (!players.length) return '';
    const blocks = players.map((p) => {
      const filled = NOTE_FIELDS.filter(([key]) => (p.notes[key] || '').trim());
      const body = filled.length
        ? filled.map(([key, label]) => `<div class="note-block"><p class="field-label">${esc(label)}</p><p class="note-body">${esc(p.notes[key])}</p></div>`).join('')
        : '<p class="hint">No notes yet. Add them from the roster before you go out.</p>';
      return `<div class="note-block"><h3 class="player-title" style="font-size:28px">${esc(p.name)}</h3><p class="meta">${esc(typeLabel(p.type))}${p.handicap ? ' · Handicap ' + esc(p.handicap) : ''}</p>${body}</div>`;
    }).join('');
    return `<section class="card" style="margin-top:14px" aria-label="Pre-round notes"><p class="kicker">Pre-round notes</p>${blocks}</section>`;
  }

  function recentScreen() {
    const groups = groupedLoops();
    if (!groups.length) {
      return `<div class="empty">
        <h2>No loops yet</h2>
        <p class="lede">When you log a round, it will show up here, newest first.</p>
        <div style="margin-top:18px"><button type="button" class="btn-primary" data-action="go-loop">Log a loop</button></div>
      </div>`;
    }
    const count = state.loops.length;
    let html = `<p class="eyebrow">History</p><h1 class="display">Recent</h1><p class="lede">${count} ${count === 1 ? 'loop' : 'loops'}</p>`;
    groups.forEach((group) => {
      html += `<h2 class="month-label">${esc(group.label)}</h2><div class="stack">`;
      group.items.forEach((loop) => {
        const names = loopPlayerLabels(loop).join(', ');
        html += `<article class="loop-card" role="button" tabindex="0" data-action="open-loop" data-id="${esc(loop.id)}">
          <div class="loop-top"><span>${esc(formatMedium(loop.date))}</span></div>
          <div class="course-name" style="margin-top:4px">${esc(loop.course)}</div>
          <div class="meta">${esc(names)}</div>
          <div class="row-between" style="margin-top:8px">
            <span class="meta">${loop.holes} · ${esc(bagLabel(loop.bagType))}</span>
            <span class="money" style="font-size:28px">${esc(formatMoney(loopTotal(loop)))}</span>
          </div>
          <button type="button" class="badge ${loop.paid ? 'paid' : 'unpaid'}" data-action="toggle-paid" data-id="${esc(loop.id)}" aria-label="${loop.paid ? 'Mark unpaid' : 'Mark paid'}">${loop.paid ? 'Paid' : 'Unpaid'}</button>
        </article>`;
      });
      html += '</div>';
    });
    return html;
  }

  function loopDetailScreen() {
    const loop = loopById(ui.route.id);
    if (!loop) return missing('That loop is gone.');
    const names = loopPlayerLabels(loop);
    return `
      <p class="eyebrow">${esc(formatFull(loop.date))}</p>
      <h1 class="display">${esc(loop.course)}</h1>
      <p class="lede">${loop.holes} holes · ${esc(bagLabel(loop.bagType))}</p>
      <div class="card" style="margin-top:16px">
        <p class="kicker">Players</p>
        <p class="note-body">${esc(names.join(', '))}</p>
        <div class="line"><span>Base pay</span><span class="money">${esc(formatMoney(loop.basePayCents))}</span></div>
        <div class="line"><span>Tip</span><span class="money">${esc(formatMoney(loop.tipCents))}</span></div>
        <div class="line"><span>Total</span><span class="money">${esc(formatMoney(loopTotal(loop)))}</span></div>
        <div style="margin-top:12px">
          <button type="button" class="badge ${loop.paid ? 'paid' : 'unpaid'}" data-action="toggle-paid" data-id="${esc(loop.id)}" aria-label="${loop.paid ? 'Mark unpaid' : 'Mark paid'}">${loop.paid ? 'Paid' : 'Unpaid'}</button>
        </div>
        ${loop.notes ? `<p class="kicker" style="margin-top:16px">Round notes</p><p class="note-body">${esc(loop.notes)}</p>` : ''}
      </div>
      <div class="stack" style="margin-top:14px">
        <button type="button" class="btn-primary" data-action="edit-loop" data-id="${esc(loop.id)}">Edit loop</button>
        <button type="button" class="btn-danger" data-action="delete-loop" data-id="${esc(loop.id)}">Delete loop</button>
      </div>`;
  }

  function rosterScreen() {
    const players = filteredPlayers();
    return `
      <p class="eyebrow">Players</p>
      <h1 class="display">Roster</h1>
      <p class="lede" id="roster-count">${esc(rosterCountLabel())}</p>
      <label class="field">
        <span class="field-label">Search</span>
        <input id="roster-search" type="search" maxlength="80" autocomplete="off" placeholder="Find a player" value="${esc(ui.rosterQuery)}">
      </label>
      <div id="roster-list" class="stack" style="margin-top:14px">${rosterItemsHTML()}</div>
      ${players.length || ui.rosterQuery ? '' : ''}
      <div style="margin-top:16px"><button type="button" class="btn-secondary" data-action="new-player">Add a player</button></div>`;
  }

  function rosterCountLabel() {
    const n = state.players.length;
    if (!n) return 'No one on the roster yet.';
    return n === 1 ? '1 player' : n + ' players';
  }

  function rosterItemsHTML() {
    const players = filteredPlayers();
    if (!state.players.length) {
      return `<div class="empty" style="padding-top:12px"><h2>No players yet</h2><p class="lede">Add someone here, or type a new name while you log a loop.</p></div>`;
    }
    if (!players.length) return '<p class="hint">No players match that search.</p>';
    return players.map((p) => {
      const preview = firstNote(p);
      return `<article class="player-card" role="button" tabindex="0" data-action="open-player" data-id="${esc(p.id)}">
        <div class="row-between">
          <span class="player-name">${esc(p.name)}</span>
          <span class="pill">${esc(typeLabel(p.type))}</span>
        </div>
        <p class="meta">${p.handicap ? 'Handicap ' + esc(p.handicap) : 'Handicap not set'}${preview ? ' · ' + esc(preview) : ''}</p>
      </article>`;
    }).join('');
  }

  function playerScreen() {
    const p = playerById(ui.route.id);
    if (!p) return missing('That player is no longer on the roster.');
    const filled = NOTE_FIELDS.filter(([key]) => (p.notes[key] || '').trim());
    const empty = NOTE_FIELDS.filter(([key]) => !(p.notes[key] || '').trim()).map(([, label]) => label);
    const notes = filled.length
      ? filled.map(([key, label]) => `<div class="note-block"><p class="field-label">${esc(label)}</p><p class="note-body">${esc(p.notes[key])}</p></div>`).join('')
      : '<p class="note-body">No notes yet. This is the page to open before a round — add yardages, reads, and what they drink.</p>';
    const stats = playerStats(p.id);
    const history = stats.loops.map((loop) => `
      <button type="button" class="history-item" data-action="open-loop" data-id="${esc(loop.id)}">
        <span><span class="meta">${esc(formatMedium(loop.date))}</span><br><strong>${esc(loop.course)}</strong></span>
        <span class="money" style="font-size:24px">${esc(formatMoney(loopTotal(loop)))}</span>
      </button>`).join('');
    return `
      <p class="eyebrow">${esc(typeLabel(p.type))}${p.handicap ? ' · Handicap ' + esc(p.handicap) : ''}</p>
      <h1 class="player-title">${esc(p.name)}</h1>
      <section class="card" style="margin-top:16px" aria-label="Notes">
        <p class="kicker">Notes</p>
        ${notes}
        ${empty.length && filled.length ? `<p class="hint">Nothing noted for ${esc(empty.join(', ').replace(/, ([^,]*)$/, ' or $1'))}.</p>` : ''}
      </section>
      <h2 class="subhead">With you</h2>
      <div class="stats">
        <div class="stat"><span>Loops</span><strong>${stats.loops.length}</strong></div>
        <div class="stat"><span>Earned</span><strong>${esc(formatMoney(stats.earned))}</strong></div>
        <div class="stat"><span>Avg tip</span><strong>${stats.loops.length ? esc(formatMoney(stats.avgTip)) : '—'}</strong></div>
      </div>
      <h2 class="subhead">Loop history</h2>
      <div class="card">${history || '<p class="hint">No loops with this player yet.</p>'}</div>
      <div class="stack" style="margin-top:14px">
        <button type="button" class="btn-primary" data-action="edit-player" data-id="${esc(p.id)}">Edit player</button>
        <button type="button" class="btn-danger" data-action="delete-player" data-id="${esc(p.id)}">Delete player</button>
      </div>`;
  }

  function playerEditScreen() {
    const d = ui.playerDraft;
    if (!d) return missing('Nothing to edit.');
    const fields = NOTE_FIELDS.map(([key, label, hint]) => `
      <label class="field">
        <span class="field-label">${esc(label)}</span>
        <textarea id="note-${key}" maxlength="4000" placeholder="${esc(hint)}">${esc(d.notes[key] || '')}</textarea>
      </label>`).join('');
    return `
      <form id="player-form" autocomplete="off" novalidate>
        <p class="eyebrow">${d.id ? 'Edit player' : 'New player'}</p>
        <h1 class="display">${d.id ? 'Update' : 'Add'}</h1>
        ${d.error ? `<div class="alert" id="form-error" role="alert">${esc(d.error)}</div>` : ''}
        <div class="card" style="margin-top:14px">
          <label class="field">
            <span class="field-label">Name</span>
            <input id="player-name" type="text" maxlength="80" autocapitalize="words" autocomplete="name" required value="${esc(d.name)}">
          </label>
          <div class="segment" role="group" aria-label="Member or guest">
            <button type="button" data-action="set-player-type" data-type="member" aria-pressed="${d.type === 'member' ? 'true' : 'false'}">Member</button>
            <button type="button" data-action="set-player-type" data-type="guest" aria-pressed="${d.type === 'guest' ? 'true' : 'false'}">Guest</button>
          </div>
          <label class="field">
            <span class="field-label">Handicap</span>
            <input id="player-handicap" type="text" maxlength="16" autocomplete="off" placeholder="Index, if you know it" value="${esc(d.handicap)}">
          </label>
          ${fields}
        </div>
        <div class="savebar">
          <button type="submit" class="btn-primary">Save player</button>
        </div>
      </form>`;
  }

  function revenueScreen() {
    const year = clampYear(ui.year);
    ui.year = year;
    const current = new Date().getFullYear();
    const [weekStart, weekEnd] = weekRange(new Date());
    const [monthStart, monthEnd] = monthRange(new Date());
    const yearLoops = state.loops.filter((l) => inYear(l.date, year));
    const yearExpenses = state.expenses.filter((e) => inYear(e.date, year));
    const base = sum(yearLoops, (l) => l.basePayCents);
    const tips = sum(yearLoops, (l) => l.tipCents);
    const revenue = base + tips;
    ui.yearRevenueCents = revenue;
    const expenseTotal = sum(yearExpenses, (e) => e.amountCents);
    const net = revenue - expenseTotal;
    const weekIncome = sum(state.loops.filter((l) => l.date >= weekStart && l.date <= weekEnd), loopTotal);
    const monthIncome = sum(state.loops.filter((l) => l.date >= monthStart && l.date <= monthEnd), loopTotal);
    const unpaid = sum(yearLoops.filter((l) => !l.paid), loopTotal);
    const avgLoop = yearLoops.length ? divRound(revenue, yearLoops.length) : 0;
    const avgTip = yearLoops.length ? divRound(tips, yearLoops.length) : 0;
    const months = monthTotals(year);
    const tax = state.settings.taxPercent;
    const setAside = applyPercent(revenue, tax);
    const emptyYear = !yearLoops.length && !yearExpenses.length;
    const years = dataYears();
    const tops = topPlayers(year);
    return `
      <div class="year-switch">
        <button type="button" data-action="year-prev" aria-label="Previous year" ${year <= years[0] ? 'disabled' : ''}>‹</button>
        <span id="year-label">${year}</span>
        <button type="button" data-action="year-next" aria-label="Next year" ${year >= years[years.length - 1] ? 'disabled' : ''}>›</button>
      </div>
      <p class="eyebrow" style="margin-top:14px">${year === current ? 'Year to date' : 'Full year'}</p>
      <p class="hero-num${net < 0 ? ' negative' : ''}" id="net-income">${esc(formatMoney(net))}</p>
      <p class="lede">Net income · after expenses</p>
      ${emptyYear ? `<p class="hint">No income or expenses for ${year} yet.</p>` : ''}
      <p class="section-label" style="margin-top:18px">Income before expenses</p>
      <div class="periods" style="margin-top:8px">
        <article class="period"><span>This week</span><strong id="period-week">${esc(formatMoney(weekIncome))}</strong><small>${esc(formatShortRange(weekStart, weekEnd))}</small></article>
        <article class="period"><span>This month</span><strong id="period-month">${esc(formatMoney(monthIncome))}</strong><small>${esc(parseISO(monthStart).toLocaleDateString('en-US', { month: 'long' }))}</small></article>
        <article class="period"><span>${year}</span><strong id="period-year">${esc(formatMoney(revenue))}</strong><small>Before expenses</small></article>
      </div>
      <div class="card" style="margin-top:14px">
        <p class="kicker">${year} ledger</p>
        <div class="line"><span>Base rates</span><span class="money" id="line-base">${esc(formatMoney(base))}</span></div>
        <div class="line"><span>Tips</span><span class="money" id="line-tips">${esc(formatMoney(tips))}</span></div>
        <div class="line"><span>Total revenue</span><span class="money" id="line-revenue">${esc(formatMoney(revenue))}</span></div>
        <div class="line"><span>Expenses</span><span class="money" id="line-expenses">${esc(formatMoney(expenseTotal))}</span></div>
      </div>
      <div class="card" style="margin-top:14px">
        <p class="kicker">Tax set-aside</p>
        <label class="field">
          <span class="field-label">Percent of total revenue</span>
          <div class="tax-row">
            <input id="tax-input" type="text" inputmode="decimal" maxlength="5" aria-label="Tax set-aside percent" value="${esc(formatPercent(tax))}">
            <span>%</span>
          </div>
        </label>
        <div class="set-aside">
          <span class="field-label">Suggested set-aside</span>
          <div><strong id="tax-amount">${esc(formatMoney(setAside))}</strong></div>
          <p class="fine" id="tax-basis">${esc(formatPercent(tax))}% of total revenue</p>
        </div>
      </div>
      <h2 class="subhead">By month</h2>
      <div class="card">${monthTableHTML(months)}</div>
      <h2 class="subhead">Monthly earnings</h2>
      <div class="card">${chartSVG(months.rev, year)}</div>
      <h2 class="subhead">Averages</h2>
      <div class="stats">
        <div class="stat"><span>Per loop</span><strong id="avg-loop">${yearLoops.length ? esc(formatMoney(avgLoop)) : '—'}</strong></div>
        <div class="stat"><span>Avg tip</span><strong id="avg-tip">${yearLoops.length ? esc(formatMoney(avgTip)) : '—'}</strong></div>
        <div class="stat owed"><span>Still owed</span><strong id="still-owed">${esc(formatMoney(unpaid))}</strong></div>
      </div>
      <h2 class="subhead">Top players</h2>
      <div class="card" id="top-players">${topsHTML(tops)}</div>
      <div class="stack" style="margin-top:16px">
        <button type="button" class="btn-primary" data-action="log-expense">Log an expense</button>
        <button type="button" class="btn-secondary" data-action="expense-log">Expense log</button>
      </div>`;
  }

  function monthTableHTML(months) {
    let run = 0;
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rows = labels.map((label, i) => {
      const net = months.rev[i] - months.exp[i];
      run += net;
      return `<tr><th scope="row">${label}</th><td>${esc(formatMoney(months.rev[i]))}</td><td>${esc(formatMoney(months.exp[i]))}</td><td>${esc(formatMoney(net))}</td><td>${esc(formatMoney(run))}</td></tr>`;
    }).join('');
    return `<div class="table-scroll"><table>
      <caption>Running total is cumulative net for the year.</caption>
      <thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Net</th><th>Running</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function chartSVG(rev, year) {
    const w = 360;
    const h = 196;
    const padL = 6;
    const padR = 6;
    const padT = 12;
    const padB = 28;
    const innerH = h - padT - padB;
    const max = Math.max(...rev, 1);
    const gap = 8;
    const barW = (w - padL - padR - gap * 11) / 12;
    const current = new Date().getFullYear() === year ? new Date().getMonth() : -1;
    const labels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let shapes = `<line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="rgba(255,255,255,0.16)" stroke-width="1"></line>`;
    for (let i = 0; i < 12; i++) {
      const bh = Math.max(2, Math.round((rev[i] / max) * (innerH - 4)));
      const x = padL + i * (barW + gap);
      const y = padT + innerH - bh;
      const fill = i === current ? '#f5f7fb' : '#c5d0e0';
      const opacity = rev[i] === 0 ? 0.22 : (i === current ? 1 : 0.55);
      const radius = Math.min(7, barW / 2);
      shapes += `<rect x="${x.toFixed(2)}" y="${y}" width="${barW.toFixed(2)}" height="${bh}" rx="${radius}" fill="${fill}" fill-opacity="${opacity}"><title>${full[i]}: ${formatMoney(rev[i])}</title></rect>`;
      shapes += `<text class="chart-label" x="${(x + barW / 2).toFixed(2)}" y="${h - 8}" text-anchor="middle">${labels[i]}</text>`;
    }
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Monthly earnings for ${year}">${shapes}</svg>`;
  }

  function topsHTML(tops) {
    if (!tops.length) return '<p class="hint">Player earnings show up here after you log a loop.</p>';
    return `<ol class="top-list">${tops.map((row, i) => {
      const p = playerById(row.id);
      return `<li><span class="rank">${i + 1}</span><span><strong>${esc(p.name)}</strong><br><span class="meta">${row.loops} ${row.loops === 1 ? 'loop' : 'loops'}</span></span><span class="money" style="font-size:22px">${esc(formatMoney(row.earned))}</span></li>`;
    }).join('')}</ol>`;
  }

  function expenseScreen() {
    const d = ui.expenseDraft;
    if (!d) return missing('Nothing to edit.');
    const cats = CATEGORIES.map(([key, label]) =>
      `<button type="button" data-action="set-category" data-category="${key}" aria-pressed="${d.category === key ? 'true' : 'false'}">${label}</button>`
    ).join('');
    return `
      <form id="expense-form" autocomplete="off" novalidate>
        <p class="eyebrow">${d.id ? 'Edit expense' : 'New expense'}</p>
        <h1 class="display">${d.id ? 'Update' : 'Log it'}</h1>
        ${d.error ? `<div class="alert" id="form-error" role="alert">${esc(d.error)}</div>` : ''}
        <div class="card" style="margin-top:14px">
          <label class="field">
            <span class="field-label">Date</span>
            <input id="expense-date" type="date" required value="${esc(d.date)}">
          </label>
          <label class="field">
            <span class="field-label">Amount</span>
            <span class="money-field">
              <span class="currency" aria-hidden="true">$</span>
              <input id="expense-amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="10" placeholder="0.00" value="${esc(d.amount)}">
            </span>
          </label>
          <p class="field-label" style="margin-top:14px">Category</p>
          <div class="segment" role="group" aria-label="Category">${cats}</div>
          <label class="field">
            <span class="field-label">Note</span>
            <textarea id="expense-note" maxlength="500" placeholder="Optional">${esc(d.note)}</textarea>
          </label>
        </div>
        <div class="savebar">
          <button type="submit" class="btn-primary">${d.id ? 'Save changes' : 'Save expense'}</button>
          ${d.id ? `<button type="button" class="btn-danger" data-action="delete-expense" data-id="${esc(d.id)}">Delete expense</button>` : ''}
        </div>
      </form>`;
  }

  function expenseLogScreen() {
    const items = [...state.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    if (!items.length) {
      return `<div class="empty"><h2>No expenses</h2><p class="lede">Gear, travel, uniforms — log them and they come off net income.</p>
        <div style="margin-top:18px"><button type="button" class="btn-primary" data-action="log-expense">Log an expense</button></div></div>`;
    }
    const rows = items.map((e) => `
      <article class="expense-card" role="button" tabindex="0" data-action="open-expense" data-id="${esc(e.id)}">
        <div class="row-between">
          <span class="meta">${esc(formatMedium(e.date))} · ${esc(categoryLabel(e.category))}</span>
          <span class="money" style="font-size:26px">${esc(formatMoney(e.amountCents))}</span>
        </div>
        ${e.note ? `<p class="meta">${esc(e.note)}</p>` : ''}
      </article>`).join('');
    return `<p class="eyebrow">Spending</p><h1 class="display">Expenses</h1><div class="stack" style="margin-top:16px">${rows}</div>
      <div style="margin-top:16px"><button type="button" class="btn-primary" data-action="log-expense">Log an expense</button></div>`;
  }

  function settingsScreen() {
    const tax = formatPercent(state.settings.taxPercent);
    return `
      <p class="eyebrow">This phone</p>
      <h1 class="display">Settings</h1>
      <div class="card" style="margin-top:16px">
        <label class="field">
          <span class="field-label">Your name</span>
          <input id="setting-name" type="text" maxlength="40" autocomplete="name" autocapitalize="words" placeholder="For the greeting" value="${esc(state.settings.name)}">
        </label>
        <label class="field">
          <span class="field-label">Tax set-aside %</span>
          <input id="setting-tax" type="text" inputmode="decimal" maxlength="5" value="${esc(tax)}">
        </label>
        <p class="hint">Used on the revenue tab. Default is 25% of total revenue.</p>
      </div>
      <h2 class="subhead">Backup</h2>
      <div class="stack">
        <button type="button" class="btn-secondary" data-action="export-json">Export backup</button>
        <button type="button" class="btn-secondary" data-action="choose-import">Import backup</button>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
        <button type="button" class="btn-secondary" data-action="export-loops">Export loops CSV</button>
        <button type="button" class="btn-secondary" data-action="export-expenses">Export expenses CSV</button>
      </div>
      <h2 class="subhead">Danger</h2>
      <button type="button" class="btn-danger" data-action="clear-data">Clear all data</button>
      <p class="credit">Course photograph by <a href="https://commons.wikimedia.org/wiki/File:Southerndown_Golf_Club_-_2nd_green_(geograph_6274427).jpg" target="_blank" rel="noopener">Alan Hughes</a>, Southerndown Golf Club — 2nd green. Licensed CC BY-SA 2.0. Resized and compressed for offline use. Type is Plus Jakarta Sans, used under the SIL Open Font License.</p>`;
  }

  function missing(text) {
    return `<div class="empty"><h2>Missing</h2><p class="lede">${esc(text)}</p></div>`;
  }

  function pickBag(type) {
    if (!ui.loopDraft) ui.loopDraft = newDraft();
    applyBag(type);
    render();
  }

  function applyBag(type) {
    const d = ui.loopDraft;
    d.bagType = type;
    d.error = '';
    const n = type === 'forecaddie' ? clamp(d.playerCount || 3, 2, MAX_FORE) : (type === 'double' ? 2 : 1);
    d.playerCount = n;
    const old = d.slots || [];
    d.slots = Array.from({ length: n }, (_, i) => old[i] || null);
    d.queries = Array.from({ length: n }, (_, i) => (d.queries && d.queries[i]) || '');
  }

  function changeBag() {
    captureLoopForm();
    if (ui.loopDraft) ui.loopDraft.bagType = null;
    render();
  }

  function discardDraft() {
    const editing = ui.loopDraft && ui.loopDraft.id;
    const returnTo = editing ? { name: 'loop-detail', id: ui.loopDraft.id } : null;
    ui.loopDraft = null;
    persistDraft();
    if (returnTo && loopById(returnTo.id)) {
      ui.stack = [];
      ui.tab = 'recent';
      ui.route = returnTo;
    } else {
      ui.route = { name: 'loop' };
      ui.tab = 'loop';
    }
    render();
  }

  function setHoles(holes) {
    if (!ui.loopDraft) return;
    ui.loopDraft.holes = holes === 9 ? 9 : 18;
    document.querySelectorAll('[data-action="set-holes"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', Number(btn.dataset.holes) === ui.loopDraft.holes ? 'true' : 'false');
    });
    persistDraft();
  }

  function setPaid(paid) {
    if (!ui.loopDraft) return;
    ui.loopDraft.paid = paid;
    document.querySelectorAll('[data-action="set-paid"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', (btn.dataset.paid === '1') === paid ? 'true' : 'false');
    });
    persistDraft();
  }

  function changePlayerCount(delta) {
    captureLoopForm();
    const d = ui.loopDraft;
    if (!d || d.bagType !== 'forecaddie') return;
    const next = clamp(d.playerCount + delta, 2, MAX_FORE);
    if (next === d.playerCount) return;
    d.playerCount = next;
    if (next > d.slots.length) {
      while (d.slots.length < next) {
        d.slots.push(null);
        d.queries.push('');
      }
    } else {
      d.slots = d.slots.slice(0, next);
      d.queries = d.queries.slice(0, next);
    }
    renderSlots();
  }

  function renderSlots() {
    const wrap = document.getElementById('player-slots');
    if (wrap) wrap.innerHTML = slotsHTML();
    const pre = document.getElementById('preround');
    if (pre) pre.innerHTML = preRoundHTML();
    persistDraft();
  }

  function pickCourse(index) {
    const name = state.courses[index];
    if (!name || !ui.loopDraft) return;
    ui.loopDraft.course = name;
    const input = document.getElementById('loop-course');
    if (input) input.value = name;
    persistDraft();
  }

  function pickPlayer(slot, id) {
    captureLoopForm();
    const d = ui.loopDraft;
    if (!d || !playerById(id)) return;
    if (d.slots.some((existing, i) => existing === id && i !== slot)) {
      d.error = 'That player is already on this loop.';
      render();
      return;
    }
    d.slots[slot] = id;
    d.queries[slot] = '';
    d.error = '';
    renderSlots();
  }

  function clearPlayer(slot) {
    captureLoopForm();
    if (!ui.loopDraft) return;
    ui.loopDraft.slots[slot] = null;
    ui.loopDraft.queries[slot] = '';
    renderSlots();
  }

  function addPlayerToSlot(slot, type) {
    captureLoopForm();
    const d = ui.loopDraft;
    const input = document.querySelector(`[data-search-slot="${slot}"]`);
    const name = cleanName(input ? input.value : (d.queries[slot] || ''));
    if (!name) {
      d.error = 'Type a name to add.';
      render();
      return;
    }
    let player = state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!player) player = createPlayer({ name, type });
    if (d.slots.includes(player.id)) {
      d.error = 'That player is already on this loop.';
      render();
      return;
    }
    d.slots[slot] = player.id;
    d.queries[slot] = '';
    d.error = '';
    renderSlots();
  }

  function saveLoop() {
    captureLoopForm();
    const d = ui.loopDraft;
    const error = validateLoop(d);
    if (error) {
      d.error = error;
      render();
      return;
    }
    const course = cleanName(d.course);
    const base = parseMoneyToCents(d.base);
    const tip = parseMoneyToCents(d.tip.trim() === '' ? '0' : d.tip);
    const players = d.slots.map(playerById);
    const now = new Date().toISOString();
    const existing = d.id ? loopById(d.id) : null;
    const record = {
      id: d.id || uid(),
      date: d.date,
      course,
      bagType: d.bagType,
      holes: d.holes === 9 ? 9 : 18,
      playerIds: players.map((p) => p.id),
      playerNames: players.map((p) => p.name),
      basePayCents: base,
      tipCents: tip,
      paid: !!d.paid,
      notes: d.notes.trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    if (existing) {
      const index = state.loops.findIndex((l) => l.id === record.id);
      state.loops[index] = record;
    } else state.loops.push(record);
    rememberCourse(course);
    save();
    ui.loopDraft = null;
    persistDraft();
    toast(existing ? 'Loop updated' : 'Loop saved');
    ui.stack = [];
    ui.tab = 'recent';
    ui.route = existing ? { name: 'loop-detail', id: record.id } : { name: 'recent' };
    render();
  }

  function validateLoop(d) {
    if (!d || !d.bagType) return 'Choose a bag type.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return 'Choose a date.';
    const course = cleanName(d.course || '');
    if (!course) return 'Add the course.';
    if (d.slots.some((id) => !id)) return 'Add every player for this loop.';
    if (d.slots.some((id) => !playerById(id))) return 'One of those players is no longer on your roster.';
    if (new Set(d.slots).size !== d.slots.length) return 'A player is listed twice.';
    const base = parseMoneyToCents(d.base);
    const tip = parseMoneyToCents((d.tip || '').trim() === '' ? '0' : d.tip);
    if (base == null || base < 0) return 'Enter base pay as a number, like 150 or 150.00.';
    if (tip == null || tip < 0) return 'Enter the tip as a number, or leave it blank.';
    if (base > 999999999 || tip > 999999999) return 'That amount is too large.';
    return null;
  }

  function openLoop(id) {
    if (!loopById(id)) return;
    push({ name: 'loop-detail', id });
  }

  function editLoop(id) {
    const loop = loopById(id);
    if (!loop) return;
    const start = () => {
      ui.loopDraft = draftFromLoop(loop);
      ui.tab = 'loop';
      ui.stack = [{ name: 'loop-detail', id: loop.id }];
      ui.route = { name: 'loop' };
      render();
    };
    if (ui.loopDraft && !ui.loopDraft.id && draftDirty(ui.loopDraft)) {
      openModal({
        title: 'Discard the loop you were writing?',
        body: 'You have a new loop that has not been saved.',
        confirmLabel: 'Discard it',
        danger: true,
        onConfirm: start,
      });
      return;
    }
    start();
  }

  function togglePaid(id) {
    const loop = loopById(id);
    if (!loop) return;
    loop.paid = !loop.paid;
    loop.updatedAt = new Date().toISOString();
    save();
    toast(loop.paid ? 'Marked paid' : 'Marked unpaid');
    ui.keepScroll = true;
    ui.scrollTop = main.scrollTop;
    render();
  }

  function askDeleteLoop(id) {
    const loop = loopById(id);
    if (!loop) return;
    openModal({
      title: 'Delete this loop?',
      body: `${formatMedium(loop.date)} at ${loop.course} will be removed from Recent and from your revenue.`,
      confirmLabel: 'Delete loop',
      danger: true,
      onConfirm: () => {
        state.loops = state.loops.filter((l) => l.id !== id);
        if (ui.loopDraft && ui.loopDraft.id === id) ui.loopDraft = null;
        save();
        toast('Loop deleted');
        ui.stack = [];
        ui.tab = 'recent';
        ui.route = { name: 'recent' };
        render();
      },
    });
  }

  function openPlayer(id) {
    if (!playerById(id)) return;
    push({ name: 'player', id });
  }

  function startNewPlayer() {
    ui.playerDraft = { id: null, name: '', type: 'member', handicap: '', notes: blankNotes(), error: '' };
    push({ name: 'player-edit', id: null });
  }

  function editPlayer(id) {
    const p = playerById(id);
    if (!p) return;
    ui.playerDraft = {
      id: p.id,
      name: p.name,
      type: p.type,
      handicap: p.handicap || '',
      notes: Object.assign(blankNotes(), p.notes),
      error: '',
    };
    push({ name: 'player-edit', id });
  }

  function setPlayerType(type) {
    if (!ui.playerDraft) return;
    ui.playerDraft.type = type === 'guest' ? 'guest' : 'member';
    document.querySelectorAll('[data-action="set-player-type"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.type === ui.playerDraft.type ? 'true' : 'false');
    });
  }

  function savePlayerForm() {
    capturePlayerForm();
    const d = ui.playerDraft;
    const name = cleanName(d.name);
    if (!name) {
      d.error = 'Add a name.';
      render();
      return;
    }
    const notes = {};
    NOTE_FIELDS.forEach(([key]) => { notes[key] = (d.notes[key] || '').trim().slice(0, 4000); });
    const now = new Date().toISOString();
    let id = d.id;
    if (id) {
      const p = playerById(id);
      if (!p) return;
      p.name = name;
      p.type = d.type === 'guest' ? 'guest' : 'member';
      p.handicap = (d.handicap || '').trim().slice(0, 16);
      p.notes = notes;
      p.updatedAt = now;
      sortPlayers();
      save();
      toast('Player saved');
    } else {
      const p = createPlayer({
        name,
        type: d.type,
        handicap: (d.handicap || '').trim().slice(0, 16),
        notes,
      });
      id = p.id;
      toast('Player added');
    }
    if (ui.stack.length && ui.stack[ui.stack.length - 1].name === 'player' && ui.stack[ui.stack.length - 1].id === id) {
      ui.stack.pop();
    }
    ui.playerDraft = null;
    ui.route = { name: 'player', id };
    render();
  }

  function askDeletePlayer(id) {
    const p = playerById(id);
    if (!p) return;
    const count = state.loops.filter((l) => l.playerIds.includes(id)).length;
    openModal({
      title: `Delete ${p.name}?`,
      body: count
        ? `Their profile will be removed. ${count} past ${count === 1 ? 'loop stays' : 'loops stay'} in your history under the name you saved then.`
        : 'Their profile will be removed from the roster.',
      confirmLabel: 'Delete player',
      danger: true,
      onConfirm: () => {
        state.players = state.players.filter((player) => player.id !== id);
        if (ui.loopDraft) ui.loopDraft.slots = ui.loopDraft.slots.map((slot) => (slot === id ? null : slot));
        save();
        toast('Player removed');
        ui.stack = [];
        ui.tab = 'roster';
        ui.route = { name: 'roster' };
        render();
      },
    });
  }

  function shiftYear(delta) {
    const years = dataYears();
    const next = ui.year + delta;
    if (next < years[0] || next > years[years.length - 1]) return;
    ui.year = next;
    render();
  }

  function startExpense(id) {
    if (id) {
      const expense = expenseById(id);
      if (!expense) return;
      ui.expenseDraft = {
        id: expense.id,
        date: expense.date,
        amount: centsToInput(expense.amountCents),
        category: expense.category,
        note: expense.note || '',
        error: '',
      };
      if (ui.route.name === 'expense-log' || ui.route.name === 'revenue') push({ name: 'expense-edit', id });
      else {
        ui.route = { name: 'expense-edit', id };
        render();
      }
      return;
    }
    ui.expenseDraft = { id: null, date: todayISO(), amount: '', category: 'gear', note: '', error: '' };
    push({ name: 'expense-edit', id: null });
  }

  function setCategory(category) {
    if (!ui.expenseDraft) return;
    if (!CATEGORIES.some(([key]) => key === category)) return;
    ui.expenseDraft.category = category;
    document.querySelectorAll('[data-action="set-category"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.category === category ? 'true' : 'false');
    });
  }

  function saveExpenseForm() {
    captureExpenseForm();
    const d = ui.expenseDraft;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) {
      d.error = 'Choose a date.';
      render();
      return;
    }
    const amount = parseMoneyToCents(d.amount);
    if (amount == null || amount <= 0) {
      d.error = 'Enter an amount greater than zero.';
      render();
      return;
    }
    if (amount > 999999999) {
      d.error = 'That amount is too large.';
      render();
      return;
    }
    if (!CATEGORIES.some(([key]) => key === d.category)) {
      d.error = 'Choose a category.';
      render();
      return;
    }
    const now = new Date().toISOString();
    const existing = d.id ? expenseById(d.id) : null;
    const record = {
      id: d.id || uid(),
      date: d.date,
      amountCents: amount,
      category: d.category,
      note: (d.note || '').trim().slice(0, 500),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    if (existing) {
      const index = state.expenses.findIndex((e) => e.id === record.id);
      state.expenses[index] = record;
    } else state.expenses.push(record);
    save();
    ui.expenseDraft = null;
    toast(existing ? 'Expense updated' : 'Expense saved');
    ui.stack = ui.stack.filter((route) => route.name !== 'expense-edit' && route.name !== 'expense-log');
    ui.tab = 'revenue';
    ui.route = { name: 'expense-log' };
    render();
  }

  function askDeleteExpense(id) {
    const expense = expenseById(id);
    if (!expense) return;
    openModal({
      title: 'Delete this expense?',
      body: `${formatMoney(expense.amountCents)} for ${categoryLabel(expense.category)} will come off the log and back into net income.`,
      confirmLabel: 'Delete expense',
      danger: true,
      onConfirm: () => {
        state.expenses = state.expenses.filter((e) => e.id !== id);
        save();
        ui.expenseDraft = null;
        toast('Expense deleted');
        ui.stack = ui.stack.filter((route) => route.name !== 'expense-edit' && route.name !== 'expense-log');
        ui.tab = 'revenue';
        ui.route = { name: 'expense-log' };
        render();
      },
    });
  }

  function updateTaxFrom(input, commit) {
    const raw = input.value.trim();
    const value = Number(raw);
    const valid = raw !== '' && Number.isFinite(value) && value >= 0 && value <= 100;
    if (valid) {
      state.settings.taxPercent = Math.round(value * 10) / 10;
      save();
    }
    const amount = document.getElementById('tax-amount');
    const basis = document.getElementById('tax-basis');
    const percent = valid ? state.settings.taxPercent : null;
    if (amount) amount.textContent = percent == null ? '—' : formatMoney(applyPercent(ui.yearRevenueCents, percent));
    if (basis && percent != null) basis.textContent = formatPercent(percent) + '% of total revenue';
    if (commit && valid) input.value = formatPercent(state.settings.taxPercent);
    if (commit && !valid) {
      input.value = formatPercent(state.settings.taxPercent);
      if (amount) amount.textContent = formatMoney(applyPercent(ui.yearRevenueCents, state.settings.taxPercent));
    }
  }

  function exportJson() {
    const payload = exportPayload();
    download(fileStamp('caddie-backup', 'json'), JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded');
  }

  function exportLoopsCsv() {
    const header = ['Date', 'Course', 'Bag type', 'Holes', 'Players', 'Base pay', 'Tip', 'Total', 'Paid', 'Notes'];
    const rows = [...state.loops]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((loop) => [
        loop.date,
        loop.course,
        bagLabel(loop.bagType),
        loop.holes,
        loopPlayerLabels(loop).join(', '),
        centsToInput(loop.basePayCents),
        centsToInput(loop.tipCents),
        centsToInput(loopTotal(loop)),
        loop.paid ? 'paid' : 'unpaid',
        loop.notes || '',
      ]);
    download(fileStamp('caddie-loops', 'csv'), toCsv(header, rows), 'text/csv;charset=utf-8');
    toast('Loops CSV downloaded');
  }

  function exportExpensesCsv() {
    const header = ['Date', 'Category', 'Amount', 'Note'];
    const rows = [...state.expenses]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((expense) => [expense.date, categoryLabel(expense.category), centsToInput(expense.amountCents), expense.note || '']);
    download(fileStamp('caddie-expenses', 'csv'), toCsv(header, rows), 'text/csv;charset=utf-8');
    toast('Expenses CSV downloaded');
  }

  function readImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (error) {
        openModal({ title: 'Can’t import that file', body: 'That file is not valid JSON.', confirmLabel: 'OK', alert: true });
        return;
      }
      const error = validateBackup(data);
      if (error) {
        openModal({ title: 'Can’t import that file', body: error, confirmLabel: 'OK', alert: true });
        return;
      }
      const next = normalizeBackup(data);
      openModal({
        title: 'Replace all data on this phone?',
        body: `This backup has ${next.loops.length} ${next.loops.length === 1 ? 'loop' : 'loops'}, ${next.players.length} ${next.players.length === 1 ? 'player' : 'players'}, and ${next.expenses.length} ${next.expenses.length === 1 ? 'expense' : 'expenses'}. Everything currently in Caddie will be replaced.`,
        confirmLabel: 'Replace data',
        danger: true,
        onConfirm: () => {
          state = next;
          ui.loopDraft = null;
          ui.playerDraft = null;
          ui.expenseDraft = null;
          persistDraft();
          ui.year = new Date().getFullYear();
          save();
          toast('Backup restored');
          render();
        },
      });
    };
    reader.onerror = () => {
      openModal({ title: 'Can’t import that file', body: 'The file could not be read.', confirmLabel: 'OK', alert: true });
    };
    reader.readAsText(file);
  }

  function askClear() {
    openModal({
      title: 'Clear all data?',
      body: 'This removes every loop, player, expense, and your settings from this phone.',
      confirmLabel: 'Continue',
      danger: true,
      onConfirm: () => {
        openModal({
          title: 'Erase everything?',
          body: 'This cannot be undone. Caddie will be empty, as if you just installed it.',
          confirmLabel: 'Erase everything',
          danger: true,
          onConfirm: () => {
            state = defaultState();
            ui.loopDraft = null;
            ui.playerDraft = null;
            ui.expenseDraft = null;
            ui.rosterQuery = '';
            ui.year = new Date().getFullYear();
            persistDraft();
            save();
            toast('All data cleared');
            render();
          },
        });
      },
    });
  }

  function openModal(options) {
    ui.modal = options;
    renderModal();
  }

  function closeModal() {
    ui.modal = null;
    renderModal();
  }

  function confirmModal() {
    const action = ui.modal && ui.modal.onConfirm;
    ui.modal = null;
    renderModal();
    if (action) action();
  }

  function renderModal() {
    const root = document.getElementById('modal-root');
    const modal = ui.modal;
    if (!modal) {
      root.innerHTML = '';
      return;
    }
    const cancel = modal.alert
      ? ''
      : '<button type="button" class="btn-secondary" data-action="modal-cancel" id="modal-cancel">Cancel</button>';
    root.innerHTML = `<div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(modal.title)}</h2>
        <p>${esc(modal.body || '')}</p>
        <div class="modal-actions">
          <button type="button" class="${modal.danger ? 'btn-danger' : 'btn-primary'}" data-action="modal-confirm" id="modal-confirm">${esc(modal.confirmLabel || 'Confirm')}</button>
          ${cancel}
        </div>
      </div>
    </div>`;
    const focus = document.getElementById(modal.alert ? 'modal-confirm' : 'modal-cancel');
    if (focus) focus.focus();
  }

  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function captureOpenForms() {
    captureLoopForm();
    capturePlayerForm();
    captureExpenseForm();
  }

  function captureLoopForm() {
    const d = ui.loopDraft;
    if (!d || !document.getElementById('loop-form')) return;
    const date = document.getElementById('loop-date');
    const course = document.getElementById('loop-course');
    const base = document.getElementById('loop-base');
    const tip = document.getElementById('loop-tip');
    const notes = document.getElementById('loop-notes');
    if (date) d.date = date.value;
    if (course) d.course = course.value;
    if (base) d.base = base.value;
    if (tip) d.tip = tip.value;
    if (notes) d.notes = notes.value;
    d.slots.forEach((_, i) => {
      const search = document.getElementById('slot-search-' + i);
      if (search) d.queries[i] = search.value;
    });
  }

  function capturePlayerForm() {
    const d = ui.playerDraft;
    if (!d || !document.getElementById('player-form')) return;
    d.name = document.getElementById('player-name').value;
    d.handicap = document.getElementById('player-handicap').value;
    NOTE_FIELDS.forEach(([key]) => {
      const el = document.getElementById('note-' + key);
      if (el) d.notes[key] = el.value;
    });
  }

  function captureExpenseForm() {
    const d = ui.expenseDraft;
    if (!d || !document.getElementById('expense-form')) return;
    d.date = document.getElementById('expense-date').value;
    d.amount = document.getElementById('expense-amount').value;
    d.note = document.getElementById('expense-note').value;
  }

  function snapshotFocus() {
    const el = document.activeElement;
    if (!el || !el.id || el.id === 'main') return null;
    return {
      id: el.id,
      start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
    };
  }

  function restoreFocus(focus) {
    if (!focus) return;
    const el = document.getElementById(focus.id);
    if (!el) return;
    el.focus();
    if (focus.start != null && el.setSelectionRange) {
      const end = focus.end == null ? focus.start : focus.end;
      try { el.setSelectionRange(focus.start, end); } catch (error) { /* date inputs */ }
    }
  }

  function refreshTotal() {
    const el = document.getElementById('loop-total');
    if (!el) return;
    const base = document.getElementById('loop-base');
    const tip = document.getElementById('loop-tip');
    el.textContent = totalLabel(base ? base.value : '', tip ? tip.value : '');
  }

  function totalLabel(baseRaw, tipRaw) {
    const base = parseMoneyToCents(baseRaw);
    const tip = parseMoneyToCents((tipRaw || '').trim() === '' ? '0' : tipRaw);
    if (base == null || tip == null || base < 0 || tip < 0) return '—';
    return formatMoney(base + tip);
  }

  function blurMoney(input) {
    if (input.value.trim() === '') return;
    const cents = parseMoneyToCents(input.value);
    if (cents == null || cents < 0) return;
    input.value = centsToInput(cents);
    if (ui.loopDraft) {
      if (input.id === 'loop-base') ui.loopDraft.base = input.value;
      if (input.id === 'loop-tip') ui.loopDraft.tip = input.value;
    }
    if (ui.expenseDraft && input.id === 'expense-amount') ui.expenseDraft.amount = input.value;
    refreshTotal();
  }

  function newDraft() {
    return {
      id: null,
      date: todayISO(),
      course: '',
      bagType: null,
      playerCount: 3,
      slots: [],
      holes: 18,
      base: '',
      tip: '',
      paid: false,
      notes: '',
      error: '',
      queries: [],
    };
  }

  function draftFromLoop(loop) {
    const n = loop.bagType === 'forecaddie' ? Math.max(2, loop.playerIds.length) : (loop.bagType === 'double' ? 2 : 1);
    const slots = loop.playerIds.slice(0, n);
    while (slots.length < n) slots.push(null);
    return {
      id: loop.id,
      date: loop.date,
      course: loop.course,
      bagType: loop.bagType,
      playerCount: n,
      slots,
      holes: loop.holes,
      base: centsToInput(loop.basePayCents),
      tip: centsToInput(loop.tipCents),
      paid: !!loop.paid,
      notes: loop.notes || '',
      error: '',
      queries: slots.map(() => ''),
    };
  }

  function draftDirty(d) {
    return !!(cleanName(d.course || '') || (d.slots || []).some(Boolean) || (d.base || '').trim() || (d.tip || '').trim() || (d.notes || '').trim());
  }

  function persistDraft() {
    try {
      if (!ui.loopDraft || (!ui.loopDraft.bagType && !draftDirty(ui.loopDraft))) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      const copy = Object.assign({}, ui.loopDraft, { error: '' });
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(copy));
    } catch (error) { /* private mode */ }
  }

  function restoreDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      if (d.id && !loopById(d.id)) return;
      const base = newDraft();
      if (!d.bagType) {
        ui.loopDraft = Object.assign(base, {
          date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : base.date,
          course: String(d.course || '').slice(0, 80),
          notes: String(d.notes || '').slice(0, 4000),
          base: String(d.base || ''),
          tip: String(d.tip || ''),
          paid: !!d.paid,
          holes: d.holes === 9 ? 9 : 18,
          bagType: null,
        });
        return;
      }
      if (!['single', 'double', 'forecaddie'].includes(d.bagType)) return;
      const n = d.bagType === 'single' ? 1 : d.bagType === 'double' ? 2 : clamp(Number(d.playerCount) || 3, 2, MAX_FORE);
      const slots = Array.isArray(d.slots) ? d.slots.slice(0, n) : [];
      while (slots.length < n) slots.push(null);
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] && !playerById(slots[i])) slots[i] = null;
      }
      ui.loopDraft = {
        id: d.id || null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : todayISO(),
        course: String(d.course || '').slice(0, 80),
        bagType: d.bagType,
        playerCount: n,
        slots,
        holes: d.holes === 9 ? 9 : 18,
        base: String(d.base || ''),
        tip: String(d.tip || ''),
        paid: !!d.paid,
        notes: String(d.notes || '').slice(0, 4000),
        error: '',
        queries: Array(n).fill(''),
      };
    } catch (error) { /* ignore broken drafts */ }
  }

  function createPlayer(input) {
    const now = new Date().toISOString();
    const player = {
      id: uid(),
      name: cleanName(input.name).slice(0, 80),
      type: input.type === 'guest' ? 'guest' : 'member',
      handicap: (input.handicap || '').trim().slice(0, 16),
      notes: Object.assign(blankNotes(), input.notes || {}),
      createdAt: now,
      updatedAt: now,
    };
    state.players.push(player);
    sortPlayers();
    save();
    return player;
  }

  function sortPlayers() {
    state.players.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  function blankNotes() {
    return { clubs: '', greens: '', pace: '', drinks: '', tipping: '', other: '' };
  }

  function rememberCourse(course) {
    const list = state.courses.filter((item) => item.toLowerCase() !== course.toLowerCase());
    list.unshift(course);
    state.courses = list.slice(0, 8);
  }

  function filteredPlayers() {
    const q = ui.rosterQuery.trim().toLowerCase();
    const list = state.players.slice();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }

  function firstNote(player) {
    for (const [key, label] of NOTE_FIELDS) {
      const text = (player.notes[key] || '').trim();
      if (text) return label;
    }
    return '';
  }

  function recentPlayerIds() {
    const ids = [];
    const sorted = state.loops.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    sorted.forEach((loop) => {
      loop.playerIds.forEach((id) => {
        if (!ids.includes(id) && playerById(id)) ids.push(id);
      });
    });
    return ids;
  }

  function playerStats(id) {
    const loops = state.loops.filter((l) => l.playerIds.includes(id))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    const earned = sum(loops, loopTotal);
    const tips = sum(loops, (l) => l.tipCents);
    return { loops, earned, avgTip: loops.length ? divRound(tips, loops.length) : 0 };
  }

  function groupedLoops() {
    const sorted = state.loops.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    const groups = [];
    sorted.forEach((loop) => {
      const key = loop.date.slice(0, 7);
      let group = groups.find((item) => item.key === key);
      if (!group) {
        group = { key, label: formatMonth(loop.date), items: [] };
        groups.push(group);
      }
      group.items.push(loop);
    });
    return groups;
  }

  function loopPlayerLabels(loop) {
    return loop.playerIds.map((id, index) => {
      const player = playerById(id);
      if (player) return player.name;
      return (loop.playerNames && loop.playerNames[index]) || 'Removed player';
    });
  }

  function monthTotals(year) {
    const rev = Array(12).fill(0);
    const exp = Array(12).fill(0);
    state.loops.forEach((loop) => {
      if (!inYear(loop.date, year)) return;
      const month = Number(loop.date.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) rev[month] += loopTotal(loop);
    });
    state.expenses.forEach((expense) => {
      if (!inYear(expense.date, year)) return;
      const month = Number(expense.date.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) exp[month] += expense.amountCents;
    });
    return { rev, exp };
  }

  function topPlayers(year) {
    const map = new Map();
    state.loops.forEach((loop) => {
      if (!inYear(loop.date, year)) return;
      const total = loopTotal(loop);
      loop.playerIds.forEach((id) => {
        if (!playerById(id)) return;
        const row = map.get(id) || { id, earned: 0, loops: 0 };
        row.earned += total;
        row.loops += 1;
        map.set(id, row);
      });
    });
    return [...map.values()].sort((a, b) => b.earned - a.earned || b.loops - a.loops).slice(0, 5);
  }

  function dataYears() {
    const years = new Set([new Date().getFullYear()]);
    state.loops.forEach((loop) => years.add(Number(loop.date.slice(0, 4))));
    state.expenses.forEach((expense) => years.add(Number(expense.date.slice(0, 4))));
    return [...years].filter((year) => year > 1990 && year < 2100).sort((a, b) => a - b);
  }

  function clampYear(year) {
    const years = dataYears();
    if (year < years[0]) return years[0];
    if (year > years[years.length - 1]) return years[years.length - 1];
    return year;
  }

  function defaultState() {
    return {
      version: 1,
      settings: { name: '', taxPercent: 25 },
      courses: [],
      players: [],
      loops: [],
      expenses: [],
    };
  }

  function exportPayload() {
    return {
      app: 'caddie',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        name: state.settings.name,
        taxPercent: state.settings.taxPercent,
      },
      courses: state.courses.slice(),
      players: state.players,
      loops: state.loops,
      expenses: state.expenses,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const error = validateBackup(data);
      if (error) {
        console.warn('Caddie storage was not loaded:', error);
        return defaultState();
      }
      return normalizeBackup(data);
    } catch (error) {
      console.warn('Caddie storage could not be read.');
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(exportPayload()));
    } catch (error) {
      toast('Could not save on this phone. Storage may be full.');
    }
  }

  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'That file is not a Caddie backup.';
    if (data.app !== 'caddie' || data.version !== 1) return 'Unrecognized backup format.';
    if (!data.settings || typeof data.settings !== 'object') return 'Settings in the backup are missing.';
    if (typeof data.settings.name !== 'string') return 'The name in the backup is invalid.';
    if (typeof data.settings.taxPercent !== 'number' || !Number.isFinite(data.settings.taxPercent)) return 'The tax percent in the backup is invalid.';
    if (data.settings.taxPercent < 0 || data.settings.taxPercent > 100) return 'The tax percent must be between 0 and 100.';
    if (!Array.isArray(data.courses) || !Array.isArray(data.players) || !Array.isArray(data.loops) || !Array.isArray(data.expenses)) {
      return 'Backup is missing courses, players, loops, or expenses.';
    }
    if (data.players.length > 5000 || data.loops.length > 5000 || data.expenses.length > 5000) return 'That backup is too large for this phone.';
    const playerIds = new Set();
    for (const player of data.players) {
      if (!player || typeof player.id !== 'string' || !player.id) return 'A player in the backup is invalid.';
      if (typeof player.name !== 'string' || !player.name.trim()) return 'A player is missing a name.';
      if (player.type !== 'member' && player.type !== 'guest') return 'A player has an invalid member or guest type.';
      if (playerIds.has(player.id)) return 'Duplicate player ids in the backup.';
      playerIds.add(player.id);
      if (player.notes != null && typeof player.notes !== 'object') return 'A player has invalid notes.';
    }
    const loopIds = new Set();
    for (const loop of data.loops) {
      if (!loop || typeof loop.id !== 'string' || !loop.id) return 'A loop in the backup is invalid.';
      if (loopIds.has(loop.id)) return 'Duplicate loop ids in the backup.';
      loopIds.add(loop.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(loop.date || '')) return 'A loop has an invalid date.';
      if (typeof loop.course !== 'string' || !loop.course.trim()) return 'A loop is missing a course.';
      if (!['single', 'double', 'forecaddie'].includes(loop.bagType)) return 'A loop has an invalid bag type.';
      if (loop.holes !== 9 && loop.holes !== 18) return 'A loop has an invalid hole count.';
      if (!isCents(loop.basePayCents) || !isCents(loop.tipCents) || loop.basePayCents < 0 || loop.tipCents < 0) return 'A loop has invalid money.';
      if (typeof loop.paid !== 'boolean') return 'A loop is missing paid status.';
      if (!Array.isArray(loop.playerIds) || !loop.playerIds.length) return 'A loop is missing players.';
      if (loop.playerIds.some((id) => typeof id !== 'string' || !id)) return 'A loop has an invalid player.';
      if (loop.playerNames != null && (!Array.isArray(loop.playerNames) || loop.playerNames.length !== loop.playerIds.length)) {
        return 'A loop has mismatched player names.';
      }
      const expected = loop.bagType === 'single' ? 1 : loop.bagType === 'double' ? 2 : null;
      if (expected && loop.playerIds.length !== expected) return 'A loop has the wrong number of players for its bag type.';
      if (loop.bagType === 'forecaddie' && (loop.playerIds.length < 2 || loop.playerIds.length > MAX_FORE)) return 'A forecaddie loop has an invalid group size.';
    }
    const expenseIds = new Set();
    for (const expense of data.expenses) {
      if (!expense || typeof expense.id !== 'string' || !expense.id) return 'An expense in the backup is invalid.';
      if (expenseIds.has(expense.id)) return 'Duplicate expense ids in the backup.';
      expenseIds.add(expense.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date || '')) return 'An expense has an invalid date.';
      if (!isCents(expense.amountCents) || expense.amountCents < 0) return 'An expense has an invalid amount.';
      if (!CATEGORIES.some(([key]) => key === expense.category)) return 'An expense has an invalid category.';
    }
    return null;
  }

  function normalizeBackup(data) {
    const notesOf = (notes) => {
      const src = notes && typeof notes === 'object' ? notes : {};
      const out = blankNotes();
      NOTE_FIELDS.forEach(([key]) => {
        out[key] = typeof src[key] === 'string' ? src[key].slice(0, 4000) : '';
      });
      return out;
    };
    const now = new Date().toISOString();
    const players = data.players.map((player) => ({
      id: player.id,
      name: cleanName(player.name).slice(0, 80),
      type: player.type === 'guest' ? 'guest' : 'member',
      handicap: player.handicap == null ? '' : String(player.handicap).trim().slice(0, 16),
      notes: notesOf(player.notes),
      createdAt: typeof player.createdAt === 'string' ? player.createdAt : now,
      updatedAt: typeof player.updatedAt === 'string' ? player.updatedAt : now,
    }));
    players.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const courses = [];
    data.courses.forEach((course) => {
      if (typeof course !== 'string') return;
      const clean = cleanName(course).slice(0, 80);
      if (!clean) return;
      if (!courses.some((item) => item.toLowerCase() === clean.toLowerCase())) courses.push(clean);
    });
    return {
      version: 1,
      settings: {
        name: data.settings.name.trim().slice(0, 40),
        taxPercent: Math.round(data.settings.taxPercent * 10) / 10,
      },
      courses: courses.slice(0, 8),
      players,
      loops: data.loops.map((loop) => ({
        id: loop.id,
        date: loop.date,
        course: cleanName(loop.course).slice(0, 80),
        bagType: loop.bagType,
        holes: loop.holes,
        playerIds: loop.playerIds.slice(),
        playerNames: (loop.playerNames || loop.playerIds.map(() => 'Player')).map((name) => cleanName(String(name)).slice(0, 80) || 'Player'),
        basePayCents: loop.basePayCents,
        tipCents: loop.tipCents,
        paid: loop.paid,
        notes: typeof loop.notes === 'string' ? loop.notes.slice(0, 4000) : '',
        createdAt: typeof loop.createdAt === 'string' ? loop.createdAt : now,
        updatedAt: typeof loop.updatedAt === 'string' ? loop.updatedAt : now,
      })),
      expenses: data.expenses.map((expense) => ({
        id: expense.id,
        date: expense.date,
        amountCents: expense.amountCents,
        category: expense.category,
        note: typeof expense.note === 'string' ? expense.note.slice(0, 500) : '',
        createdAt: typeof expense.createdAt === 'string' ? expense.createdAt : now,
        updatedAt: typeof expense.updatedAt === 'string' ? expense.updatedAt : now,
      })),
    };
  }

  function playerById(id) { return state.players.find((p) => p.id === id) || null; }
  function loopById(id) { return state.loops.find((l) => l.id === id) || null; }
  function expenseById(id) { return state.expenses.find((e) => e.id === id) || null; }
  function loopTotal(loop) { return loop.basePayCents + loop.tipCents; }
  function inYear(date, year) { return date.slice(0, 4) === String(year); }
  function sum(list, pick) { return list.reduce((total, item) => total + pick(item), 0); }

  function bagLabel(type) {
    if (type === 'single') return 'Single bag';
    if (type === 'double') return 'Double bag';
    if (type === 'forecaddie') return 'Forecaddie';
    return 'Loop';
  }

  function typeLabel(type) { return type === 'guest' ? 'Guest' : 'Member'; }

  function categoryLabel(category) {
    const found = CATEGORIES.find(([key]) => key === category);
    return found ? found[1] : 'Other';
  }

  function parseMoneyToCents(input) {
    if (input == null) return null;
    const raw = String(input).trim().replace(/[$,\s]/g, '');
    if (raw === '') return 0;
    if (!/^\d+(\.\d*)?$/.test(raw) && !/^\.\d+$/.test(raw)) return null;
    const [wholePart, fracPart = ''] = raw.split('.');
    const whole = wholePart === '' ? 0 : Number(wholePart);
    if (!Number.isSafeInteger(whole)) return null;
    const padded = (fracPart + '000').slice(0, 3);
    let cents = whole * 100 + Number(padded.slice(0, 2));
    if (Number(padded[2]) >= 5) cents += 1;
    if (!Number.isSafeInteger(cents)) return null;
    return cents;
  }

  function centsToInput(cents) {
    const abs = Math.abs(cents);
    return Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  function formatMoney(cents) {
    const neg = cents < 0;
    const abs = Math.abs(cents);
    const body = Math.floor(abs / 100).toLocaleString('en-US') + '.' + String(abs % 100).padStart(2, '0');
    return (neg ? '-$' : '$') + body;
  }

  function applyPercent(cents, percent) {
    if (!cents || !percent) return 0;
    const hundredths = Math.round(Number(percent) * 100);
    if (!Number.isFinite(hundredths)) return 0;
    const neg = cents < 0;
    const num = Math.abs(cents) * hundredths;
    const rounded = Math.floor((num + 5000) / 10000);
    return neg ? -rounded : rounded;
  }

  function divRound(numerator, denominator) {
    if (!denominator) return 0;
    const neg = numerator < 0;
    const n = Math.abs(numerator);
    const q = Math.floor(n / denominator);
    const r = n % denominator;
    const value = q + (r * 2 >= denominator ? 1 : 0);
    return neg ? -value : value;
  }

  function formatPercent(value) {
    const n = Math.round(Number(value) * 10) / 10;
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function isCents(value) {
    return typeof value === 'number' && Number.isSafeInteger(value);
  }

  function todayISO() { return iso(new Date()); }

  function iso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function parseISO(value) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function formatFull(value) {
    return parseISO(value).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function formatMedium(value) {
    return parseISO(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatMonth(value) {
    return parseISO(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function formatShortRange(start, end) {
    const a = parseISO(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const b = parseISO(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return a + ' – ' + b;
  }

  function weekRange(anchor) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return [iso(start), iso(end)];
  }

  function monthRange(anchor) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return [iso(start), iso(end)];
  }

  function cleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function toCsv(header, rows) {
    const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
    return '\uFEFF' + lines.join('\n');
  }

  function fileStamp(prefix, ext) {
    return prefix + '-' + todayISO() + '.' + ext;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
