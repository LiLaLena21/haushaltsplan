// ════════════════════════════════════════
// Haushaltsplan – App-Logik mit Supabase
// ════════════════════════════════════════

// ── VERSION & CHANGELOG ──
const APP_VERSION = '1.1.3';
const CHANGELOG = [
  { v: '1.1.3', date: '25.07.2026', items: [
    '🎫 „Was ist neu?"-Updates wie dieses hier',
  ]},
  { v: '1.1.2', date: '25.07.2026', items: [
    '🐼 Panda deutlich größer – wächst jetzt sichtbar von Stufe zu Stufe',
    '🏅 Abzeichen-Regal zeigt immer alle 9 Abzeichen (offene ausgegraut)',
    '🧹 Tagessieg & Serie schon ab 70 % der Tagesaufgaben',
    '🌅 Früher Vogel gilt jetzt vor 9 Uhr',
  ]},
  { v: '1.1.1', date: '25.07.2026', items: [
    '✨ Süßere Chibi-Pandas',
    '🎋 Bambus-Hintergrund kräftiger, mit Tatzenspuren',
    '📐 Neues Spalten-Layout – alles auf einen Blick, kein Scrollen in Spalten',
  ]},
  { v: '1.1.0', date: '25.07.2026', items: [
    '⚔️ Duell-Leiste Lena vs Pascal mit frechen Sprüchen',
    '🔥 Tage-Serie & 9 freischaltbare Abzeichen',
    '🎉 Panda hüpft beim Abhaken, Bambus fliegt zum Punktestand',
  ]},
  { v: '1.0.1', date: '25.07.2026', items: [
    '🐛 Bugfixes: Mitternachts-Reset, Punkteverlust bei gleichzeitigem Abhaken',
    '📱 Mobile-Ansicht & Fehleranzeige beim Speichern',
  ]},
  { v: '1.0.0', date: '2026', items: [
    '🏠 Der Haushaltsplan: Aufgaben, Bambus-Punkte, Panda & Realtime-Sync',
  ]},
];

const GOAL = 375;
const STAGES = [
  {min:0,   max:75,  id:'s-baby',  label:'Baby Panda 🐼'},
  {min:76,  max:175, id:'s-teen',  label:'Teenager Panda 🐼🎋'},
  {min:176, max:300, id:'s-adult', label:'Ausgewachsener Panda 🐼🎋🎋'},
  {min:301, max:Infinity, id:'s-happy', label:'Glücklicher Panda 🐼✨'},
];

let db;
let tasksCache = {};
let scores = { lena: 0, pascal: 0 };
let resets = { last_daily: null, last_weekly: null, last_monthly: null };
let goalShown = false;

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
    errEl.textContent = 'Das sieht nicht nach einer gültigen Supabase-URL aus.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const testClient = window.supabase.createClient(url, key);
    const { error } = await testClient.from('household_scores').select('id').eq('id', 1).single();
    if (error) {
      errEl.textContent = 'Verbindung fehlgeschlagen: ' + error.message;
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

  if (!window.supabase) {
    setSyncStatus(false, 'offline – Seite neu laden');
    return;
  }
  db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  await Promise.all([loadScores(), loadResets(), loadStats(), loadBadges()]);
  await checkAutoReset();
  await loadTasks();

  restoreChecks();
  updateScoreboard();
  renderStreak();
  renderBadgeShelf();
  updateProgress('view-taeglich');
  updateTabResets();
  setInterval(updateTabResets, 60000);
  setInterval(checkAutoReset, 60000);

  subscribeRealtime();
  setSyncStatus(true);
}

