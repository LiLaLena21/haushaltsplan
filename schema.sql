-- Haushaltsplan in der zentralen Datenbank (Projekt "Weight")
-- Ein Haushalt mit Mitgliedern; Aufgaben, Häkchen und Monatsziele gehören zum Haushalt.
-- Nur Mitglieder sehen und ändern die Daten ihres Haushalts.

create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  letter       text not null,
  color        text not null,
  primary key (household_id, user_id)
);
create index on public.household_members (user_id);

-- Aufgaben: freq daily|weekly|monthly, day 1-7 (Mo-So) für wöchentliche, week 1-4 für monatliche
-- default_who: 'any', 'together' oder die user_id der Person, der die Aufgabe normalerweise gehört
create table public.hh_tasks (
  household_id uuid not null references public.households(id) on delete cascade,
  id          text not null,
  title       text not null,
  section     text not null,
  freq        text not null check (freq in ('daily','weekly','monthly')),
  points      numeric not null default 1,
  default_who text not null default 'any',
  need        text not null check (need in ('satt','froh','sauber')),
  day         int check (day between 1 and 7),
  week        int check (week between 1 and 4),
  sort        int not null default 0,
  active      boolean not null default true,
  primary key (household_id, id)
);

-- Erledigt: ein Eintrag pro Aufgabe und Zeitraum (Tag 2026-09-30, Woche 2026-W40, Monat 2026-09)
create table public.hh_checks (
  id           bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  task_id      text not null,
  period       text not null,
  done_by      uuid[] not null,
  points       numeric not null,
  checked_by   uuid not null default auth.uid() references auth.users(id),
  checked_at   timestamptz not null default now(),
  unique (household_id, task_id, period)
);
create index on public.hh_checks (household_id, checked_at);

create table public.hh_goals (
  household_id uuid not null references public.households(id) on delete cascade,
  month        text not null,
  target       int not null default 300,
  reward       text,
  primary key (household_id, month)
);

