# Haushaltsplan – Setup-Anleitung

## 1. Supabase-Tabellen anlegen

1. Geh in dein bestehendes Supabase-Projekt (https://supabase.com/dashboard)
2. Links im Menü auf **SQL Editor**
3. Öffne `supabase_schema.sql` aus diesem Ordner, kopiere den kompletten Inhalt
4. Füge ihn im SQL Editor ein und klick auf **Run**
5. Fertig – die drei Tabellen `household_tasks`, `household_scores` und `household_resets` sind angelegt

## 2. Zugangsdaten eintragen

1. In Supabase: **Project Settings → API**
2. Kopiere die **Project URL** und den **anon public** Key
3. Öffne `config.js` in diesem Ordner und trage beide Werte ein:

```js
const SUPABASE_URL = "https://deinprojekt.supabase.co";
const SUPABASE_ANON_KEY = "eyJ......dein-langer-key......";
```

## 3. Auf GitHub Pages veröffentlichen

```bash
# Im haushaltsplan-Ordner:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/haushaltsplan.git
git push -u origin main
```

Dann in den Repo-Einstellungen auf GitHub:
**Settings → Pages → Source: Deploy from branch → main → / (root)**

Nach ein bis zwei Minuten ist die Seite live unter:
`https://dein-username.github.io/haushaltsplan/`

## 4. Eigenen Code nachträglich einfügen

Die Struktur ist bewusst in drei Dateien getrennt, damit du leicht reinschreiben kannst:

- **index.html** – nur Struktur/Inhalt (die Aufgabenliste). Neue Aufgabe hinzufügen = neue `<div class="task">`-Zeile kopieren und anpassen (eindeutige `data-id` nicht vergessen!).
- **app.js** – die ganze Logik (Supabase-Anbindung, Punkte, Panda, Realtime). Hier kannst du z.B. eigene Funktionen ergänzen oder die Punkteberechnung ändern.
- **config.js** – nur deine Zugangsdaten.

Jede `.task`-Zeile braucht:
- `data-id` – eindeutiger Schlüssel (wird als Primary Key in Supabase verwendet)
- `data-pts` – wie viele Bambus-Punkte sie gibt
- `data-who` – `lena`, `pascal`, `wer` (Modal fragt wer es war) oder `together` (automatisch 50/50)

## 5. Live-Sync zwischen euch beiden

Realtime ist bereits aktiviert (siehe SQL-Schema). Das heißt: wenn Pascal auf seinem Handy etwas abhakt,
aktualisiert sich die Seite bei Lena automatisch, ohne dass sie neu laden muss – solange beide Geräte
online sind und die Seite offen haben.

## 6. Sicherheit

Aktuell ist die Datenbank mit `anon` Zugriff für jeden lesbar/schreibbar, der die URL kennt
(gleiches Prinzip wie bei deinen anderen Trackern). Das reicht für den privaten Gebrauch zu zweit.
Falls ihr später einen Login wollt, kann ich euch zeigen, wie man Supabase Auth ergänzt.