// ── DATE HELPERS ──
// Wichtig: lokales Datum verwenden, nicht UTC (toISOString)!
// Sonst passiert der Tages-Reset erst um 1/2 Uhr nachts statt um Mitternacht.
function localDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function todayStr(){return localDateStr(new Date());}
function mondayStr(){const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day,m=new Date(d);m.setDate(d.getDate()+diff);return localDateStr(m);}
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
// Vor jedem Reset frisch aus der DB laden, damit ein Gerät, das z.B. über
// Nacht im Standby war, nicht mit veralteten Daten die heutigen Häkchen löscht.
async function checkAutoReset() {
  await loadResets();

  const targets = [
    { field: 'last_daily',   val: todayStr(),        view: 'taeglich' },
    { field: 'last_weekly',  val: mondayStr(),       view: 'woechentlich' },
    { field: 'last_monthly', val: firstOfMonthStr(), view: 'monatlich' },
  ];

  for (const t of targets) {
    if (resets[t.field] === t.val) continue;

    // Erst Häkchen löschen (idempotent – doppelt löschen schadet nicht),
    // dann den Reset-Zeitstempel nur setzen, wenn er noch der alte ist.
    // So überschreiben sich zwei Geräte um Mitternacht nicht gegenseitig.
    await clearViewTasksRemote(t.view);
    let q = db.from('household_resets').update({ [t.field]: t.val }).eq('id', 1);
    q = resets[t.field] === null ? q.is(t.field, null) : q.eq(t.field, resets[t.field]);
    const { error } = await q;
    if (error) { console.error('checkAutoReset', error); continue; }
    resets[t.field] = t.val;
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
  if (el.dataset.busy === '1') return; // Doppelklick-Schutz, solange gespeichert wird
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

// ── CHECK / UNCHECK ──
// Punkteänderungen als DELTA an die Datenbank schicken (RPC apply_score_delta),
// statt den kompletten Punktestand zu überschreiben. Sonst gehen Punkte verloren,
// wenn Lena und Pascal (fast) gleichzeitig etwas abhaken: Beide lesen z.B. "10",
// beide schreiben "11" – ein Punkt ist weg. Mit Deltas rechnet die DB atomar.
function scoreDelta(who, pts) {
  if (who === 'lena') return { lena: pts, pascal: 0 };
  if (who === 'pascal') return { lena: 0, pascal: pts };
  return { lena: Math.ceil(pts / 2), pascal: Math.floor(pts / 2) };
}

async function applyScoreDelta(dLena, dPascal) {
  const { error } = await db.rpc('apply_score_delta', { lena_delta: dLena, pascal_delta: dPascal });
  if (error) {
    // Fallback für alte DB ohne die RPC-Funktion (siehe migration.sql)
    console.warn('apply_score_delta RPC fehlt – Fallback auf Überschreiben. Bitte migration.sql ausführen.', error);
    const { error: e2 } = await db.from('household_scores').update({
      lena_points: scores.lena, pascal_points: scores.pascal
    }).eq('id', 1);
    return e2;
  }
  return null;
}

async function check(el, who) {
  const pts = parseFloat(el.dataset.pts) || 1;
  const id = el.dataset.id;
  const d = scoreDelta(who, pts);

  el.dataset.busy = '1';
  el.classList.add('done');
  const dbEl = el.querySelector('.done-by');
  if (dbEl) setLabel(dbEl, who);

  scores.lena += d.lena;
  scores.pascal += d.pascal;
  tasksCache[id] = { done: true, done_by: who, points: pts };
  updateScoreboard();
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);

  // 🎉 sofortiges Feedback
  pandaCelebrate();
  flyBamboo(el.querySelector('.checkbox'), who);

  setSyncStatus(false);
  try {
    const { error } = await db.from('household_tasks').upsert({
      task_id: id, done: true, done_by: who, points: pts, checked_at: new Date().toISOString()
    });
    if (error) throw error;
    const e2 = await applyScoreDelta(d.lena, d.pascal);
    if (e2) throw e2;
    setSyncStatus(true);
    await checkStreak();
    checkBadges(who);
  } catch (e) {
    console.error('check', e);
    // Speichern fehlgeschlagen → UI zurückrollen, damit nichts "erfunden" wird
    scores.lena -= d.lena;
    scores.pascal -= d.pascal;
    delete tasksCache[id];
    el.classList.remove('done');
    updateScoreboard();
    if (av) updateProgress(av.id);
    setSyncStatus(false, 'Fehler beim Speichern');
  } finally {
    delete el.dataset.busy;
  }
}

async function uncheck(el) {
  const id = el.dataset.id;
  const prev = tasksCache[id];
  if (!prev) { el.classList.remove('done'); return; }

  const d = scoreDelta(prev.done_by, prev.points);
  // Nicht unter 0 abziehen (z.B. nach manuellem Monats-Reset)
  d.lena = Math.min(d.lena, scores.lena);
  d.pascal = Math.min(d.pascal, scores.pascal);

  el.dataset.busy = '1';
  el.classList.remove('done');
  scores.lena -= d.lena;
  scores.pascal -= d.pascal;
  delete tasksCache[id];
  updateScoreboard();
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);

  setSyncStatus(false);
  try {
    const { error } = await db.from('household_tasks').delete().eq('task_id', id);
    if (error) throw error;
    const e2 = await applyScoreDelta(-d.lena, -d.pascal);
    if (e2) throw e2;
    setSyncStatus(true);
  } catch (e) {
    console.error('uncheck', e);
    scores.lena += d.lena;
    scores.pascal += d.pascal;
    tasksCache[id] = prev;
    el.classList.add('done');
    updateScoreboard();
    if (av) updateProgress(av.id);
    setSyncStatus(false, 'Fehler beim Speichern');
  } finally {
    delete el.dataset.busy;
  }
}

