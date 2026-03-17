# Eno Control

A browser app for creating loop-based soundscapes from your own audio files. Select multiple files, set loop start and end points for each, and play them together. Loops start with slight random offsets so they drift in and out of phase over time—inspired by Brian Eno’s tape loop pieces (e.g. *Music for Airports*, *Discreet Music*).

## Project structure

- **`src/main.ts`** – Site entry: layout, routing (pathname → page), and re-exports `mount` for embedding.
- **`src/site/`** – Site shell and pages.
  - `layout.ts` – Nav and main content area; `pathnameToPageId`, `createLayout`.
  - `site.css` – Site-wide styles (nav, layout).
  - `pages/` – Home, About, Contact, and demo pages (e.g. `pages/demos/eno-tape-loop.ts`).
- **`src/components/`** – Reusable UI components (see [src/components/README.md](src/components/README.md)).
  - **`eno-tape-loop/`** – Eno-style tape loop machine: `index.ts` (mount API), `engine.ts`, `waveform.ts`, `rack-knob.ts`, `styles.css`.
- **`tests/`** – Tests; structure mirrors `src/components/` (see [tests/README.md](tests/README.md)).
- **HTML** – Multi-page: `index.html` (home), `about/index.html`, `contact/index.html`, `demos/eno-tape-loop/index.html`. Build outputs the same structure under `dist/`.

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173). From the home page you can open **About**, **Contact**, and **Eno Control** (demo) from the nav.

## Build

```bash
npm run build
```

Output is in `dist/` (index, about/, contact/, demos/eno-tape-loop/). Serve that folder with any static host.

## Embed as a component

You can drop Eno Control into any page as a self-contained component. Build the project, then copy the generated JS and CSS from `dist/assets/` to your site.

1. Include the stylesheet and a container element:

```html
<link rel="stylesheet" href="/path/to/eno-tape-loop.css" />
<div id="eno-tape-loop-root"></div>
```

2. Load the script as a module and mount:

```html
<script type="module">
  import { mount } from '/path/to/eno-tape-loop.js';
  const unmount = mount(document.getElementById('eno-tape-loop-root'));
  // Call unmount() when you want to remove the app and free resources.
</script>
```

All styles are scoped under `.eno-tape-loop`, so they won’t affect the rest of your page. If your page already has an element with `id="app"`, the script will auto-mount there when loaded (for standalone use); use a different container id and call `mount(container)` yourself to avoid that.

## Test

```bash
npm run test:run
```

Runs unit tests (Vitest + jsdom). Use `npm run test` for watch mode.

## How it works

- **Add audio files** via the file picker (any format the browser supports: MP3, WAV, OGG, etc.).
- For each track you can set **loop start** and **loop end** in seconds. Only that segment will loop.
- **Play** starts all loops with a small random delay (0–2 s) so they don’t stay in sync, creating a changing soundscape.
- **Stop** stops all loops.

All processing runs in the browser using the Web Audio API; no audio is uploaded to a server.
