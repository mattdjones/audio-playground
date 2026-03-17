import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveformElement } from "../../../src/components/eno-tape-loop/waveform";
import {
  countCallsWithFirstArg,
  createMockTrack,
  stubCanvasForWaveform,
} from "../../test-helpers";

describe("waveform document listeners", () => {
  let restoreCanvas: () => void;
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;
  let waveformCleanup: (() => void) | null = null;

  beforeEach(() => {
    restoreCanvas = stubCanvasForWaveform();
    addSpy = vi.spyOn(document, "addEventListener");
    removeSpy = vi.spyOn(document, "removeEventListener");
  });

  afterEach(() => {
    waveformCleanup?.();
    waveformCleanup = null;
    addSpy.mockRestore();
    removeSpy.mockRestore();
    restoreCanvas();
    document.body.innerHTML = "";
  });

  it("does not add document mousemove or mouseup on creation", () => {
    const track = createMockTrack();
    const { cleanup } = createWaveformElement(track, () => {});
    waveformCleanup = cleanup;

    expect(countCallsWithFirstArg(addSpy, "mousemove")).toBe(0);
    expect(countCallsWithFirstArg(addSpy, "mouseup")).toBe(0);
  });

  it("adds document mousemove and mouseup only after mousedown on start handle", () => {
    const track = createMockTrack({ loopStart: 0, loopEnd: 5 });
    const { element, cleanup } = createWaveformElement(track, () => {});
    waveformCleanup = cleanup;
    document.body.appendChild(element);

    const canvas = element.querySelector("canvas");
    expect(canvas).not.toBeNull();
    if (!canvas) return;

    addSpy.mockClear();
    canvas.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 0, clientY: 24, bubbles: true })
    );

    expect(countCallsWithFirstArg(addSpy, "mousemove")).toBe(1);
    expect(countCallsWithFirstArg(addSpy, "mouseup")).toBe(1);
  });

  it("removes document listeners on mouseup after drag", () => {
    const track = createMockTrack({ loopStart: 0, loopEnd: 5 });
    const { element, cleanup } = createWaveformElement(track, () => {});
    waveformCleanup = cleanup;
    document.body.appendChild(element);

    const canvas = element.querySelector("canvas");
    if (!canvas) return;

    canvas.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 0, clientY: 24, bubbles: true })
    );
    removeSpy.mockClear();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(countCallsWithFirstArg(removeSpy, "mousemove")).toBe(1);
    expect(countCallsWithFirstArg(removeSpy, "mouseup")).toBe(1);
  });

  it("cleanup removes document listeners when they were added by drag", () => {
    const track = createMockTrack({ loopStart: 0, loopEnd: 5 });
    const { element, cleanup } = createWaveformElement(track, () => {});
    waveformCleanup = cleanup;
    document.body.appendChild(element);

    const canvas = element.querySelector("canvas");
    if (!canvas) return;

    canvas.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 0, clientY: 24, bubbles: true })
    );
    removeSpy.mockClear();
    cleanup();

    expect(countCallsWithFirstArg(removeSpy, "mousemove")).toBe(1);
    expect(countCallsWithFirstArg(removeSpy, "mouseup")).toBe(1);
  });
});