// ── GAMIFICATION: ANIMATIONEN ──
function pandaCelebrate() {
  const wrap = document.getElementById('panda-svg-wrap');
  if (!wrap) return;
  wrap.classList.remove('happy');
  void wrap.offsetWidth; // Animation neu starten
  wrap.classList.add('happy');
  const sparks = ['✨','🎋','💚','⭐'];
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('span');
    s.className = 'panda-spark';
    s.textContent = sparks[Math.floor(Math.random()*sparks.length)];
    s.style.left = (10 + Math.random()*60) + 'px';
    s.style.top = (Math.random()*30) + 'px';
    s.style.animationDelay = (i*0.12) + 's';
    wrap.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
  setTimeout(() => wrap.classList.remove('happy'), 1000);
}

function flyBamboo(fromEl, who) {
  if (!fromEl) return;
  const targets = who === 'lena' ? ['bamboo-lena']
                : who === 'pascal' ? ['bamboo-pascal']
                : ['bamboo-lena', 'bamboo-pascal'];
  const r = fromEl.getBoundingClientRect();
  targets.forEach((tid, i) => {
    const t = document.getElementById(tid);
    if (!t) return;
    const tr = t.getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'fly-bamboo';
    s.textContent = '🎋';
    s.style.left = r.left + 'px';
    s.style.top = r.top + 'px';
    document.body.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      s.style.transform = `translate(${tr.left - r.left + i*4}px, ${tr.top - r.top}px) scale(.55) rotate(20deg)`;
      s.style.opacity = '0.15';
    }));
    setTimeout(() => s.remove(), 900);
  });
}

let toastTimer = null;
function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
}

