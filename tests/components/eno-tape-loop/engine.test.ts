import { afterEach, describe, expect, it } from "vitest";
import { AudioEngine } from "../../../src/components/eno-tape-loop/engine";
import { createMockAudioBuffer } from "../../test-helpers";

describe("AudioEngine", () => {
  let engine: AudioEngine;

  afterEach(() => {
    engine.stopAll();
  });

  describe("addTrack and setTrackVolume", () => {
    it("adds a track and setTrackVolume updates track volume", () => {
      engine = new AudioEngine();
      const buffer = createMockAudioBuffer(5);
      const file = new File([], "test.wav");
      const track = engine.addTrack(file, buffer);

      expect(engine.trackList).toHaveLength(1);
      expect(track.volume).toBe(1);

      engine.setTrackVolume(track.id, 0.5);
      const updated = engine.trackList[0];
      expect(updated?.volume).toBe(0.5);
    });
  });

  describe("updateLoop", () => {
    it("clamps loop start and end to valid range", () => {
      engine = new AudioEngine();
      const buffer = createMockAudioBuffer(10);
      const track = engine.addTrack(new File([], "a.wav"), buffer);

      engine.updateLoop(track.id, -1, 100);
      expect(track.loopStart).toBe(0);
      expect(track.loopEnd).toBe(10);

      engine.updateLoop(track.id, 3, 2);
      expect(track.loopStart).toBeLessThanOrEqual(track.loopEnd);
    });
  });
});
