/**
 * Effects Rack: mount/unmount and add/remove effect (core behaviour not broken).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../src/components/effects-rack";

function createMockAudioContext() {
  const gainRef = { value: 1 };
  const node = () => ({
    gain: gainRef,
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 256,
    smoothingTimeConstant: 0.75,
    minDecibels: -60,
    maxDecibels: 0,
    getByteTimeDomainData: vi.fn(),
  });
  return {
    createGain: vi.fn(() => node()),
    createAnalyser: vi.fn(() => node()),
    createDelay: vi.fn(() => ({ delayTime: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })),
    createConvolver: vi.fn(() => ({
      buffer: null,
      normalize: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBuffer: vi.fn((_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length),
      length,
      sampleRate: sr,
      numberOfChannels: 1,
    })),
    createMediaStreamDestination: vi.fn(() => ({ stream: {}, connect: vi.fn(), disconnect: vi.fn() })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    decodeAudioData: vi.fn().mockResolvedValue({ length: 44100, duration: 1, getChannelData: () => new Float32Array(44100), numberOfChannels: 1, sampleRate: 44100 }),
    sampleRate: 44100,
    state: "running",
    destination: {},
    close: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
}

describe("Effects Rack", () => {
  let container: HTMLElement;
  let MockAudioContext: ReturnType<typeof createMockAudioContext>;
  let unmount: (() => void) | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    MockAudioContext = createMockAudioContext();
    vi.stubGlobal("AudioContext", vi.fn(() => MockAudioContext));
  });

  afterEach(() => {
    if (unmount) {
      unmount();
      unmount = null;
    }
    container.remove();
    vi.unstubAllGlobals();
  });

  it("mounts without throwing and renders root structure", () => {
    unmount = mount(container);
    expect(container.classList.contains("effects-rack")).toBe(true);
    expect(container.querySelector(".effects-rack__inner")).not.toBeNull();
    expect(container.textContent).toContain("Effects Rack");
    expect(container.textContent).toContain("Add effect");
  });

  it("unmount clears container and removes class", () => {
    unmount = mount(container);
    expect(container.classList.contains("effects-rack")).toBe(true);
    unmount!();
    unmount = null;
    expect(container.classList.contains("effects-rack")).toBe(false);
    expect(container.innerHTML).toBe("");
  });

  it("add effect menu is present and Lexicon 224 can be added", () => {
    unmount = mount(container);
    const addBtn = container.querySelector(".effects-rack__btn--add");
    expect(addBtn).not.toBeNull();
    (addBtn as HTMLButtonElement).click();
    const menuItem = container.querySelector(".effects-rack__add-menu-item");
    expect(menuItem).not.toBeNull();
    expect((menuItem as HTMLElement).textContent).toContain("Lexicon 224");
    (menuItem as HTMLButtonElement).click();
    expect(container.querySelector(".effects-rack__unit--lexicon224")).not.toBeNull();
    expect(container.textContent).toContain("Lexicon 224");
  });
});
