// ════════════════════════════════════════
// Haushaltsplan – App-Logik mit Supabase
// ════════════════════════════════════════

const GOAL = 300;
const STAGES = [
  {min:0,   max:74,  id:'s-egg',     label:'Panda-Ei 🥚'},
  {min:75,  max:149, id:'s-baby',    label:'Baby-Panda 🐼'},
  {min:150, max:224, id:'s-growing', label:'Wachsender Panda 🐼🎋'},
  {min:225, max:299, id:'s-big',     label:'Großer Panda 🐼🎋🎋'},
  {min:300, max:Infinity, id:'s-happy', label:'Ausgewachsen & glücklich 🐼✨'}
];

let db;
let tasksCache = {};   // task_id -> { done, done_by, points }
let scores = { lena: 0, pascal: 0 };
let resets = { last_daily: null, last_weekly: null, last_monthly: null };

// ── INIT ──
function checkConfig() {
  const url = localStorage.getItem('hp-supabase-url');
  const key = localStorage.getItem('hp-supabase-key');
  if (!url || !key) {
    document.getElementById('setup-overlay').style.display = 'flex';
    return false;
  }
  window.SUPABASE_URL = url;
  window.SUPABASE_ANON_KEY = key;
  return true;
}

async function saveSetup() {
  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();
  const errEl = document.getElementById('setup-error');
  errEl.style.display = 'none';

  if (!url || !key) {
    errEl.textContent = 'Bitte beide Felder ausfüllen.';
    errEl.style.display = 'block';
    return;
  }
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    errEl.textContent = 'Das sieht nicht nach einer gültigen Supabase-URL aus (sollte mit https://... .supabase.co enden).';
    errEl.style.display = 'block';
    return;
  }

  // Testen ob die Verbindung klappt
  try {
    const testClient = window.supabase.createClient(url, key);
    const { error } = await testClient.from('household_scores').select('id').eq('id', 1).single();
    if (error) {
      errEl.textContent = 'Verbindung fehlgeschlagen: ' + error.message + ' (Hast du das SQL-Schema schon ausgeführt?)';
      errEl.style.display = 'block';
      return;
    }
  } catch (e) {
    errEl.textContent = 'Verbindung fehlgeschlagen: ' + e.message;
    errEl.style.display = 'block';
    return;
  }

  localStorage.setItem('hp-supabase-url', url);
  localStorage.setItem('hp-supabase-key', key);
  document.getElementById('setup-overlay').style.display = 'none';
  window.SUPABASE_URL = url;
  window.SUPABASE_ANON_KEY = key;
  init();
}


async function init() {
  if (!checkConfig()) return;

  db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  await loadScores();
  await loadResets();
  await checkAutoReset();
  await loadTasks();

  restoreChecks();
  updateScoreboard();
  updateProgress('view-taeglich');
  updateTabResets();
  setInterval(updateTabResets, 60000);
  setInterval(checkAutoReset, 60000);

  subscribeRealtime();
  setSyncStatus(true);
}

// ── DATE HELPERS ──
function todayStr(){return new Date().toISOString().slice(0,10);}
function mondayStr(){const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day,m=new Date(d);m.setDate(d.getDate()+diff);return m.toISOString().slice(0,10);}
function firstOfMonthStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';}

// ── SUPABASE: LOAD ──
async function loadScores() {
  const { data, error } = await db.from('household_scores').select('*').eq('id', 1).single();
  if (error) { console.error('loadScores', error); return; }
  scores.lena = Number(data.lena_points) || 0;
  scores.pascal = Number(data.pascal_points) || 0;
}

async function loadResets() {
  const { data, error } = await db.from('household_resets').select('*').eq('id', 1).single();
  if (error) { console.error('loadResets', error); return; }
  resets.last_daily = data.last_daily;
  resets.last_weekly = data.last_weekly;
  resets.last_monthly = data.last_monthly;
}

async function loadTasks() {
  const { data, error } = await db.from('household_tasks').select('*');
  if (error) { console.error('loadTasks', error); return; }
  tasksCache = {};
  data.forEach(row => {
    tasksCache[row.task_id] = { done: row.done, done_by: row.done_by, points: Number(row.points) || 0 };
  });
}

// ── AUTO RESET ──
async function checkAutoReset() {
  const today = todayStr(), monday = mondayStr(), fom = firstOfMonthStr();
  let needsUpdate = {};

  if (resets.last_daily !== today) {
    await clearViewTasksRemote('taeglich');
    needsUpdate.last_daily = today;
  }
  if (resets.last_weekly !== monday) {
    await clearViewTasksRemote('woechentlich');
    needsUpdate.last_weekly = monday;
  }
  if (resets.last_monthly !== fom) {
    await clearViewTasksRemote('monatlich');
    needsUpdate.last_monthly = fom;
  }

  if (Object.keys(needsUpdate).length > 0) {
    resets = { ...resets, ...needsUpdate };
    await db.from('household_resets').update(needsUpdate).eq('id', 1);
  }
}