// ── GAMIFICATION: DUELL ──
const DUEL_LINES = {
  lena: [
    'Lena führt mit {d} 🎋 – Pascal, die Katzen tuscheln schon! 🐱',
    'Team Blau vorn ({d} 🎋) – Pascal, der Abwasch ruft! 🍽️',
    'Lena zieht davon – Zeit für eine Pascal-Aufholjagd! 💪',
    '{d} 🎋 Vorsprung für Lena – Pascal, das Wochenendprogramm rückt in weite Ferne… 😏',
  ],
  pascal: [
    'Pascal führt mit {d} 🎋 – Lena, der Bambus wartet! 🌱',
    'Team Pink vorn ({d} 🎋) – Lena, Konter! ⚡',
    'Pascal im Höhenflug – Lena, lässt du dir das gefallen? 😏',
    '{d} 🎋 Vorsprung für Pascal – Lena, die Wäsche zählt doppelt gut fürs Karma! 👕',
  ],
  tie: [
    'Gleichstand – wer schnappt sich den nächsten Bambus? 👀',
    'Kopf an Kopf – es bleibt spannend! 🤜🤛',
    'Exakt gleichauf – der Panda ist unparteiisch. 🐼',
  ],
};

function updateDuel() {
  const bar = document.getElementById('duel-lena');
  const knot = document.getElementById('duel-knot');
  const line = document.getElementById('duel-line');
  if (!bar || !knot || !line) return;
  const l = scores.lena, p = scores.pascal, total = l + p;
  const pct = total === 0 ? 50 : Math.max(6, Math.min(94, Math.round((l / total) * 100)));
  bar.style.width = pct + '%';
  knot.style.left = pct + '%';
  const d = Math.abs(l - p);
  const key = l > p ? 'lena' : p > l ? 'pascal' : 'tie';
  if (total === 0) { line.textContent = 'Wer sammelt heute den ersten Bambus? 👀'; return; }
  const arr = DUEL_LINES[key];
  line.textContent = arr[(d + new Date().getDate()) % arr.length].replace('{d}', d);
}

// ── GAMIFICATION: STREAKS & ABZEICHEN ──
let statsAvailable = true, badgesAvailable = true;
let stats = { streak: 0, best_streak: 0, last_full_day: null };
let earnedBadges = {};

const BADGES = [
  { id: 'first-bamboo', icon: '🎋', name: 'Erster Bambus', desc: 'Die allererste Aufgabe abgehakt' },
  { id: 'early-bird',   icon: '🌅', name: 'Früher Vogel',  desc: 'Eine Aufgabe vor 9 Uhr erledigt' },
  { id: 'night-owl',    icon: '🦉', name: 'Nachteule',     desc: 'Eine Aufgabe nach 22 Uhr erledigt' },
  { id: 'cat-butler',   icon: '🐱', name: 'Katzen-Butler', desc: 'Alle Katzen-Tagesaufgaben an einem Tag' },
  { id: 'clean-sweep',  icon: '🧹', name: 'Tagessieg',     desc: 'Mind. 70 % der täglichen Aufgaben geschafft' },
  { id: 'streak-3',     icon: '🔥', name: '3er-Serie',     desc: '3 Tage in Folge den Tagessieg geholt' },
  { id: 'streak-7',     icon: '⚡', name: 'Wochen-Serie',  desc: '7 Tage in Folge den Tagessieg geholt' },
  { id: 'halfway',      icon: '🌓', name: 'Halbzeit',      desc: 'Die Hälfte des Bambus-Ziels gesammelt' },
  { id: 'goal',         icon: '🏆', name: 'Ziel erreicht', desc: '375 Bambus – der Panda ist überglücklich' },
];

async function loadStats() {
  const { data, error } = await db.from('household_stats').select('*').eq('id', 1).single();
  if (error) { statsAvailable = false; console.warn('household_stats fehlt – für Streaks bitte migration2_gamification.sql ausführen.'); return; }
  stats = { streak: data.streak || 0, best_streak: data.best_streak || 0, last_full_day: data.last_full_day };
}

async function loadBadges() {
  const { data, error } = await db.from('household_badges').select('*');
  if (error) { badgesAvailable = false; console.warn('household_badges fehlt – für Abzeichen bitte migration2_gamification.sql ausführen.'); return; }
  earnedBadges = {};
  data.forEach(r => earnedBadges[r.badge_id] = r);
}

