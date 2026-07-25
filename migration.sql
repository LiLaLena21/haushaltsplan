-- ════════════════════════════════════════
-- Migration: atomare Punkte-Updates
-- Einmalig im Supabase Dashboard → SQL Editor einfügen und ausführen.
-- (Für bestehende Installationen. Bei einer Neuinstallation reicht
--  supabase_schema.sql, dort ist die Funktion schon enthalten.)
-- ════════════════════════════════════════

-- Punkte als Delta addieren statt überschreiben.
-- Verhindert, dass Punkte verloren gehen, wenn zwei Geräte
-- gleichzeitig eine Aufgabe abhaken.
create or replace function apply_score_delta(lena_delta numeric, pascal_delta numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update household_scores
  set lena_points   = greatest(0, lena_points + lena_delta),
      pascal_points = greatest(0, pascal_points + pascal_delta)
  where id = 1;
$$;

grant execute on function apply_score_delta(numeric, numeric) to anon;