async function clearViewTasksRemote(viewName) {
  const view = document.getElementById('view-' + viewName);
  if (!view) return;
  const ids = Array.from(view.querySelectorAll('.task[data-id]')).map(t => t.dataset.id);
  if (ids.length === 0) return;
  await db.from('household_tasks').delete().in('task_id', ids);
  ids.forEach(id => delete tasksCache[id]);
  document.querySelectorAll('.task.done').forEach(t => {
    if (ids.includes(t.dataset.id)) t.classList.remove('done');
  });
}

// ── RENDER ──
function restoreChecks() {
  document.querySelectorAll('.task[data-id]').forEach(t => {
    const id = t.dataset.id;
    const cached = tasksCache[id];
    if (cached && cached.done) {
      t.classList.add('done');
      const dbEl = t.querySelector('.done-by');
      if (dbEl) setLabel(dbEl, cached.done_by);
    } else {
      t.classList.remove('done');
    }
  });
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);
}

function setLabel(el, who) {
  if (who === 'lena') { el.textContent = 'Lena ✓'; el.className = 'done-by lena'; }
  else if (who === 'pascal') { el.textContent = 'Pascal ✓'; el.className = 'done-by pascal'; }
  else if (who === 'together') { el.textContent = 'Lena & Pascal ✓'; el.className = 'done-by gem'; }
  else { el.textContent = 'Lena oder Pascal ✓'; el.className = 'done-by wer'; }
}

// ── MODAL ──
let pendingEl = null;
function toggle(el) {
  if (el.classList.contains('done')) { uncheck(el); return; }
  const who = el.dataset.who;
  if (who === 'together' || who === 'lena' || who === 'pascal') {
    check(el, who);
  } else {
    pendingEl = el;
    document.getElementById('modal-task').textContent = el.querySelector('.task-label').textContent.trim();
    document.getElementById('modal').classList.add('visible');
  }
}
function confirmWho(who) {
  document.getElementById('modal').classList.remove('visible');
  if (pendingEl) { check(pendingEl, who); pendingEl = null; }
}
function cancelModal() {
  document.getElementById('modal').classList.remove('visible');
  pendingEl = null;
}

// ── CHECK / UNCHECK (writes to Supabase) ──
async function check(el, who) {
  const pts = parseFloat(el.dataset.pts) || 1;
  const id = el.dataset.id;

  // Optimistic UI update
  el.classList.add('done');
  const dbEl = el.querySelector('.done-by');
  if (dbEl) setLabel(dbEl, who);

  if (who === 'lena') scores.lena += pts;
  else if (who === 'pascal') scores.pascal += pts;
  else { scores.lena += Math.ceil(pts/2); scores.pascal += Math.floor(pts/2); }

  tasksCache[id] = { done: true, done_by: who, points: pts };
  updateScoreboard();
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);

  // Write to Supabase
  setSyncStatus(false);
  await db.from('household_tasks').upsert({
    task_id: id, done: true, done_by: who, points: pts, checked_at: new Date().toISOString()
  });
  await db.from('household_scores').update({
    lena_points: scores.lena, pascal_points: scores.pascal
  }).eq('id', 1);
  setSyncStatus(true);
}

async function uncheck(el) {
  const id = el.dataset.id;
  const prev = tasksCache[id];

  el.classList.remove('done');

  if (prev) {
    if (prev.done_by === 'lena') scores.lena = Math.max(0, scores.lena - prev.points);
    else if (prev.done_by === 'pascal') scores.pascal = Math.max(0, scores.pascal - prev.points);
    else {
      scores.lena = Math.max(0, scores.lena - Math.ceil(prev.points/2));
      scores.pascal = Math.max(0, scores.pascal - Math.floor(prev.points/2));
    }
    delete tasksCache[id];
  }
  updateScoreboard();
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);

  setSyncStatus(false);
  await db.from('household_tasks').delete().eq('task_id', id);
  await db.from('household_scores').update({
    lena_points: scores.lena, pascal_points: scores.pascal
  }).eq('id', 1);
  setSyncStatus(true);
}

// ── SCOREBOARD / PANDA ──
function updatePanda(total) {
  STAGES.forEach(s => document.getElementById(s.id).setAttribute('display', 'none'));
  const stage = STAGES.find(s => total >= s.min && total <= s.max) || STAGES[STAGES.length - 1];
  document.getElementById(stage.id).setAttribute('display', 'block');
  document.getElementById('panda-label').textContent = stage.label;
}

