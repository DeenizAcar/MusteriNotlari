(function () {
  'use strict';

  const STORE_KEY = 'musteriNotlari.v1';
  const N = window.NativeAPI && window.NativeAPI.isNative ? window.NativeAPI : null;
  if (N) document.documentElement.classList.add('native');

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lower = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nowTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
  const toMs = (date, time) => {
    if (!date) return NaN;
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = (time || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
  };
  const telHref = (p) => 'tel:' + String(p).replace(/[^\d+*#]/g, '');

  // ---------- Veri ----------
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { notes = []; }
  if (!Array.isArray(notes)) notes = [];
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(notes)); } catch (e) { /* yer yok */ }
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const byId = (id) => notes.find((n) => n.id === id);

  let selectedId = null;

  // ---------- Arşiv (çalan alarmların kaydı) ----------
  const ARCHIVE_KEY = 'musteriNotlari.arsiv.v1';
  let archive = [];
  try { archive = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]'); } catch (e) { archive = []; }
  if (!Array.isArray(archive)) archive = [];
  function saveArchive() {
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive)); } catch (e) { /* yer yok */ }
  }
  // İlgili kişi boşsa diğer kişi
  function personPair(n) {
    if (n.name || n.phone) return { name: n.name || '', phone: n.phone || '' };
    return { name: n.name2 || '', phone: n.phone2 || '' };
  }
  function addArchive(n, at) {
    const p = personPair(n);
    archive.push({ id: newId(), at, noteId: n.id, name: p.name, phone: p.phone, notes: n.notes || '' });
  }

  // ---------- Arama ----------
  // Kelime kelime arama kutusu (ana ekran ve arşivde ortak)
  function createChipSearch(box, chipsEl, input, clearBtn, onChange) {
    let chips = [];
    function addChipsFrom(text) {
      const words = text.split(/\s+/).filter(Boolean);
      if (!words.length) return false;
      chips.push(...words);
      return true;
    }
    function render() {
      chipsEl.innerHTML = chips.map((w, i) =>
        `<span class="chip"><span>${esc(w)}</span><button type="button" class="x-black" data-i="${i}" title="Sil" aria-label="${esc(w)} sil">&times;</button></span>`).join('');
      clearBtn.hidden = !chips.length && !input.value;
    }
    input.addEventListener('input', () => {
      const v = input.value;
      if (/\s/.test(v)) {
        const parts = v.split(/\s+/);
        const rest = /\s$/.test(v) ? '' : parts.pop();
        addChipsFrom(parts.join(' '));
        input.value = rest;
        render();
      }
      clearBtn.hidden = !chips.length && !input.value;
      onChange();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (addChipsFrom(input.value)) { input.value = ''; render(); onChange(); }
        input.blur();
      } else if (e.key === 'Backspace' && !input.value && chips.length) {
        chips.pop(); render(); onChange();
      }
    });
    input.addEventListener('blur', () => {
      if (addChipsFrom(input.value)) { input.value = ''; render(); onChange(); }
    });
    chipsEl.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    chipsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      e.stopPropagation();
      chips.splice(Number(b.dataset.i), 1);
      render(); onChange();
    });
    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chips = []; input.value = '';
      render(); onChange();
    });
    box.addEventListener('click', (e) => { if (e.target === e.currentTarget) input.focus(); });
    render();
    return {
      terms: () => chips.concat(input.value.split(/\s+/)).map(lower).filter(Boolean),
      clear: () => { chips = []; input.value = ''; render(); },
    };
  }
  const mainSearch = createChipSearch($('searchBox'), $('chips'), $('searchInput'), $('clearSearch'), () => renderTable());
  const searchTerms = () => mainSearch.terms();
  function haystack(n) {
    // Alarm bilgileri bilinçli olarak aramaya dahil edilmez.
    const phones = [n.phone, n.phone2].map((p) => String(p || '').replace(/\D/g, '')).join(' ');
    return lower([fmtDate(n.date), n.date, n.time, n.name, n.phone, n.name2, n.phone2, n.notes, phones].join(' \u0001 '));
  }

  // ---------- Tablo ----------
  const tbody = $('tbody');
  const SORT_KEY = 'musteriNotlari.sort';
  let sortMode = 'created';
  try { if (localStorage.getItem(SORT_KEY) === 'person') sortMode = 'person'; } catch (e) { /* */ }
  document.querySelectorAll('input[name="sort"]').forEach((r) => {
    r.checked = r.value === sortMode;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      sortMode = r.value;
      try { localStorage.setItem(SORT_KEY, sortMode); } catch (e) { /* */ }
      renderTable();
    });
  });
  const collator = new Intl.Collator('tr-TR', { sensitivity: 'base', numeric: true });
  // İlgili kişi adı soyadı + telefonu + diğer kişi adı soyadı + telefonu yan yana
  const personKey = (n) => [n.name, n.phone, n.name2, n.phone2].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  function sortedNotes() {
    const byCreated = (a, b) => (b.created || 0) - (a.created || 0); // en yeni kayıt en üstte
    if (sortMode === 'person') {
      return notes.slice().sort((a, b) => {
        const ka = personKey(a), kb = personKey(b);
        if (!ka !== !kb) return ka ? -1 : 1; // kişisi boş olanlar en sona
        return collator.compare(ka, kb) || byCreated(a, b);
      });
    }
    return notes.slice().sort(byCreated);
  }
  function personLine(name, phone) {
    if (!name && !phone) return '';
    return `<div class="p-line">${name ? `<span class="p-name">${esc(name)}</span>` : ''}${phone ? `<a class="p-tel" href="${esc(telHref(phone))}">${esc(phone)}</a>` : ''}</div>`;
  }
  function renderTable() {
    const terms = searchTerms();
    const rows = sortedNotes().filter((n) => {
      if (!terms.length) return true;
      const h = haystack(n);
      return terms.some((t) => h.includes(t)); // herhangi bir kelimeye uyan kayıt listelenir
    });
    tbody.innerHTML = rows.map((n) => `
      <tr data-id="${n.id}" class="${n.id === selectedId ? 'sel' : ''}">
        <td class="d"><span class="d-date">${esc(fmtDate(n.date))}</span> <span class="d-time">${esc(n.time || '')}${n.alarm && n.alarm.enabled ? '<span class="bell" title="Alarm var">🔔</span>' : ''}</span></td>
        <td><div class="p-cell">${personLine(n.name, n.phone)}${personLine(n.name2, n.phone2)}</div></td>
        <td><div class="n-text">${esc(n.notes || '')}</div></td>
      </tr>`).join('');
    const empty = $('empty');
    empty.hidden = rows.length > 0;
    empty.textContent = notes.length ? 'Aramaya uyan not bulunamadı.' : 'Henüz not yok. “Not Ekle” ile başlayın.';
  }

  // ---------- Satıra basılı tutunca "Kaydı Sil" menüsü ----------
  let suppressClickUntil = 0;
  let rowMenuAction = null;
  const rowMenu = $('rowMenu');
  function openRowMenu(x, y, action) {
    rowMenuAction = action;
    rowMenu.hidden = false;
    const w = rowMenu.offsetWidth, h = rowMenu.offsetHeight;
    rowMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    rowMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
  }
  function closeRowMenu() { rowMenu.hidden = true; rowMenuAction = null; }
  $('rowMenuDel').addEventListener('click', () => {
    const act = rowMenuAction;
    closeRowMenu();
    if (act) act();
  });
  document.addEventListener('pointerdown', (e) => { if (!rowMenu.hidden && !rowMenu.contains(e.target)) closeRowMenu(); }, true);
  window.addEventListener('resize', closeRowMenu);
  document.addEventListener('scroll', closeRowMenu, true);

  function attachRowMenu(body, onDelete) {
    let timer = null, start = null, row = null;
    const cancel = () => {
      clearTimeout(timer); timer = null;
      if (row) row.classList.remove('pressing');
      row = null;
    };
    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr || e.target.closest('a')) return;
      cancel();
      row = tr; start = { x: e.clientX, y: e.clientY };
      tr.classList.add('pressing');
      const id = tr.dataset.id;
      timer = setTimeout(() => {
        cancel();
        suppressClickUntil = Date.now() + 700;
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (err) { /* */ } }
        openRowMenu(start.x, start.y, () => onDelete(id));
      }, 550);
    });
    body.addEventListener('pointermove', (e) => {
      if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => body.addEventListener(ev, () => { if (timer) cancel(); }));
    // Sağ tık (bilgisayar) ve tarayıcının kendi basılı tutma menüsü yerine
    body.addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr || e.target.closest('a')) return;
      e.preventDefault();
      if (!rowMenu.hidden) return; // basılı tutma ile zaten açıldı
      cancel();
      const id = tr.dataset.id;
      openRowMenu(e.clientX, e.clientY, () => onDelete(id));
    });
  }

  let lastTap = { id: null, t: 0 };
  attachRowMenu(tbody, (id) => deleteNote(id));
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('a.p-tel')) { e.stopPropagation(); return; } // telefon arama ekranı açılır
    if (Date.now() < suppressClickUntil) return; // basılı tutma sonrası tıklama
    const now = Date.now();
    if (lastTap.id === id && now - lastTap.t < 450) {
      lastTap = { id: null, t: 0 };
      openNote(id);
      return;
    }
    lastTap = { id, t: now };
    selectNote(id);
  });

  function selectNote(id) {
    selectedId = id;
    tbody.querySelectorAll('tr.sel').forEach((r) => r.classList.remove('sel'));
    const tr = tbody.querySelector(`tr[data-id="${CSS.escape(id || '')}"]`);
    if (tr) tr.classList.add('sel');
    loadAlarmPanel();
  }

  function personLabel(n) {
    // İlgili kişi bilgisi boşsa diğer kişinin bilgisi kullanılır
    let parts = [n.name, n.phone].filter(Boolean);
    if (!parts.length) parts = [n.name2, n.phone2].filter(Boolean);
    return parts.length ? parts.join(' - ') : '(isimsiz)';
  }

  async function deleteNote(id) {
    const n = byId(id);
    if (!n) return;
    const msg = n.alarm && n.alarm.enabled
      ? `${personLabel(n)}\n\nBu notta alarm mevcut. Yine de silinsin mi?`
      : `${personLabel(n)}\n\nSeçili not silinsin mi?`;
    if (!(await confirmBox(msg))) return;
    notes = notes.filter((x) => x.id !== id);
    if (selectedId === id) selectedId = null;
    save(); renderTable(); loadAlarmPanel(); scheduleNative();
  }

  // ---------- Onay kutusu ----------
  let confirmResolve = null;
  function confirmBox(text, yes = 'Evet', no = 'Hayır') {
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yes;
    $('confirmNo').textContent = no;
    $('confirmModal').hidden = false;
    return new Promise((res) => { confirmResolve = res; });
  }
  function closeConfirm(v) {
    $('confirmModal').hidden = true;
    const r = confirmResolve; confirmResolve = null;
    if (r) r(v);
  }
  $('confirmYes').addEventListener('click', () => closeConfirm(true));
  $('confirmNo').addEventListener('click', () => closeConfirm(false));

  // ---------- Saat seçici ----------
  const face = $('clockFace');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const C = 130, R_OUT = 104, R_IN = 68;
  const ck = { mode: 'h', h: 0, m: 0, resolve: null };

  function polar(angleDeg, r) {
    const a = (angleDeg - 90) * Math.PI / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  }
  function el(tag, attrs, text) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function drawClock() {
    face.innerHTML = '';
    face.appendChild(el('circle', { cx: C, cy: C, r: 126, fill: '#eef2f7' }));
    let selAngle, selR;
    if (ck.mode === 'h') {
      const h = ck.h;
      const inner = h === 0 || h > 12;
      selAngle = (h % 12) * 30; selR = inner ? R_IN : R_OUT;
    } else {
      selAngle = ck.m * 6; selR = R_OUT;
    }
    const [sx, sy] = polar(selAngle, selR);
    face.appendChild(el('line', { x1: C, y1: C, x2: sx, y2: sy, stroke: '#1f4e79', 'stroke-width': 2 }));
    face.appendChild(el('circle', { cx: C, cy: C, r: 4, fill: '#1f4e79' }));
    face.appendChild(el('circle', { cx: sx, cy: sy, r: 17, fill: '#1f4e79' }));
    if (ck.mode === 'h') {
      for (let i = 0; i < 12; i++) {
        const outerVal = i === 0 ? 12 : i;
        const innerVal = i === 0 ? 0 : i + 12;
        const [ox, oy] = polar(i * 30, R_OUT);
        const [ix, iy] = polar(i * 30, R_IN);
        face.appendChild(el('text', { x: ox, y: oy, class: ck.h === outerVal ? 'on' : '' }, String(outerVal)));
        face.appendChild(el('text', { x: ix, y: iy, class: 'inner' + (ck.h === innerVal ? ' on' : '') }, pad(innerVal)));
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const v = i * 5;
        const [x, y] = polar(i * 30, R_OUT);
        face.appendChild(el('text', { x, y, class: ck.m === v ? 'on' : '' }, pad(v)));
      }
      if (ck.m % 5) face.appendChild(el('circle', { cx: sx, cy: sy, r: 3, fill: '#fff' }));
    }
    $('ckH').textContent = pad(ck.h);
    $('ckM').textContent = pad(ck.m);
    $('ckH').classList.toggle('on', ck.mode === 'h');
    $('ckM').classList.toggle('on', ck.mode === 'm');
  }
  function pickFromEvent(e) {
    const rect = face.getBoundingClientRect();
    const scale = 260 / rect.width;
    const x = (e.clientX - rect.left) * scale - C;
    const y = (e.clientY - rect.top) * scale - C;
    let ang = Math.atan2(y, x) * 180 / Math.PI + 90;
    if (ang < 0) ang += 360;
    const dist = Math.hypot(x, y);
    if (ck.mode === 'h') {
      const idx = Math.round(ang / 30) % 12;
      ck.h = dist < (R_IN + R_OUT) / 2 ? (idx === 0 ? 0 : idx + 12) : (idx === 0 ? 12 : idx);
    } else {
      ck.m = Math.round(ang / 6) % 60;
    }
    drawClock();
  }
  let dragging = false;
  face.addEventListener('pointerdown', (e) => { dragging = true; face.setPointerCapture(e.pointerId); pickFromEvent(e); });
  face.addEventListener('pointermove', (e) => { if (dragging) pickFromEvent(e); });
  face.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false; pickFromEvent(e);
    if (ck.mode === 'h') { ck.mode = 'm'; setTimeout(drawClock, 150); }
  });
  face.addEventListener('pointercancel', () => { dragging = false; });
  $('ckH').addEventListener('click', () => { ck.mode = 'h'; drawClock(); });
  $('ckM').addEventListener('click', () => { ck.mode = 'm'; drawClock(); });
  function pickTime(initial) {
    const t = initial && /^\d\d:\d\d$/.test(initial) ? initial : nowTime();
    ck.h = Number(t.slice(0, 2)); ck.m = Number(t.slice(3, 5)); ck.mode = 'h';
    drawClock();
    $('clockModal').hidden = false;
    return new Promise((res) => { ck.resolve = res; });
  }
  function closeClock(ok) {
    $('clockModal').hidden = true;
    const r = ck.resolve; ck.resolve = null;
    if (r) r(ok ? `${pad(ck.h)}:${pad(ck.m)}` : null);
  }
  $('ckOk').addEventListener('click', () => closeClock(true));
  $('ckCancel').addEventListener('click', () => closeClock(false));

  function setTimeBtn(btn, val) {
    btn.dataset.value = val || '';
    btn.textContent = val || '--:--';
    btn.dataset.empty = val ? '0' : '1';
  }
  const getTimeBtn = (btn) => btn.dataset.value || '';

  // ---------- Not penceresi ----------
  let editingId = null;
  const f = { date: $('fDate'), time: $('fTime'), name: $('fName'), phone: $('fPhone'), name2: $('fName2'), phone2: $('fPhone2'), notes: $('fNotes') };

  function openNote(id) {
    editingId = id || null;
    const n = id ? byId(id) : null;
    $('noteTitle').textContent = n ? 'Notu Düzenle' : 'Not Ekle';
    const d = new Date();
    f.date.value = n ? n.date : todayStr(d);
    setTimeBtn(f.time, n ? n.time : nowTime(d));
    f.name.value = n ? n.name || '' : '';
    f.phone.value = n ? n.phone || '' : '';
    f.name2.value = n ? n.name2 || '' : '';
    f.phone2.value = n ? n.phone2 || '' : '';
    f.notes.value = n ? n.notes || '' : '';
    $('noteModal').hidden = false;
    if (!n) setTimeout(() => f.name.focus(), 50);
  }
  f.time.addEventListener('click', async () => {
    const v = await pickTime(getTimeBtn(f.time));
    if (v) setTimeBtn(f.time, v);
  });
  $('addBtn').addEventListener('click', () => openNote(null));

  $('saveBtn').addEventListener('click', () => {
    const data = {
      date: f.date.value || todayStr(),
      time: getTimeBtn(f.time) || nowTime(),
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      name2: f.name2.value.trim(),
      phone2: f.phone2.value.trim(),
      notes: f.notes.value.replace(/\s+$/, ''),
    };
    if (!data.name && !data.phone && !data.name2 && !data.phone2 && !data.notes) {
      confirmBox('Boş not kaydedilemez. Lütfen en az bir alan doldurun.', 'Tamam', 'Kapat');
      return;
    }
    if (editingId) {
      Object.assign(byId(editingId), data);
    } else {
      const n = Object.assign({ id: newId(), created: Date.now(), alarm: null }, data);
      notes.push(n);
      selectedId = n.id;
    }
    save();
    $('noteModal').hidden = true;
    renderTable(); loadAlarmPanel(); scheduleNative();
  });
  async function cancelNote() {
    if (await confirmBox('Vazgeçmek istediğinize emin misiniz?')) {
      $('noteModal').hidden = true;
    }
  }
  $('cancelBtn').addEventListener('click', cancelNote);

  // ---------- Alarm paneli ----------
  const A = { on: $('alarmOn'), sd: $('aStartDate'), st: $('aStartTime'), ed: $('aEndDate'), et: $('aEndTime'), per: $('aPeriod') };
  const panel = $('alarmPanel');

  function setAlarmFieldsEnabled(en) {
    [A.sd, A.st, A.ed, A.et, A.per].forEach((x) => { x.disabled = !en; });
    panel.classList.toggle('disabled', !en);
  }
  // Seçili notun güncel duruma göre ilk hatırlatma zamanı
  function updateNextInfo() {
    const el = $('aNext');
    const n = selectedId ? byId(selectedId) : null;
    const a = n && n.alarm && n.alarm.enabled ? n.alarm : null;
    if (!a) { el.textContent = ''; el.classList.remove('none'); return; }
    const t = occurrences(a, Math.max(Date.now(), a.lastFired || 0), 1)[0];
    if (t) {
      const d = new Date(t);
      el.textContent = `İlk hatırlatma: ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${nowTime(d)}`;
      el.classList.remove('none');
    } else {
      el.textContent = 'Bekleyen hatırlatma yok';
      el.classList.add('none');
    }
  }
  function loadAlarmPanel() {
    const n = selectedId ? byId(selectedId) : null;
    A.on.disabled = !n;
    $('alarmFor').textContent = n ? personLabel(n) : 'Alarm için tablodan bir not seçin';
    $('alarmFor').classList.toggle('has', !!n);
    const a = n && n.alarm && n.alarm.enabled ? n.alarm : null;
    A.on.checked = !!a;
    A.sd.value = a ? a.startDate || '' : '';
    setTimeBtn(A.st, a ? a.startTime : '');
    A.ed.value = a ? a.endDate || '' : '';
    setTimeBtn(A.et, a ? a.endTime : '');
    A.per.value = a ? String(a.period || '0') : '0';
    setAlarmFieldsEnabled(!!a);
    updateNextInfo();
  }
  function storeAlarm() {
    const n = selectedId ? byId(selectedId) : null;
    if (!n) return;
    if (!A.on.checked) {
      n.alarm = null;
    } else {
      n.alarm = {
        enabled: true,
        startDate: A.sd.value,
        startTime: getTimeBtn(A.st),
        endDate: A.ed.value,
        endTime: getTimeBtn(A.et),
        period: A.per.value,
        lastFired: Date.now(), // bu andan önceki tekrarlar çalmaz
      };
    }
    save(); renderTable(); scheduleNative(); updateNextInfo();
  }
  A.on.addEventListener('change', () => {
    if (A.on.checked) {
      const d = new Date();
      A.sd.value = todayStr(d);
      setTimeBtn(A.st, nowTime(d));
      A.ed.value = ''; setTimeBtn(A.et, '');
      A.per.value = '0';
      setAlarmFieldsEnabled(true);
      if (!N && 'Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (e) { /* yok */ }
      }
    } else {
      A.sd.value = ''; setTimeBtn(A.st, '');
      A.ed.value = ''; setTimeBtn(A.et, '');
      A.per.value = '0';
      setAlarmFieldsEnabled(false);
    }
    storeAlarm();
  });
  A.sd.addEventListener('change', storeAlarm);
  A.per.addEventListener('change', storeAlarm);
  A.ed.addEventListener('change', () => {
    if (A.ed.value && !getTimeBtn(A.et)) setTimeBtn(A.et, '23:59');
    if (!A.ed.value) setTimeBtn(A.et, '');
    storeAlarm();
  });
  A.st.addEventListener('click', async () => {
    const v = await pickTime(getTimeBtn(A.st));
    if (v) { setTimeBtn(A.st, v); storeAlarm(); }
  });
  A.et.addEventListener('click', async () => {
    const v = await pickTime(getTimeBtn(A.et) || '23:59');
    if (v) {
      setTimeBtn(A.et, v);
      if (!A.ed.value) A.ed.value = A.sd.value || todayStr();
      storeAlarm();
    }
  });

  // ---------- Alarm hesaplama ----------
  function addPeriod(ms, period, k) {
    if (period === '1M') {
      const d = new Date(ms);
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + k);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      return d.getTime();
    }
    return ms + k * Number(period) * 60000;
  }
  // fromMs'ten büyük (hariç) tüm alarm zamanları, en fazla `limit` adet
  function occurrences(a, fromMs, limit) {
    const out = periodicOccurrences(a, fromMs, limit);
    // Ertelenmiş alarm varsa listeye eklenir
    if (a && a.enabled && a.snoozeAt && a.snoozeAt > fromMs) {
      out.push(a.snoozeAt);
      out.sort((x, y) => x - y);
      if (out.length > limit) out.length = limit;
    }
    return out;
  }
  function periodicOccurrences(a, fromMs, limit) {
    const out = [];
    if (!a || !a.enabled) return out;
    const start = toMs(a.startDate, a.startTime);
    if (isNaN(start)) return out;
    const end = a.endDate ? toMs(a.endDate, a.endTime || '23:59') : null;
    if (end != null && end < start) return out;
    const period = String(a.period || '0');
    if (period === '0') {
      if (start > fromMs) out.push(start);
      return out;
    }
    // Tekrarlı alarmda başlangıç anı çalmaz; ilk alarm başlangıç + periyot zamanındadır.
    let k = 1;
    if (period !== '1M' && fromMs > start) k = Math.max(1, Math.floor((fromMs - start) / (Number(period) * 60000)) - 1);
    for (let guard = 0; guard < 100000 && out.length < limit; guard++, k++) {
      const t = addPeriod(start, period, k);
      if (end != null && t >= end) {
        if (end > fromMs) out.push(end); // son hatırlatma bitiş zamanında
        break;
      }
      if (t > fromMs) out.push(t);
    }
    return out;
  }

  // ---------- Alarm çalma (web / uygulama ön plandayken) ----------
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.0001, t0 + i * 0.4);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.4 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.4 + 0.3);
        o.start(t0 + i * 0.4); o.stop(t0 + i * 0.4 + 0.32);
      }
    } catch (e) { /* ses yok */ }
  }
  document.addEventListener('pointerdown', () => { try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* */ } }, { passive: true });

  function showAlarm(n) {
    alarmNoteId = n.id;
    $('alarmTitle').textContent = personLabel(n);
    $('alarmText').textContent = n.notes || '';
    $('alarmModal').hidden = false;
    selectNote(n.id);
    const tr = tbody.querySelector(`tr[data-id="${CSS.escape(n.id)}"]`);
    if (tr) tr.scrollIntoView({ block: 'nearest' });
  }
  let alarmNoteId = null;
  function closeAlarmPopup() { $('alarmModal').hidden = true; alarmNoteId = null; }
  $('alarmOk').addEventListener('click', closeAlarmPopup);

  // Notu sil: not alarmıyla birlikte silinir
  $('alarmDelNote').addEventListener('click', async () => {
    const n = byId(alarmNoteId);
    if (!n) { closeAlarmPopup(); return; }
    if (!(await confirmBox(`${personLabel(n)}

Not tamamen silinecek. Emin misiniz?`))) return;
    notes = notes.filter((x) => x.id !== n.id);
    if (selectedId === n.id) {
      selectedId = null;
      renderTable();
      const first = tbody.querySelector('tr[data-id]');
      if (first) selectedId = first.dataset.id;
    }
    save(); renderTable(); loadAlarmPanel(); scheduleNative();
    closeAlarmPopup();
  });

  // Alarmı sil: alarm bilgileri silinir, Alarm kur tiki boşalır
  $('alarmDelAlarm').addEventListener('click', async () => {
    const n = byId(alarmNoteId);
    if (!n) { closeAlarmPopup(); return; }
    if (!(await confirmBox(`${personLabel(n)}

Alarm silinecek. Emin misiniz?`))) return;
    n.alarm = null;
    save(); renderTable(); loadAlarmPanel(); scheduleNative();
    closeAlarmPopup();
  });


  function checkAlarms() {
    const now = Date.now();
    let changed = false;
    for (const n of notes) {
      const a = n.alarm;
      if (!a || !a.enabled) continue;
      const due = occurrences(a, a.lastFired || 0, 200).filter((t) => t <= now);
      if (due.length) {
        a.lastFired = now;
        changed = true;
        // Arşive kayıt: telefonda kaçırılanlar bildirim olarak çaldığı için hepsi,
        // web'de yalnızca ekranda gösterilen son alarm
        (N ? due : due.slice(-1)).forEach((t) => addArchive(n, t));
        if (!N) {
          beep();
          showAlarm(n);
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification(personLabel(n), { body: n.notes || '', tag: n.id }); } catch (e) { /* */ }
          }
        }
      }
    }
    if (changed) { save(); saveArchive(); if (!$('archiveView').hidden) renderArchive(); }
    updateNextInfo();
  }
  setInterval(checkAlarms, 10000);

  // ---------- Arşiv ekranı ----------
  const arBody = $('arBody');
  let arFilteredIds = [];
  const arSearch = createChipSearch($('arSearchBox'), $('arChips'), $('arSearchInput'), $('arClear'), () => renderArchive());
  const fmtDateTime = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${nowTime(d)}`; };
  const archiveLabel = (r) => [r.name, r.phone].filter(Boolean).join(' - ') || '(isimsiz)';
  // Arşivde telefon tıklanamaz, sadece kalın yazılır
  function archivePerson(r) {
    if (!r.name && !r.phone) return '<span class="p-name">(isimsiz)</span>';
    return `<div class="p-line">${r.name ? `<span class="p-name">${esc(r.name)}</span>` : ''}${r.phone ? `<span class="p-tel-plain">${esc(r.phone)}</span>` : ''}</div>`;
  }
  function renderArchive() {
    const terms = arSearch.terms();
    const rows = archive.slice().sort((a, b) => b.at - a.at).filter((r) => {
      if (!terms.length) return true;
      const h = lower([r.name, r.phone, String(r.phone || '').replace(/\D/g, ''), fmtDateTime(r.at), r.notes].join(' \u0001 '));
      return terms.some((t) => h.includes(t)); // her kelimeye uyan kayıt ayrı ayrı bulunur
    });
    arFilteredIds = rows.map((r) => r.id);
    $('arDelFiltered').disabled = !rows.length;
    arBody.innerHTML = rows.map((r) => {
      const [d, t] = fmtDateTime(r.at).split(' ');
      return `
      <tr data-id="${r.id}">
        <td><div class="p-cell">${archivePerson(r)}</div></td>
        <td class="d"><span class="d-date">${d}</span> <span class="d-time">${t}</span></td>
        <td><div class="n-text">${esc(r.notes || '')}</div></td>
      </tr>`;
    }).join('');
    $('arCount').textContent = archive.length ? `(${rows.length}/${archive.length})` : '';
    const empty = $('arEmpty');
    empty.hidden = rows.length > 0;
    empty.textContent = archive.length ? 'Aramaya uyan arşiv kaydı bulunamadı.' : 'Arşiv boş. Çalan alarmlar burada listelenir.';
  }
  let arLastTap = { id: null, t: 0 };
  arBody.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (Date.now() < suppressClickUntil) return; // basılı tutma sonrası tıklama
    // Çift tıklama: kaydı salt okunur pencerede aç
    const now = Date.now();
    if (arLastTap.id === tr.dataset.id && now - arLastTap.t < 450) {
      arLastTap = { id: null, t: 0 };
      openArView(tr.dataset.id);
    } else {
      arLastTap = { id: tr.dataset.id, t: now };
    }
  });
  async function deleteArchive(id) {
    const r = archive.find((x) => x.id === id);
    if (!r) return;
    if (!(await confirmBox(`${archiveLabel(r)}\n${fmtDateTime(r.at)}\n\nArşiv kaydı silinsin mi?`))) return;
    archive = archive.filter((x) => x.id !== id);
    saveArchive(); renderArchive();
  }
  attachRowMenu(arBody, (id) => deleteArchive(id));
  // Filtreye uyan (ekranda listelenen) arşiv kayıtlarını sil
  $('arDelFiltered').addEventListener('click', async () => {
    if (!arFilteredIds.length) return;
    const msg = arSearch.terms().length
      ? 'Filtrelenen arşiv kayıtlarını silmek istiyor musunuz?'
      : 'Tüm arşiv kayıtlarını silmek istiyor musunuz?';
    if (!(await confirmBox(msg))) return;
    const del = new Set(arFilteredIds);
    archive = archive.filter((x) => !del.has(x.id));
    saveArchive(); renderArchive();
  });
  function openArView(id) {
    const r = archive.find((x) => x.id === id);
    if (!r) return;
    $('avPerson').textContent = archiveLabel(r);
    $('avDate').textContent = fmtDateTime(r.at);
    $('avNotes').textContent = r.notes || '';
    $('arViewModal').hidden = false;
  }
  const closeArView = () => { $('arViewModal').hidden = true; };
  $('avClose').addEventListener('click', closeArView);
  function openArchive() { renderArchive(); $('archiveView').hidden = false; }
  function closeArchive() { $('archiveView').hidden = true; }
  $('archiveBtn').addEventListener('click', openArchive);
  $('arClose').addEventListener('click', closeArchive);

  // ---------- Android bildirim planlama ----------
  let schedTimer = null;
  function scheduleNative() {
    if (!N) return;
    clearTimeout(schedTimer);
    schedTimer = setTimeout(doScheduleNative, 300);
  }
  async function doScheduleNative() {
    const LN = N.LocalNotifications;
    try {
      const pending = await LN.getPending();
      if (pending && pending.notifications && pending.notifications.length) {
        await LN.cancel({ notifications: pending.notifications.map((p) => ({ id: p.id })) });
      }
      const now = Date.now() + 2000;
      const list = [];
      let id = 1;
      for (const n of notes) {
        const a = n.alarm;
        if (!a || !a.enabled) continue;
        for (const t of occurrences(a, Math.max(now, a.lastFired || 0), 40)) {
          if (list.length >= 450) break;
          list.push({
            id: id++,
            title: personLabel(n),
            body: n.notes || ' ',
            largeBody: n.notes || ' ',
            channelId: 'alarmlar',
            schedule: { at: new Date(t), allowWhileIdle: true },
            extra: { noteId: n.id },
          });
        }
      }
      if (list.length) await LN.schedule({ notifications: list });
    } catch (e) {
      console.error('Bildirim planlanamadı', e);
    }
  }

  async function initNative() {
    if (!N) return;
    const LN = N.LocalNotifications;
    try {
      await LN.createChannel({ id: 'alarmlar', name: 'Alarmlar', description: 'Not hatırlatmaları', importance: 5, visibility: 1, vibration: true });
    } catch (e) { /* */ }
    try {
      const p = await LN.checkPermissions();
      if (p.display !== 'granted') await LN.requestPermissions();
    } catch (e) { /* */ }
    try {
      if (LN.checkExactNotificationSetting) {
        const ex = await LN.checkExactNotificationSetting();
        if (ex && ex.exact_alarm && ex.exact_alarm !== 'granted') {
          if (await confirmBox('Alarmların tam zamanında çalabilmesi için "Alarmlar ve hatırlatıcılar" iznini açmanız gerekiyor. Ayarlar açılsın mı?')) {
            await LN.changeExactNotificationSetting();
          }
        }
      }
    } catch (e) { /* */ }
    try {
      LN.addListener('localNotificationActionPerformed', (ev) => {
        const id = ev && ev.notification && ev.notification.extra && ev.notification.extra.noteId;
        const n = id && byId(id);
        if (n) showAlarm(n);
      });
    } catch (e) { /* */ }
    try {
      N.App.addListener('resume', () => { checkAlarms(); scheduleNative(); });
      N.App.addListener('backButton', handleBack);
    } catch (e) { /* */ }
    scheduleNative();
  }

  // ---------- Çıkış onayı ----------
  let exiting = false;
  async function handleBack() {
    if (!rowMenu.hidden) { closeRowMenu(); return; }
    if (!$('confirmModal').hidden) { closeConfirm(false); return; }
    if (!$('clockModal').hidden) { closeClock(false); return; }
    if (!$('alarmModal').hidden) { closeAlarmPopup(); return; }
    if (!$('noteModal').hidden) { cancelNote(); return; }
    if (!$('arViewModal').hidden) { closeArView(); return; }
    if (!$('archiveView').hidden) { closeArchive(); return; }
    if (exiting) return;
    exiting = true;
    const ok = await confirmBox('Uygulamadan çıkmak istediğinize emin misiniz?');
    exiting = false;
    if (ok) N.App.exitApp();
  }
  if (!N) {
    window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; return ''; });
  }

  // Esc ile pencere kapatma (masaüstü)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!rowMenu.hidden) closeRowMenu();
    else if (!$('confirmModal').hidden) closeConfirm(false);
    else if (!$('clockModal').hidden) closeClock(false);
    else if (!$('alarmModal').hidden) closeAlarmPopup();
    else if (!$('noteModal').hidden) cancelNote();
    else if (!$('arViewModal').hidden) closeArView();
    else if (!$('archiveView').hidden) closeArchive();
  });

  // ---------- Başlat ----------
  renderTable();
  // Açılışta kayıt varsa tablodaki ilk kayıt seçili gelsin
  const firstRow = tbody.querySelector('tr[data-id]');
  if (firstRow) selectNote(firstRow.dataset.id);
  loadAlarmPanel();
  checkAlarms();
  initNative();
})();