-- Mitgliedschaft prüfen, ohne dass die Regeln sich selbst abfragen
create function public.is_household_member(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.hh_tasks          enable row level security;
alter table public.hh_checks         enable row level security;
alter table public.hh_goals          enable row level security;

create policy "mitglieder lesen" on public.households for select to authenticated using (public.is_household_member(id));
create policy "mitglieder lesen" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "mitglieder" on public.hh_tasks  for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "mitglieder" on public.hh_checks for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "mitglieder" on public.hh_goals  for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

-- Live-Abgleich zwischen den Handys
alter publication supabase_realtime add table public.hh_checks;
alter publication supabase_realtime add table public.hh_goals;

-- Haushalt Lena & Pascal mit den Aufgaben aus dem alten Plan
do $$
declare
  hid uuid;
  lena uuid := (select id from auth.users where split_part(email,'@',1) = 'lenahoefling95');
  pascal uuid := (select id from auth.users where split_part(email,'@',1) = 'pascal_schwarz');
begin
  if lena is null or pascal is null then raise exception 'Lena oder Pascal nicht gefunden'; end if;
  insert into public.households (name) values ('Lena & Pascal') returning id into hid;
  insert into public.household_members values (hid, lena, 'Lena', 'L', '#89C4F4'), (hid, pascal, 'Pascal', 'P', '#FF6EB4');
  insert into public.hh_tasks (household_id, id, title, section, freq, points, default_who, need, day, week, sort)
  select hid, t.id, t.title, t.section, t.freq, t.points,
         case t.who when 'lena' then lena::text when 'pascal' then pascal::text when 'together' then 'together' else 'any' end,
         t.need, t.day, t.week, t.sort
  from (values
    ('t-k-m','Katzen morgens füttern','Katzen','daily',1,'wer','froh',null,null,1),
    ('t-k-mi','Katzen mittags füttern','Katzen','daily',1,'wer','froh',null,null,2),
    ('t-k-a','Katzen abends füttern','Katzen','daily',1,'wer','froh',null,null,3),
    ('t-k-klo','Katzenklo kontrollieren & ausmisten','Katzen','daily',1,'wer','sauber',null,null,4),
    ('t-w-w','Wäsche waschen','Wäsche','daily',1,'lena','sauber',null,null,5),
    ('t-w-f','Wäsche falten & einräumen','Wäsche','daily',1,'lena','sauber',null,null,6),
    ('t-kue-aw','Abwaschen / Spülmaschine befüllen','Küche','daily',1,'pascal','satt',null,null,7),
    ('t-kue-herd','Arbeitsfläche & Herd abwischen','Küche','daily',1,'pascal','satt',null,null,8),
    ('t-kue-sp','Spülmaschine ausräumen','Küche','daily',1,'pascal','satt',null,null,9),
    ('t-kue-bio','Biomüll runterbringen','Küche','daily',1,'wer','satt',null,null,10),
    ('t-allg-wz','Wohnzimmertisch aufräumen','Wohnung','daily',1,'wer','froh',null,null,11),
    ('w-bad-ht','Handtücher wechseln','Bad & WC','weekly',1,'lena','sauber',1,null,20),
    ('w-bad-müll','Mülleimer Bad & Gäste-WC leeren','Bad & WC','weekly',2,'wer','sauber',1,null,21),
    ('w-kue-pap','Papiermüll wegbringen','Küche','weekly',1,'wer','satt',1,null,22),
    ('w-t-bürs','Tarcin bürsten','Katzen','weekly',1,'wer','froh',2,null,23),
    ('w-k-brun','Trinkbrunnen auffüllen & reinigen','Katzen','weekly',1,'pascal','froh',2,null,24),
    ('w-büro-ls','Lenas Schreibtisch aufräumen','Büros','weekly',1,'lena','froh',2,null,25),
    ('w-büro-ps','Pascals Schreibtisch aufräumen','Büros','weekly',1,'pascal','froh',2,null,26),
    ('w-bad-sp','Spiegel & Waschbecken putzen','Bad & WC','weekly',2,'wer','sauber',3,null,27),
    ('w-bad-to','Toilette reinigen','Bad & WC','weekly',2,'lena','sauber',3,null,28),
    ('w-bad-gwc','Gäste-WC reinigen','Bad & WC','weekly',2,'lena','sauber',3,null,29),
    ('w-saug','Staubsaugen','Wohnung','weekly',2,'wer','froh',4,null,30),
    ('w-staub','Abstauben','Wohnung','weekly',1,'wer','froh',4,null,31),
    ('w-kue-kü','Kühlschrank checken (Altes raus)','Küche','weekly',1,'lena','satt',4,null,32),
    ('w-eink','Einkaufen','Einkaufen','weekly',2,'pascal','satt',5,null,33),
    ('w-s-bürs','Sniegs bürsten','Katzen','weekly',1,'wer','froh',5,null,34),
    ('w-kue-müll','Küchenmüll runterbringen','Küche','weekly',1,'wer','satt',5,null,35),
    ('w-wisch','Wischen (alle Räume)','Wohnung','weekly',3,'lena','sauber',6,null,36),
    ('w-bad-wisch','Bad wischen','Bad & WC','weekly',1,'lena','sauber',6,null,37),
    ('w-bad-gwcw','Gäste-WC wischen','Bad & WC','weekly',1,'lena','sauber',6,null,38),
    ('w-bal','Balkon kehren & Ordnung','Wohnung','weekly',1,'wer','froh',6,null,39),
    ('w-kue-air','Airfryer / Grill reinigen','Küche','weekly',1,'pascal','satt',7,null,40),
    ('w-müll-wohn','Mülleimer Wohnung leeren','Wohnung','weekly',1,'wer','froh',7,null,41),
    ('w-büro-lm','Lenas Mülleimer leeren','Büros','weekly',1,'lena','froh',7,null,42),
    ('w-büro-pm','Pascals Mülleimer leeren','Büros','weekly',1,'pascal','froh',7,null,43),
    ('w-s-ras','Sniegs rasieren','Katzen','weekly',2,'together','froh',7,null,44),
    ('m-s-bett','Bettwäsche wechseln','Schlafzimmer','monthly',3,'together','sauber',null,1,60),
    ('m-kue-kü','Kühlschrank komplett ausräumen & wischen','Küche','monthly',3,'lena','satt',null,1,61),
    ('m-k-kb','Kratzbäume enthaaren','Katzen','monthly',1,'wer','froh',null,1,62),
    ('m-bad-du','Dusche reinigen','Bad & WC','monthly',2,'lena','sauber',null,2,63),
    ('m-bad-abl','Abflüsse reinigen','Bad & WC','monthly',2,'pascal','sauber',null,2,64),
    ('m-w-fen','Fenster putzen (ein Raum)','Wohnung','monthly',2,'wer','froh',null,2,65),
    ('m-kue-sch','Küchenschränke wischen','Küche','monthly',2,'wer','satt',null,3,66),
    ('m-w-ober','Oberflächen abstauben','Wohnung','monthly',2,'wer','froh',null,3,67),
    ('m-bad-sch','Badschrank aufräumen','Bad & WC','monthly',2,'together','sauber',null,3,68),
    ('m-w-abs','Abstellkammer Ordnung','Wohnung','monthly',2,'together','froh',null,4,69),
    ('m-w-flur','Flur: Schuhe & Jacken aufräumen','Wohnung','monthly',1,'together','froh',null,4,70),
    ('m-bad-sta','Bad abstauben','Bad & WC','monthly',1,'wer','sauber',null,4,71)
  ) as t(id,title,section,freq,points,who,need,day,week,sort);
  insert into public.hh_goals (household_id, month, target, reward) values (hid, to_char(now() at time zone 'Europe/Berlin','YYYY-MM'), 300, null);
end $$;