function displayStreak() {
  // Serie zählt nur, wenn der letzte volle Tag heute oder gestern war
  if (!stats.last_full_day) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (stats.last_full_day === todayStr() || stats.last_full_day === localDateStr(y)) return stats.streak;
  return 0;
}

function renderStreak() {
  const chip = document.getElementById('streak-chip');
  if (!chip) return;
  if (!statsAvailable) { chip.style.display = 'none'; return; }
  const s = displayStreak();
  chip.textContent = '🔥 ' + s;
  chip.title = 'Tage in Folge alles Tägliche geschafft · Rekord: ' + stats.best_streak;
}

// Pflicht-Aufgaben des Tages: alles Tägliche OHNE "alle 2 Tage"-Aufgaben,
// denn die werden absichtlich nicht jeden Tag gemacht.
function requiredDailyTasks() {
  return Array.from(document.querySelectorAll('#view-taeglich .task'))
    .filter(t => !t.querySelector('.freq-label'));
}

// Tagessieg ab 70 % der Pflicht-Aufgaben – ein sehr erfolgreicher Tag reicht!
function dailyGoalReached() {
  const req = requiredDailyTasks();
  if (req.length === 0) return false;
  const done = req.filter(t => t.classList.contains('done')).length;
  return done / req.length >= 0.7;
}

