# Tests

Tests live under `tests/` and mirror the **components** folder structure.

## Layout

- **`tests/test-helpers.ts`** – Shared mocks and utilities (e.g. `createMockTrack`, `stubCanvasForWaveform`). Used by component tests.
- **`tests/components/eno-tape-loop/`** – Tests for the Eno Tape Loop component:
  - `engine.test.ts` – AudioEngine (addTrack, setTrackVolume, updateLoop).
  - `waveform.test.ts` – Waveform DOM/document listener behaviour.
  - `slider.test.ts` – Regression: slider still works after document mouseup.
- **`tests/components/effects-rack/`** – Tests for the Effects Rack component:
  - `index.test.ts` – Mount/unmount, DOM structure, add Lexicon 224 from menu.
  - `lexicon224-reverb.test.ts` – Reverb factory returns nodes, setParams and dispose do not throw.

## Adding tests for a new component

1. Create `tests/components/<component-name>/` (e.g. `tests/components/reverb-lab/`).
2. Add `*.test.ts` files there and import from `../../../src/components/<component-name>/...`.
3. Use helpers from `../../test-helpers` or add component-specific helpers in the same folder.

Run all tests: `npm run test:run`. Watch mode: `npm run test`.
