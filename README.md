# Haushaltsplan mit Mochi

Gemeinsamer Haushaltsplan für Lena & Pascal als kleines Spiel: Tagesquests abhaken, Mochi füttern und wachsen lassen, Monatsziel mit Belohnung.

- Läuft auf GitHub Pages: https://lilalena21.github.io/haushaltsplan/
- Login mit demselben Konto wie Gewichtstracker und Food Tracker (Supabase-Projekt „Weight“)
- Daten: `households`, `household_members`, `hh_tasks` (Aufgaben mit Tag/Woche), `hh_checks` (ein Stempel pro Aufgabe und Zeitraum), `hh_goals` (Monatsziel). Aufbau siehe `schema.sql`.
- Aufgaben stehen in der Tabelle `hh_tasks`. `freq`: `daily` (täglich), `weekly` (irgendwann diese Woche), `monthly` (irgendwann diesen Monat), `asneeded` (nach Bedarf, beliebig oft) und `followup` (Folge-Quest: erscheint, nachdem die Aufgabe mit `follow_up` = ihrer ID gestempelt wurde).
- Mochis Level wächst dauerhaft mit allem gesammelten Bambus; Duell und Monatsziel starten jeden Monat neu.
- Als App installierbar (Menü → „Als App installieren“).
