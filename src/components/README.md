# Components

Each subfolder is a **self-contained component** that can be mounted on any page.

## Structure

- **`eno-tape-loop/`** – Eno-style tape loop machine. Select audio files, set loop regions, play multiple loops with optional per-track start delay.
  - `index.ts` – Public API: `mount(container)`, returns `unmount()`. Import styles here.
  - `engine.ts` – Web Audio logic (tracks, loop scheduling, volume).
  - `waveform.ts` – Waveform canvas and draggable loop handles.
  - `rack-knob.ts` – Rack-style knob UI.
  - `styles.css` – Scoped under `.eno-tape-loop`.
- **`effects-rack/`** – Studio-style effects rack. Upload audio or (later) record from mic; add effect units to the rack. Basic setup only for now; effects to be added later.
  - `index.ts` – Public API: `mount(container)`, returns `unmount()`. Import styles here.
  - `styles.css` – Scoped under `.effects-rack`.

## Adding a new component

1. Create a new folder under `src/components/`, e.g. `src/components/my-app/`.
2. Implement your UI and logic inside that folder.
3. Export a **`mount(container: HTMLElement): () => void`** from `index.ts` (and import any component-specific CSS there).
4. Add a demo page: create `demos/my-app/index.html`, add `src/site/pages/demos/my-app.ts`, register the route and nav in `src/site/layout.ts`, handle the page in `src/main.ts`, and add the HTML to `build.rollupOptions.input` in `vite.config.ts`.
5. Use the component elsewhere: `import { mount } from "./components/my-app"; mount(container);`

Keep each component’s styles scoped (e.g. a root class like `.eno-tape-loop`) so multiple components can coexist on the same site without conflicts.
