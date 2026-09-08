# Meeting Timer for OnlyT

Elgato Stream Deck plugin to control [OnlyT](https://github.com/AntonyCorbett/OnlyT) meeting timers from a physical button.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Stream Deck SDK v2](https://img.shields.io/badge/Stream%20Deck-SDK%20v2-1f6feb.svg)
![Marketplace status](https://img.shields.io/badge/marketplace-pending-lightgrey.svg)

---

## Screenshots

_(Coming soon — see [`docs/`](./docs))_

---

## Features

- **Live countdown** on the Stream Deck key with colour-coded status:
  - Green while there is plenty of time left
  - Orange as the timer approaches its target
  - Red pulsing when overtime
- **One-button start/stop** — a single press starts the current talk, another press stops it. OnlyT auto-advances to the next talk.
- **Auto-sync** with OnlyT — if the operator manually selects a different talk in OnlyT, the Stream Deck updates automatically.
- **Configurable connection** — set the OnlyT host, port, and optional API code from the Stream Deck property inspector.
- **Wraps long talk titles** onto two lines so they stay readable on a 72×72 key.

---

## Requirements

- **Elgato Stream Deck app** 6.5 or newer.
- **OnlyT** 2.5 or newer with the Web Clock / API enabled.
- Network reachability between the machine running Stream Deck and the machine running OnlyT (they can be the same machine — the default is `localhost:8096`).

To enable the OnlyT API:

1. Open **OnlyT**.
2. Go to **Settings** → **Remote access**.
3. Enable the web clock and note the port number (default `8096`).
4. If you set an **API code**, remember it — you'll need it in the plugin's property inspector.

---

## Installation

### From the Elgato Marketplace

_Marketplace link pending review._

### Manual install (advanced)

1. Download the latest `com.farino.streamdeck-onlyt.streamDeckPlugin` from the [Releases](https://github.com/farino/StreamDeck-OnlyT/releases) page.
2. Double-click the file — the Stream Deck app will install and enable it.

---

## Configuration

1. Open the Stream Deck app.
2. Drag the **Timer Control** action from the **Meeting Timer for OnlyT** category onto a key.
3. In the property inspector, set:
   - **Host** — `localhost` (or the IP address of the machine running OnlyT).
   - **Port** — the port shown in OnlyT's remote access settings (default `8096`).
   - **API Code** — leave blank unless OnlyT has one configured.
4. The connection indicator will turn green when the plugin can reach OnlyT.

---

## Usage

- **Press the key** to start the current OnlyT timer.
- **Press again** to stop the timer. OnlyT will queue the next talk automatically.
- If you change the selected talk directly in OnlyT, the Stream Deck key will follow.
- The countdown colour changes automatically as time runs down.

---

## Developer setup

Prerequisites: **Node.js 20+**, **Elgato Stream Deck CLI** (`npm i -g @elgato/cli`), and the Stream Deck app.

```powershell
git clone https://github.com/farino/StreamDeck-OnlyT.git
cd StreamDeck-OnlyT
npm install
npm run icons          # regenerate PNG icons from the SVG sources
streamdeck link com.farino.streamdeck-onlyt.sdPlugin
npm run watch          # builds on change and restarts the plugin
```

Useful scripts:

- `npm run build` — one-off Rollup build into `com.farino.streamdeck-onlyt.sdPlugin/bin/plugin.js`.
- `npm run watch` — rebuild on save and hot-restart the plugin.
- `npm run validate` — run `streamdeck validate` against the plugin folder.
- `npm run pack` — produce a distributable `.streamDeckPlugin` bundle for release/Marketplace.

Plugin logs live in `com.farino.streamdeck-onlyt.sdPlugin/logs/`.

---

## Project layout

```
com.farino.streamdeck-onlyt.sdPlugin/
  manifest.json                Plugin metadata
  bin/plugin.js                Bundled runtime (built from src/)
  imgs/                        Action + plugin icons
  ui/timer-settings.html       Property inspector
src/
  plugin.ts                    Entry point — registers actions
  actions/timer-control.ts     Start/stop action logic
  services/onlyt-client.ts     REST client for the OnlyT API
  utils/svg-renderer.ts        Dynamic SVG rendered onto the key
  types.ts                     Shared TypeScript types
```

---

## Credits

Built on top of the excellent [OnlyT](https://github.com/AntonyCorbett/OnlyT) application and its REST API by **Antony Corbett** (MIT licensed).

This plugin is an independent, third-party project. It is **not affiliated with, endorsed by, or supported by** the OnlyT project or its authors.

---

## License

MIT © 2026 Farino. See [LICENSE](./LICENSE).
