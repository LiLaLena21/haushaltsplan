// Erinnerungen für den Haushaltsplan: morgens um 9 und abends um 21 Uhr (Berliner Zeit).
// Wird stündlich von pg_cron aufgerufen (mit x-cron-secret) und sendet nur zur passenden Stunde.
// Aus der App kann man sich mit ?test=1 selbst eine Probe-Benachrichtigung schicken.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ALLOWED = ['https://lilalena21.github.io'];
const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': ALLOWED.includes(req.headers.get('origin') || '') ? req.headers.get('origin')! : ALLOWED[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
});
const json = (req: Request, b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Datum in Berlin
function berlin(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(d).map(x => [x.type, x.value]));
  const y = +p.year, m = +p.month, day = +p.day, hour = +p.hour % 24;
  const t = new Date(Date.UTC(y, m - 1, day)); const wd = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = `${t.getUTCFullYear()}-W${String(Math.ceil(((+t - +y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  return { hour, day: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, month: `${y}-${String(m).padStart(2, '0')}`, week, weekday: wd };
}
const list = (a: string[], n = 2) => a.length <= n ? a.join(' und ') : a.slice(0, n).join(', ') + ` und ${a.length - n} weitere`;

async function messageFor(hid: string, slot: 'morgen' | 'abend') {
  const b = berlin();
  const [{ data: tasks }, { data: checks }] = await Promise.all([
    db.from('hh_tasks').select('*').eq('household_id', hid).eq('active', true).order('sort'),
    db.from('hh_checks').select('task_id, period, checked_at').eq('household_id', hid).gte('checked_at', new Date(Date.now() - 40 * 86400e3).toISOString()),
  ]);
  const T = tasks || [], C = checks || [];
  const has = (id: string, period: string) => C.some(c => c.task_id === id && c.period === period);
  const last = (id: string) => C.filter(c => c.task_id === id).reduce((a: string | null, c) => (!a || c.checked_at > a) ? c.checked_at : a, null);
  const follow = T.filter(t => t.freq === 'followup').filter(t => {
    const p = T.find(x => x.follow_up === t.id); const lp = p && last(p.id), lc = last(t.id);
    return !!lp && (!lc || lc < lp);
  }).map(t => t.title);
  if (slot === 'morgen') {
    const weekly = T.filter(t => t.freq === 'weekly' && !has(t.id, b.week)).map(t => t.title);
    const monthly = T.filter(t => t.freq === 'monthly' && !has(t.id, b.month)).map(t => t.title);
    const parts: string[] = [];
    if (weekly.length) parts.push(`Diese Woche noch offen: ${weekly.length === 1 ? weekly[0] : weekly.length + ' Aufgaben, z. B. ' + list(weekly)}.`);
    const lastDays = new Date(Date.UTC(+b.month.slice(0, 4), +b.month.slice(5, 7), 0)).getUTCDate() - +b.day.slice(8) < 7;
    if (monthly.length && lastDays) parts.push(`Der Monat ist bald rum, noch ${monthly.length} Monatsquests offen.`);
    if (follow.length) parts.push(`Außerdem wartet noch: ${list(follow)}.`);
    if (!parts.length) return null;
    return { title: 'Guten Morgen von Mochi', body: parts.join(' ') };
  } else {
    const daily = T.filter(t => t.freq === 'daily' && !has(t.id, b.day)).map(t => t.title);
    const all = [...daily, ...follow];
    if (!all.length) return null;
    return { title: 'Mochi erinnert euch', body: `Heute noch offen: ${list(all, 3)}.` };
  }
}

async function sendTo(subs: any[], msg: { title: string; body: string }) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg, url: 'https://lilalena21.github.io/haushaltsplan/' }), { TTL: 3600 });
      sent++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { console.log('abgelaufen, entfernt', e.statusCode, s.user_id); await db.from('hh_push_subs').delete().eq('endpoint', s.endpoint); }
      else console.error('push', e && e.statusCode, e && e.body);
    }
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const { data: sec } = await db.from('app_secrets').select('key, value');
  const S = Object.fromEntries((sec || []).map(r => [r.key, r.value]));
  webpush.setVapidDetails('mailto:haushaltsplan@lilalena21.github.io', S.vapid_public, S.vapid_private);
  const url = new URL(req.url);

  // Der Browser hat die Push-Adresse gewechselt: alten Eintrag auf die neue Adresse umschreiben.
  // Die alte Adresse ist nur dem Gerät und uns bekannt und dient hier als Nachweis.
  if (url.searchParams.get('resub')) {
    const b = await req.json().catch(() => null);
    const n = b && b.sub, old = b && b.old;
    if (!old || !n || !n.endpoint || !n.keys) return json(req, { error: 'ungültig' }, 400);
    const { data: row } = await db.from('hh_push_subs').select('*').eq('endpoint', old).maybeSingle();
    if (!row) return json(req, { moved: false });
    await db.from('hh_push_subs').upsert({ endpoint: n.endpoint, user_id: row.user_id, household_id: row.household_id, p256dh: n.keys.p256dh, auth: n.keys.auth });
    if (old !== n.endpoint) await db.from('hh_push_subs').delete().eq('endpoint', old);
    return json(req, { moved: true });
  }

  // Probe aus der App: nur an die eigenen Geräte
  if (url.searchParams.get('test')) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    const { data: u } = await db.auth.getUser(token);
    if (!u || !u.user) return json(req, { error: 'nicht eingeloggt' }, 401);
    const { data: subs } = await db.from('hh_push_subs').select('*').eq('user_id', u.user.id);
    const n = await sendTo(subs || [], { title: 'Mochi sagt Hallo', body: 'So sehen eure Erinnerungen aus. Bis morgen um 9!' });
    return json(req, { sent: n });
  }

  if (req.headers.get('x-cron-secret') !== S.cron_secret) return json(req, { error: 'nein' }, 403);
  const b = berlin();
  const forced = url.searchParams.get('slot');
  const slot = forced === 'morgen' || forced === 'abend' ? forced : b.hour === 9 ? 'morgen' : b.hour === 21 ? 'abend' : null;
  if (!slot) return json(req, { skipped: b.hour });
  const { data: subs } = await db.from('hh_push_subs').select('*');
  const byHh: Record<string, any[]> = {};
  (subs || []).forEach(s => { (byHh[s.household_id] = byHh[s.household_id] || []).push(s); });
  const out: Record<string, number> = {};
  for (const [hid, hhSubs] of Object.entries(byHh)) {
    const msg = await messageFor(hid, slot);
    out[hid] = msg ? await sendTo(hhSubs, msg) : 0;
  }
  return json(req, { slot, out });
});
