/**
 * Shared test helpers: mock track, canvas stub, and cleanup.
 * Keeps tests self-contained and avoids duplication.
 */

import type { LoopTrack } from "../src/components/eno-tape-loop/engine";

const DEFAULT_DURATION = 10;

/** Creates a minimal AudioBuffer-like object for tests (no real audio). */
export function createMockAudioBuffer(durationSeconds = DEFAULT_DURATION): AudioBuffer {
  const sampleRate = 44100;
  const length = Math.floor(sampleRate * durationSeconds);
  const channel = new Float32Array(length);
  return {
    length,
    duration: durationSeconds,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => channel,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

/** Creates a mock LoopTrack for waveform tests. */
export function createMockTrack(overrides: Partial<LoopTrack> = {}): LoopTrack {
  const duration = overrides.duration ?? DEFAULT_DURATION;
  const buffer = overrides.buffer ?? createMockAudioBuffer(duration);
  return {
    id: overrides.id ?? "test-track-id",
    name: overrides.name ?? "Test track",
    buffer,
    loopStart: overrides.loopStart ?? 0,
    loopEnd: overrides.loopEnd ?? duration,
    duration,
    volume: overrides.volume ?? 1,
    startDelay: overrides.startDelay ?? 0,
  };
}

/** No-op canvas 2D context for waveform drawing in tests. */
export function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    canvas: { width: 320, height: 48 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
  } as unknown as CanvasRenderingContext2D;
}

/** Stub document.createElement so canvas elements get a working getContext and getBoundingClientRect. Returns restore fn. */
export function stubCanvasForWaveform(
  mockCtx: CanvasRenderingContext2D = createMockCanvasContext()
): () => void {
  const originalCreateElement = document.createElement.bind(document);
  const patchedCreateElement = (tagName: string): HTMLElement => {
    const el = originalCreateElement(tagName);
    if (tagName.toLowerCase() === "canvas") {
      (el as HTMLCanvasElement).getContext = (() => mockCtx) as unknown as HTMLCanvasElement["getContext"];
      el.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 48,
        right: 320,
        bottom: 48,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    }
    return el;
  };
  document.createElement = patchedCreateElement as typeof document.createElement;
  return () => {
    document.createElement = originalCreateElement as typeof document.createElement;
  };
}

/** Count how many times a spy was invoked with a given first argument. */
export function countCallsWithFirstArg(spy: { mock: { calls: unknown[][] } }, firstArg: string): number {
  return spy.mock.calls.filter((c) => c[0] === firstArg).length;
}
