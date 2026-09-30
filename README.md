# Haushaltsplan mit Mochi

Gemeinsamer Haushaltsplan für Lena & Pascal als kleines Spiel: Tagesquests abhaken, Mochi füttern und wachsen lassen, Monatsziel mit Belohnung.

- Läuft auf GitHub Pages: https://lilalena21.github.io/haushaltsplan/
- Login mit demselben Konto wie Gewichtstracker und Food Tracker (Supabase-Projekt „Weight“)
- Daten: `households`, `household_members`, `hh_tasks` (Aufgaben mit Tag/Woche), `hh_checks` (ein Stempel pro Aufgabe und Zeitraum), `hh_goals` (Monatsziel). Aufbau siehe `schema.sql`.
- Aufgaben und ihre Tage stehen in der Tabelle `hh_tasks`: `day` 1–7 (Mo–So) für wöchentliche, `week` 1–4 für monatliche Aufgaben.
- Mochis Level wächst dauerhaft mit allem gesammelten Bambus; Duell und Monatsziel starten jeden Monat neu.
- Als App installierbar (Menü → „Als App installieren“).
