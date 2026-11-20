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

  // ---------- Arama ----------
  const chipsEl = $('chips'), searchInput = $('searchInput'), clearBtn = $('clearSearch');
  let chips = [];

  function addChipsFrom(text) {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    chips.push(...words);
    return true;
  }
  function renderChips() {
    chipsEl.innerHTML = chips.map((w, i) =>
      `<span class="chip"><span>${esc(w)}</span><button type="button" class="x-black" data-i="${i}" title="Sil" aria-label="${esc(w)} sil">&times;</button></span>`).join('');
    clearBtn.hidden = !chips.length && !searchInput.value;
  }
  searchInput.addEventListener('input', () => {
    const v = searchInput.value;
    if (/\s/.test(v)) {
      const parts = v.split(/\s+/);
      const rest = /\s$/.test(v) ? '' : parts.pop();
      addChipsFrom(parts.join(' '));
      searchInput.value = rest;
      renderChips();
    }
    clearBtn.hidden = !chips.length && !searchInput.value;
    renderTable();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (addChipsFrom(searchInput.value)) { searchInput.value = ''; renderChips(); renderTable(); }
      searchInput.blur();
    } else if (e.key === 'Backspace' && !searchInput.value && chips.length) {
      chips.pop(); renderChips(); renderTable();
    }
  });
  searchInput.addEventListener('blur', () => {
    if (addChipsFrom(searchInput.value)) { searchInput.value = ''; renderChips(); renderTable(); }
  });
  chipsEl.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    e.stopPropagation();
    chips.splice(Number(b.dataset.i), 1);
    renderChips(); renderTable();
  });
  clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chips = []; searchInput.value = '';
    renderChips(); renderTable();
  });
  $('searchBox').addEventListener('click', (e) => { if (e.target === e.currentTarget) searchInput.focus(); });

  function searchTerms() {
    return chips.concat(searchInput.value.split(/\s+/)).map(lower).filter(Boolean);
  }
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
      return terms.every((t) => h.includes(t));
    });
    tbody.innerHTML = rows.map((n) => `
      <tr data-id="${n.id}" class="${n.id === selectedId ? 'sel' : ''}">
        <td class="d"><span class="d-date">${esc(fmtDate(n.date))}</span> <span class="d-time">${esc(n.time || '')}${n.alarm && n.alarm.enabled ? '<span class="bell" title="Alarm var">🔔</span>' : ''}</span></td>
        <td>${personLine(n.name, n.phone)}${personLine(n.name2, n.phone2)}</td>
        <td><div class="n-text">${esc(n.notes || '')}</div></td>
        <td><button type="button" class="del" title="Sil" aria-label="Sil">&times;</button></td>
      </tr>`).join('');
    const empty = $('empty');
    empty.hidden = rows.length > 0;
    empty.textContent = notes.length ? 'Aramaya uyan not bulunamadı.' : 'Henüz not yok. “Not Ekle” ile başlayın.';
  }

  let lastTap = { id: null, t: 0 };
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('a.p-tel')) { e.stopPropagation(); return; } // telefon arama ekranı açılır
    if (e.target.closest('button.del')) { e.stopPropagation(); deleteNote(id); return; }
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
    const parts = [n.name, n.phone].filter(Boolean);
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

  function alarmMessage(n) {
    return [personLabel(n), [n.name2, n.phone2].filter(Boolean).join(' - '), n.notes ? '\n' + n.notes : '']
      .filter(Boolean).join('\n');
  }
  function showAlarm(n) {
    $('alarmText').textContent = alarmMessage(n);
    $('alarmModal').hidden = false;
    selectNote(n.id);
    const tr = tbody.querySelector(`tr[data-id="${CSS.escape(n.id)}"]`);
    if (tr) tr.scrollIntoView({ block: 'nearest' });
  }
  $('alarmOk').addEventListener('click', () => { $('alarmModal').hidden = true; });

  function checkAlarms() {
    const now = Date.now();
    let changed = false;
    for (const n of notes) {
      const a = n.alarm;
      if (!a || !a.enabled) continue;
      const due = occurrences(a, a.lastFired || 0, 1);
      if (due.length && due[0] <= now) {
        a.lastFired = now;
        changed = true;
        if (!N) {
          beep();
          showAlarm(n);
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification('Hatırlatma: ' + personLabel(n), { body: n.notes || '', tag: n.id }); } catch (e) { /* */ }
          }
        }
      }
    }
    if (changed) save();
    updateNextInfo();
  }
  setInterval(checkAlarms, 10000);

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
            title: 'Hatırlatma: ' + personLabel(n),
            body: [[n.name2, n.phone2].filter(Boolean).join(' - '), n.notes || ''].filter(Boolean).join('\n') || ' ',
            largeBody: alarmMessage(n),
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
    if (!$('confirmModal').hidden) { closeConfirm(false); return; }
    if (!$('clockModal').hidden) { closeClock(false); return; }
    if (!$('alarmModal').hidden) { $('alarmModal').hidden = true; return; }
    if (!$('noteModal').hidden) { cancelNote(); return; }
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
    if (!$('confirmModal').hidden) closeConfirm(false);
    else if (!$('clockModal').hidden) closeClock(false);
    else if (!$('alarmModal').hidden) $('alarmModal').hidden = true;
    else if (!$('noteModal').hidden) cancelNote();
  });

  // ---------- Başlat ----------
  renderChips();
  renderTable();
  // Açılışta kayıt varsa tablodaki ilk kayıt seçili gelsin
  const firstRow = tbody.querySelector('tr[data-id]');
  if (firstRow) selectNote(firstRow.dataset.id);
  loadAlarmPanel();
  checkAlarms();
  initNative();
})();
