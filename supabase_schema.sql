-- ════════════════════════════════════════
-- Haushaltsplan – Supabase Schema
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen
-- ════════════════════════════════════════

-- Tabelle für den Status jeder einzelnen Aufgabe (abgehakt / wer / wann)
create table if not exists household_tasks (
  task_id text primary key,
  done boolean default false,
  done_by text,              -- 'lena' | 'pascal' | 'together'
  points numeric default 0,
  checked_at timestamptz
);

-- Tabelle für den Punktestand (nur eine Zeile, id = 1)
create table if not exists household_scores (
  id int primary key default 1,
  lena_points numeric default 0,
  pascal_points numeric default 0,
  month_key text default to_char(now(), 'YYYY-MM')
);

-- Tabelle für die letzten Reset-Zeitpunkte (täglich/wöchentlich/monatlich)
create table if not exists household_resets (
  id int primary key default 1,
  last_daily date,
  last_weekly date,
  last_monthly date
);

-- Startzeilen anlegen, falls noch nicht vorhanden
insert into household_scores (id, lena_points, pascal_points, month_key)
  values (1, 0, 0, to_char(now(), 'YYYY-MM'))
  on conflict (id) do nothing;

insert into household_resets (id, last_daily, last_weekly, last_monthly)
  values (1, null, null, null)
  on conflict (id) do nothing;

-- ── ROW LEVEL SECURITY ──
-- Da nur ihr beide die App nutzt und es kein Login gibt, erlauben wir
-- öffentlichen Lese-/Schreibzugriff über den anon key (wie bei deinen
-- anderen Trackern). Falls du später einen Login willst, kann RLS
-- enger gefasst werden.

alter table household_tasks enable row level security;
alter table household_scores enable row level security;
alter table household_resets enable row level security;

create policy "Allow all access" on household_tasks for all using (true) with check (true);
create policy "Allow all access" on household_scores for all using (true) with check (true);
create policy "Allow all access" on household_resets for all using (true) with check (true);

-- ── REALTIME (optional, aber empfohlen) ──
-- Damit Änderungen von Pascal sofort bei Lena auftauchen und umgekehrt,
-- ohne dass man die Seite neu laden muss.
alter publication supabase_realtime add table household_tasks;
alter publication supabase_realtime add table household_scores;
