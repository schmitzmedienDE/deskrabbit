# DeskRabbit

Aufgebohrter Desk-Companion für den Rabbit R1 — inspiriert von Jonathan’s [R1 Desktop Chat](https://justjonathan.me/how-i-turned-my-rabbit-r1-into-a-casual-desk-companion), aber mit Tamagotchi-Leben, Mehrsprachigkeit, Sensorik und erweiterbarer Mimik.

## Gegenüber dem Original

| Original | DeskRabbit |
| --- | --- |
| Animierte Augen | 8 Presets + Custom (Farbe, Größe, Abstand, Form) + Mimik-Sync zur Sprache |
| Tap / Hold / Idle-Chat | Gleich + Themen erweitert (Wetter, Creature-Check, Presence) |
| Topics + Interests + ZIP | + System-Sprache (DE/EN/FR/ES), Persönlichkeiten, Quiet Hours |
| Persistente Settings | `creationStorage` + Bond-Level |
| — | Tamagotchi-Stats (Affection, Energy, Curiosity, Hunger) |
| — | Kamera-Presence (Motion/Luminanz), World-Watch |
| — | Accelerometer: Schütteln = durchrütteln + Thema/Thread, Neigen = Blick |
| — | Skill-Atoms + eingebaute Habits + **Invent habit** (LLM baut neue Ketten) |

## Steuerung (R1)

- **Seite halten** — sprechen (wie gewohnt)
- **Seite tippen** — Tap-to-Chat (Thema starten)
- **Schütteln** — durchgerüttelt + Zufallsthema; wenn auf Antwort wartend → Thread fortsetzen
- **Scroll** — Einstellungen / Listen
- **Doppeltippen** — streicheln

Browser-Preview: Klick aufs Gesicht, Pfeiltasten, Enter, Escape, **S** = schütteln.

## Struktur

```
creations/DeskRabbit/
  index.html
  css/styles.css
  css/faces.css
  js/… (i18n, storage, sdk, face, companion, presence, chat, skills, settings, app)
  faces/presets.js
  creation.json
```

## Deploy (Gerät)

Öffentliches Hosting: **https://schmitzmediende.github.io/deskrabbit/** (GitHub Pages, HTTPS — wie R1 Cam). Repo: https://github.com/schmitzmedienDE/deskrabbit

`creation.json` muss genau diese URL tragen. Auf dem R1: Creations → Add via QR (`install.html` oder `qr.png`).

Kamera startet nach **erster Geste** (Side-Click / PTT / Tap), nicht beim Laden.

## Preview lokal

Hub: http://127.0.0.1:8790/install.html  

```bash
cd creations/DeskRabbit
python3 -m http.server 8790 --bind 0.0.0.0
open http://127.0.0.1:8790/install.html
```

Fürs Gerät **nicht** die LAN-HTTP-URL in `creation.json` lassen — `getUserMedia` braucht HTTPS.