function updateScoreboard() {
  const total = scores.lena + scores.pascal;
  document.getElementById('score-lena').textContent = scores.lena;
  document.getElementById('score-pascal').textContent = scores.pascal;
  document.getElementById('bamboo-lena').textContent = '🎋 ' + scores.lena;
  document.getElementById('bamboo-pascal').textContent = '🎋 ' + scores.pascal;
  document.getElementById('total-bamboo').textContent = total;
  const pct = Math.min(100, Math.round((total / GOAL) * 100));
  document.getElementById('goal-fill').style.width = pct + '%';
  document.getElementById('goal-pct').textContent = pct + '%';
  updatePanda(total);

  const r = document.getElementById('goal-reached');
  if (total >= GOAL) {
    let msg = '🎉 300 Bambus! Der Panda ist ausgewachsen & happy!<br>';
    if (scores.lena > scores.pascal) msg += `Lena darf entscheiden (${scores.lena}🎋 vs ${scores.pascal}🎋) 🎊`;
    else if (scores.pascal > scores.lena) msg += `Pascal darf entscheiden (${scores.pascal}🎋 vs ${scores.lena}🎋) 🎊`;
    else msg += 'Unentschieden — gemeinsam entscheiden! 🎊';
    r.innerHTML = msg; r.classList.add('visible');
  } else {
    r.classList.remove('visible');
  }
}

function updateProgress(viewId) {
  const v = document.getElementById(viewId);
  if (!v) return;
  const all = v.querySelectorAll('.task'), done = v.querySelectorAll('.task.done');
  document.getElementById('prog-fill').style.width = (all.length ? Math.round((done.length/all.length)*100) : 0) + '%';
}

function showView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  btn.classList.add('active');
  updateProgress('view-' + name);
}

// ── MANUAL MONTH RESET ──
async function resetScores() {
  if (!confirm('Monat zurücksetzen?\nAlle Bambus, Panda-Fortschritt und Häkchen werden gelöscht.')) return;

  scores = { lena: 0, pascal: 0 };
  tasksCache = {};
  document.querySelectorAll('.task.done').forEach(t => t.classList.remove('done'));
  updateScoreboard();
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);

  setSyncStatus(false);
  await db.from('household_tasks').delete().neq('task_id', '');
  await db.from('household_scores').update({ lena_points: 0, pascal_points: 0 }).eq('id', 1);
  setSyncStatus(true);
}

// ── TAB RESET COUNTDOWN ──
function updateTabResets() {
  const now = new Date();
  const nm = new Date(now); nm.setHours(24,0,0,0);
  const dm = Math.round((nm-now)/60000), hD = Math.floor(dm/60), mD = dm%60;
  document.getElementById('tab-reset-taeglich').textContent = 'Reset in ' + hD + 'h ' + mD + 'min';

  const day = now.getDay(), dtm = day===0?1:8-day, nxt = new Date(now);
  nxt.setDate(now.getDate()+dtm); nxt.setHours(0,0,0,0);
  document.getElementById('tab-reset-woechentlich').textContent = 'Reset in ' + Math.round((nxt-now)/3600000) + 'h';

  const nf = new Date(now.getFullYear(), now.getMonth()+1, 1);
  document.getElementById('tab-reset-monatlich').textContent = 'Reset in ' + Math.round((nf-now)/86400000) + ' Tagen';
}

// ── REALTIME SYNC (damit Lena & Pascal live dieselben Häkchen sehen) ──
function subscribeRealtime() {
  db.channel('household-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_tasks' }, payload => {
      handleTaskChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_scores' }, payload => {
      if (payload.new) {
        scores.lena = Number(payload.new.lena_points) || 0;
        scores.pascal = Number(payload.new.pascal_points) || 0;
        updateScoreboard();
      }
    })
    .subscribe(status => {
      setSyncStatus(status === 'SUBSCRIBED');
    });
}

function handleTaskChange(payload) {
  if (payload.eventType === 'DELETE') {
    const id = payload.old.task_id;
    delete tasksCache[id];
    const el = document.querySelector(`.task[data-id="${id}"]`);
    if (el) el.classList.remove('done');
  } else {
    const row = payload.new;
    tasksCache[row.task_id] = { done: row.done, done_by: row.done_by, points: Number(row.points) || 0 };
    const el = document.querySelector(`.task[data-id="${row.task_id}"]`);
    if (el) {
      el.classList.add('done');
      const dbEl = el.querySelector('.done-by');
      if (dbEl) setLabel(dbEl, row.done_by);
    }
  }
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);
}

function setSyncStatus(online) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (!dot || !text) return;
  if (online) { dot.classList.remove('offline'); text.textContent = 'verbunden'; }
  else { dot.classList.add('offline'); text.textContent = 'speichert…'; }
}

// ── MODAL CLOSE ON OVERLAY CLICK ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) cancelModal();
  });
  init();
});
