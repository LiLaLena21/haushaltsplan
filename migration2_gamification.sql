-- ════════════════════════════════════════
-- Migration 2: Streaks & Abzeichen
-- Einmalig im Supabase Dashboard → SQL Editor einfügen und ausführen.
-- Legt NUR zwei neue Tabellen an – bestehende Tabellen und andere
-- Projekte in derselben Datenbank werden nicht angefasst.
-- ════════════════════════════════════════

-- Tage-Serie: wie viele Tage in Folge wurden alle täglichen Aufgaben geschafft
create table if not exists household_stats (
  id int primary key default 1,
  streak int default 0,
  best_streak int default 0,
  last_full_day date
);

insert into household_stats (id) values (1) on conflict (id) do nothing;

-- Freigeschaltete Abzeichen
create table if not exists household_badges (
  badge_id text primary key,
  earned_at timestamptz default now(),
  earned_by text
);

alter table household_stats enable row level security;
alter table household_badges enable row level security;

drop policy if exists "Allow all access" on household_stats;
drop policy if exists "Allow all access" on household_badges;
create policy "Allow all access" on household_stats for all using (true) with check (true);
create policy "Allow all access" on household_badges for all using (true) with check (true);

-- Realtime, damit Streak & Abzeichen sofort auf beiden Geräten erscheinen
alter publication supabase_realtime add table household_stats;
alter publication supabase_realtime add table household_badges;