async function checkStreak() {
  if (!statsAvailable) return;
  renderStreak();
  if (!dailyGoalReached()) return;

  const today = todayStr();
  if (stats.last_full_day === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const newStreak = stats.last_full_day === localDateStr(y) ? stats.streak + 1 : 1;
  const newBest = Math.max(newStreak, stats.best_streak);

  // Konditional updaten, damit zwei Geräte den Tag nicht doppelt zählen
  let q = db.from('household_stats').update({ streak: newStreak, best_streak: newBest, last_full_day: today }).eq('id', 1);
  q = stats.last_full_day === null ? q.is('last_full_day', null) : q.eq('last_full_day', stats.last_full_day);
  const { error } = await q;
  if (error) { console.error('checkStreak', error); return; }
  stats = { streak: newStreak, best_streak: newBest, last_full_day: today };
  renderStreak();
  showToast('🔥 ' + newStreak + (newStreak === 1 ? ' Tag' : ' Tage') + ' in Folge alles geschafft!');
  if (newStreak >= 3) awardBadge('streak-3', null);
  if (newStreak >= 7) awardBadge('streak-7', null);
}

async function awardBadge(id, who) {
  if (!badgesAvailable || earnedBadges[id]) return;
  earnedBadges[id] = { earned_by: who || null }; // optimistisch, verhindert Doppel-Insert
  const { error } = await db.from('household_badges').insert({ badge_id: id, earned_by: who || null });
  if (error && error.code !== '23505') { delete earnedBadges[id]; console.error('awardBadge', error); return; }
  renderBadgeShelf(id);
  const b = BADGES.find(x => x.id === id);
  if (b) showToast('🏅 Abzeichen freigeschaltet: ' + b.icon + ' ' + b.name);
}

function checkBadges(who) {
  if (!badgesAvailable) return;
  const total = scores.lena + scores.pascal;
  const h = new Date().getHours();
  if (total > 0) awardBadge('first-bamboo', who);
  if (h < 9) awardBadge('early-bird', who);
  if (h >= 22) awardBadge('night-owl', who);
  const catIds = ['t-k-m', 't-k-mi', 't-k-a', 't-k-klo'];
  if (catIds.every(i => tasksCache[i] && tasksCache[i].done)) awardBadge('cat-butler', who);
  if (dailyGoalReached()) awardBadge('clean-sweep', who);
  if (total >= Math.ceil(GOAL / 2)) awardBadge('halfway', null);
  if (total >= GOAL) awardBadge('goal', null);
}

function renderBadgeShelf(newId) {
  const shelf = document.getElementById('badge-shelf');
  if (!shelf) return;
  shelf.innerHTML = '';
  if (!badgesAvailable) return;
  // Alle Abzeichen zeigen: geholte in Gold, offene ausgegraut
  BADGES.forEach(b => {
    const earned = !!earnedBadges[b.id];
    const d = document.createElement('div');
    d.className = 'shelf-badge ' + (earned ? 'earned' : 'locked') + (b.id === newId ? ' new' : '');
    d.textContent = b.icon;
    d.title = b.name + (earned ? ' ✓' : ' – noch offen');
    shelf.appendChild(d);
  });
}

function openBadges() {
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = '';
  BADGES.forEach(b => {
    const e = earnedBadges[b.id];
    const card = document.createElement('div');
    card.className = 'badge-card ' + (e ? 'earned' : 'locked');
    const byName = e && (e.earned_by === 'lena' ? 'Lena' : e.earned_by === 'pascal' ? 'Pascal' : e.earned_by === 'together' ? 'Lena & Pascal' : null);
    card.innerHTML = '<div class="bi">' + b.icon + '</div><div class="bn">' + b.name + '</div><div class="bd">' + b.desc + '</div>'
      + (byName ? '<div class="bby">geholt von ' + byName + '</div>' : '');
    grid.appendChild(card);
  });
  document.getElementById('badges-modal').classList.add('visible');
}
function closeBadges() {
  document.getElementById('badges-modal').classList.remove('visible');
}

// ── WAS IST NEU? ──
function openWhatsNew() {
  const list = document.getElementById('whatsnew-list');
  list.innerHTML = '';
  CHANGELOG.forEach(rel => {
    const h = document.createElement('div');
    h.className = 'wn-version';
    h.textContent = 'Version ' + rel.v + ' · ' + rel.date;
    list.appendChild(h);
    rel.items.forEach(it => {
      const d = document.createElement('div');
      d.className = 'wn-item';
      d.textContent = it;
      list.appendChild(d);
    });
  });
  document.getElementById('whatsnew-modal').classList.add('visible');
}
function closeWhatsNew() {
  document.getElementById('whatsnew-modal').classList.remove('visible');
  localStorage.setItem('hp-seen-version', APP_VERSION);
}
function maybeShowWhatsNew() {
  const seen = localStorage.getItem('hp-seen-version');
  if (seen === APP_VERSION) return;
  if (seen === null && !localStorage.getItem('hp-supabase-url')) return; // Erstinstallation: nicht nerven
  setTimeout(openWhatsNew, 800);
}

// ── CONFETTI ──
function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#d4a853','#6ee7b7','#89c4f4','#ff6eb4','#c4a8f5','#ffffff'];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute;
      left:${Math.random()*100}vw;
      top:-20px;
      width:${Math.random()*10+6}px;
      height:${Math.random()*10+6}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>0.5?'50%':'2px'};
      animation:confettiFall ${Math.random()*2+2}s ease-in ${Math.random()*2}s forwards;
    `;
    container.appendChild(el);
  }
  setTimeout(() => container.innerHTML = '', 5000);
}

function showGoalBanner() {
  const banner = document.getElementById('goal-banner');
  const winner = document.getElementById('goal-winner');
  if (!banner) return;
  if (scores.lena > scores.pascal) {
    winner.textContent = '🏆 Lena darf das Wochenendprogramm bestimmen! (' + scores.lena + '🎋 vs ' + scores.pascal + '🎋)';
  } else if (scores.pascal > scores.lena) {
    winner.textContent = '🏆 Pascal darf das Wochenendprogramm bestimmen! (' + scores.pascal + '🎋 vs ' + scores.lena + '🎋)';
  } else {
    winner.textContent = '🤝 Unentschieden – gemeinsam entscheiden!';
  }
  banner.classList.add('visible');
  spawnConfetti();
}

function closeGoalBanner() {
  const banner = document.getElementById('goal-banner');
  if (banner) banner.classList.remove('visible');
}

// ── SCOREBOARD / PANDA ──
const STAGE_SIZES = { 's-baby': 104, 's-teen': 122, 's-adult': 138, 's-happy': 152 };
function updatePanda(total) {
  STAGES.forEach(s => document.getElementById(s.id).setAttribute('display', 'none'));
  const stage = STAGES.find(s => total >= s.min && total <= s.max) || STAGES[STAGES.length - 1];
  document.getElementById(stage.id).setAttribute('display', 'block');
  document.getElementById('panda-label').textContent = stage.label;
  // Panda wächst sichtbar mit jeder Stufe
  const svg = document.querySelector('#panda-svg-wrap svg');
  if (svg) { const px = STAGE_SIZES[stage.id] + 'px'; svg.style.width = px; svg.style.height = px; }
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

  if (total >= GOAL && !goalShown) {
    goalShown = true;
    showGoalBanner();
  }
  updateDuel();
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
  goalShown = false;
  document.querySelectorAll('.task.done').forEach(t => t.classList.remove('done'));
  updateScoreboard();
  const av = document.querySelector('.view.active');
  if (av) updateProgress(av.id);

  setSyncStatus(false);
  const [r1, r2] = await Promise.all([
    db.from('household_tasks').delete().neq('task_id', ''),
    db.from('household_scores').update({ lena_points: 0, pascal_points: 0 }).eq('id', 1),
  ]);
  if (r1.error || r2.error) {
    console.error('resetScores', r1.error || r2.error);
    setSyncStatus(false, 'Fehler beim Zurücksetzen');
    await loadScores(); await loadTasks(); restoreChecks(); updateScoreboard();
    return;
  }
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

// ── REALTIME SYNC ──
function subscribeRealtime() {
  let ch = db.channel('household-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_tasks' }, payload => {
      handleTaskChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_scores' }, payload => {
      if (payload.new) {
        scores.lena = Number(payload.new.lena_points) || 0;
        scores.pascal = Number(payload.new.pascal_points) || 0;
        // Nach einem Monats-Reset (auf dem anderen Gerät) darf das
        // Ziel-Banner beim nächsten Erreichen wieder erscheinen.
        if (scores.lena + scores.pascal < GOAL) goalShown = false;
        updateScoreboard();
      }
    });

  if (statsAvailable) {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'household_stats' }, payload => {
      if (payload.new) {
        stats = { streak: payload.new.streak || 0, best_streak: payload.new.best_streak || 0, last_full_day: payload.new.last_full_day };
        renderStreak();
      }
    });
  }
  if (badgesAvailable) {
    ch = ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'household_badges' }, payload => {
      const r = payload.new;
      if (r && !earnedBadges[r.badge_id]) {
        earnedBadges[r.badge_id] = r;
        renderBadgeShelf(r.badge_id);
        const b = BADGES.find(x => x.id === r.badge_id);
        if (b) showToast('🏅 Abzeichen freigeschaltet: ' + b.icon + ' ' + b.name);
      }
    });
  }

  ch.subscribe(status => {
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
  checkStreak();
}

function setSyncStatus(online, msg) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (!dot || !text) return;
  if (online) { dot.classList.remove('offline'); text.textContent = 'verbunden'; }
  else { dot.classList.add('offline'); text.textContent = msg || 'speichert…'; }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) cancelModal();
  });
  const banner = document.getElementById('goal-banner');
  if (banner) banner.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeGoalBanner();
  });
  const bm = document.getElementById('badges-modal');
  if (bm) bm.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBadges();
  });
  const wn = document.getElementById('whatsnew-modal');
  if (wn) wn.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeWhatsNew();
  });
  const vl = document.getElementById('version-label');
  if (vl) vl.textContent = 'v' + APP_VERSION;
  maybeShowWhatsNew();
  init();
});
