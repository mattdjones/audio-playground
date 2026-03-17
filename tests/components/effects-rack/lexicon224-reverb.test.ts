/**
 * Lexicon 224 reverb: core behaviour – create returns connectable nodes, setParams and dispose do not throw.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLexicon224Reverb,
  type Lexicon224Params,
  LEXICON224_DEFAULT_PARAMS,
} from "../../../src/components/effects-rack/lexicon224-reverb";

function createMockAudioContext(): AudioContext {
  const createGain = vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createDelay = vi.fn(() => ({
    delayTime: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createConvolver = vi.fn(() => ({
    buffer: null,
    normalize: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createBuffer = vi.fn((numberOfChannels: number, length: number, sampleRate: number) => ({
    numberOfChannels,
    length,
    sampleRate,
    getChannelData: () => new Float32Array(length),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  }));
  return {
    createGain,
    createDelay,
    createConvolver,
    createBuffer,
    sampleRate: 44100,
    state: "running",
    destination: {},
    close: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn(),
  } as unknown as AudioContext;
}

describe("Lexicon 224 reverb", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = createMockAudioContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns input, output, setParams, and dispose", () => {
    const reverb = createLexicon224Reverb(ctx);
    expect(reverb).toHaveProperty("input");
    expect(reverb).toHaveProperty("output");
    expect(reverb).toHaveProperty("setParams");
    expect(reverb).toHaveProperty("dispose");
    expect(typeof reverb.setParams).toBe("function");
    expect(typeof reverb.dispose).toBe("function");
  });

  it("setParams accepts partial params without throwing", () => {
    const reverb = createLexicon224Reverb(ctx);
    expect(() => reverb.setParams({ mix: 0.5 })).not.toThrow();
    expect(() => reverb.setParams({ decay: 3 })).not.toThrow();
    expect(() => reverb.setParams({ preDelay: 0.05 })).not.toThrow();
  });

  it("dispose does not throw", () => {
    const reverb = createLexicon224Reverb(ctx);
    expect(() => reverb.dispose()).not.toThrow();
  });

  it("uses default params when none provided", () => {
    expect(LEXICON224_DEFAULT_PARAMS).toMatchObject({
      mix: expect.any(Number),
      decay: expect.any(Number),
      preDelay: expect.any(Number),
    });
  });
});
