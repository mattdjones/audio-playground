/**
 * Eno Tape Loop – loop soundscape component (Eno-style tape loop machine).
 * Export mount(container) for embedding; styles are imported here.
 */

import { AudioEngine, MAX_START_DELAY } from "./engine";
import type { LoopTrack } from "./engine";
import {
  createRecorder,
  decodeBlobToAudioBuffer,
  encodeAudioBufferToWav,
  encodeAudioBufferToMp3,
  downloadBlob,
} from "../../lib/master-record";
import { createRackKnob } from "./rack-knob";
import { createWaveformElement } from "./waveform";
import "./styles.css";

const engine = new AudioEngine();

/** Container element the app is mounted into. Set by mount(). */
let rootContainer: HTMLElement | null = null;

/** Cleanups for track rows (e.g. waveform document listeners). Run before re-render. */
let trackCleanups: (() => void)[] = [];

/** Playhead updaters by track id. Used to show current position in loop while playing. */
const playheadUpdaters = new Map<string, (positionInSeconds: number) => void>();

/** Master recording state. */
let isRecording = false;
let recordedBlob: Blob | null = null;
let recordingStartTime = 0;
let activeRecorder: ReturnType<typeof createRecorder> | null = null;
let recordingTimerIntervalId: number | null = null;

function runPlayheadUpdates(): void {
  if (!engine.isPlaying) return;
  engine.trackList.forEach((track) => {
    const pos = engine.getPlaybackPosition(track.id);
    const updater = playheadUpdaters.get(track.id);
    if (updater) updater(pos ?? -1);
  });
  requestAnimationFrame(runPlayheadUpdates);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TrackRowResult {
  row: HTMLElement;
  cleanup: () => void;
}

function createTrackRow(
  track: LoopTrack,
  onUpdate: () => void,
  onRemove: () => void
): TrackRowResult {
  const row = document.createElement("div");
  row.className = "track-row";
  row.dataset.trackId = track.id;

  const nameEl = document.createElement("div");
  nameEl.className = "rack-track-name";
  nameEl.textContent = track.name;
  const durationEl = document.createElement("span");
  durationEl.className = "rack-duration";
  durationEl.textContent = formatTime(track.duration);

  const inKnob = createRackKnob({
    label: "IN",
    min: 0,
    max: track.duration,
    step: 0.1,
    value: track.loopStart,
    title: "Loop in (s)",
    onChange: (v) => {
      engine.updateLoop(track.id, v, track.loopEnd);
      onUpdate();
    },
  });

  const outKnob = createRackKnob({
    label: "OUT",
    min: 0,
    max: track.duration,
    step: 0.1,
    value: track.loopEnd,
    title: "Loop out (s)",
    onChange: (v) => {
      engine.updateLoop(track.id, track.loopStart, v);
      onUpdate();
    },
  });

  const volumeSlider = document.createElement("input");
  volumeSlider.type = "range";
  volumeSlider.min = "0";
  volumeSlider.max = "100";
  volumeSlider.value = String(Math.round(track.volume * 100));
  volumeSlider.className = "rack-fader";
  volumeSlider.title = "Level";
  volumeSlider.setAttribute("aria-label", "Level");
  volumeSlider.addEventListener("input", () => {
    engine.setTrackVolume(track.id, Number(volumeSlider.value) / 100);
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "rack-btn-remove";
  removeBtn.textContent = "OUT";
  removeBtn.title = "Remove track";
  removeBtn.addEventListener("click", onRemove);

  const dlyKnob = createRackKnob({
    label: "DLY",
    min: 0,
    max: MAX_START_DELAY,
    step: 0.1,
    value: track.startDelay,
    title: "Start delay (s)",
    onChange: (v) => engine.setTrackStartDelay(track.id, v),
  });

  const { element: waveformContainer, cleanup: waveformCleanup, setPlayheadPosition } =
    createWaveformElement(track, (start, end) => {
      engine.updateLoop(track.id, start, end);
      inKnob.setValue(track.loopStart);
      outKnob.setValue(track.loopEnd);
    });
  playheadUpdaters.set(track.id, setPlayheadPosition);

  const rackStrip = document.createElement("div");
  rackStrip.className = "rack-strip";

  const nameBlock = document.createElement("div");
  nameBlock.className = "rack-name-block";
  const nameLabel = document.createElement("span");
  nameLabel.className = "rack-label";
  nameLabel.textContent = "TRACK";
  nameBlock.append(nameLabel, nameEl, durationEl);

  const volBlock = document.createElement("div");
  volBlock.className = "rack-control-block";
  const volLabel = document.createElement("span");
  volLabel.className = "rack-label";
  volLabel.textContent = "LVL";
  const volWrap = document.createElement("div");
  volWrap.className = "rack-fader-wrap";
  volWrap.appendChild(volumeSlider);
  volBlock.append(volLabel, volWrap);

  rackStrip.append(nameBlock, volBlock, inKnob.element, outKnob.element, dlyKnob.element, removeBtn);

  row.append(rackStrip, waveformContainer);
  return { row, cleanup: waveformCleanup };
}

function render(): void {
  if (!rootContainer) return;

  trackCleanups.forEach((c) => c());
  trackCleanups = [];
  playheadUpdaters.clear();

  const isPlaying = engine.isPlaying;
  const tracks = engine.trackList;

  rootContainer.innerHTML = "";
  rootContainer.classList.add("eno-tape-loop");

  const app = document.createElement("div");
  app.className = "eno-tape-loop__inner";

  const header = document.createElement("header");
  header.className = "header";
  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = "Eno Tape Loop";
  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = "Loop soundscape — select files, set loop regions, play";
  header.append(title, subtitle);
  app.append(header);
  rootContainer.appendChild(app);

  const fileSection = document.createElement("section");
  fileSection.className = "section";
  const fileLabel = document.createElement("label");
  fileLabel.className = "file-label";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*";
  fileInput.multiple = true;
  fileInput.className = "file-input";
  fileLabel.appendChild(fileInput);
  const fileLabelText = document.createElement("span");
  fileLabelText.className = "file-label-text";
  fileLabelText.textContent = "Add audio files…";
  fileLabel.appendChild(fileLabelText);
  fileSection.appendChild(fileLabel);
  app.appendChild(fileSection);

  fileInput.addEventListener("change", async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const buffer = await engine.decodeFile(file);
        engine.addTrack(file, buffer);
      } catch (err) {
        console.error("Failed to load", file.name, err);
      }
    }
    fileInput.value = "";
    render();
  });

  const playSection = document.createElement("section");
  playSection.className = "section play-section";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "btn-play";
  playBtn.textContent = isPlaying ? "Stop" : "Play";
  playBtn.disabled = tracks.length === 0;
  playBtn.addEventListener("click", async () => {
    await engine.ensureContext();
    if (engine.isPlaying) {
      engine.stopAll();
      playheadUpdaters.forEach((updater) => updater(-1));
    } else {
      engine.playAll();
      requestAnimationFrame(runPlayheadUpdates);
    }
    playBtn.textContent = engine.isPlaying ? "Stop" : "Play";
  });
  const recordBtn = document.createElement("button");
  recordBtn.type = "button";
  recordBtn.className = "btn-record";
  recordBtn.textContent = isRecording ? "Stop" : "Record";
  recordBtn.disabled = tracks.length === 0;
  recordBtn.title = isRecording ? "Stop recording" : "Record master output while playing";
  recordBtn.addEventListener("click", async () => {
    if (isRecording && activeRecorder) {
      try {
        const blob = await activeRecorder.stop();
        engine.stopRecording();
        activeRecorder = null;
        isRecording = false;
        if (recordingTimerIntervalId !== null) {
          clearInterval(recordingTimerIntervalId);
          recordingTimerIntervalId = null;
        }
        recordedBlob = blob;
        render();
      } catch (e) {
        console.error("Recording stop failed", e);
        render();
      }
    } else {
      try {
        await engine.ensureContext();
        recordedBlob = null;
        const stream = await engine.startRecording();
        activeRecorder = createRecorder(stream);
        activeRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        render();
      } catch (e) {
        console.error("Recording start failed", e);
        isRecording = false;
        engine.stopRecording();
        render();
      }
    }
  });
  const masterLabel = document.createElement("label");
  masterLabel.className = "master-volume-label";
  masterLabel.textContent = "Master";
  const masterSlider = document.createElement("input");
  masterSlider.type = "range";
  masterSlider.min = "0";
  masterSlider.max = "100";
  masterSlider.value = String(Math.round(engine.masterVolume * 100));
  masterSlider.className = "master-volume-slider";
  masterSlider.title = "Master volume";
  masterSlider.addEventListener("input", () => {
    engine.setMasterVolume(Number(masterSlider.value) / 100);
  });
  playSection.append(playBtn, recordBtn, masterLabel, masterSlider);
  if (isRecording) {
    const recIndicator = document.createElement("span");
    recIndicator.className = "recording-indicator recording-timer";
    recIndicator.textContent = `● ${formatTime((Date.now() - recordingStartTime) / 1000)}`;
    recIndicator.setAttribute("aria-live", "polite");
    playSection.appendChild(recIndicator);
    if (recordingTimerIntervalId !== null) clearInterval(recordingTimerIntervalId);
    const updateTimer = (): void => {
      const el = rootContainer?.querySelector(".recording-timer");
      if (el) el.textContent = `● ${formatTime((Date.now() - recordingStartTime) / 1000)}`;
    };
    recordingTimerIntervalId = window.setInterval(updateTimer, 1000);
  }
  if (recordedBlob) {
    const downloadWrap = document.createElement("div");
    downloadWrap.className = "download-wrap";
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "btn-download-trigger";
    downloadBtn.textContent = "Download ▼";
    downloadBtn.title = "Choose format";
    const downloadMenu = document.createElement("div");
    downloadMenu.className = "download-menu";
    downloadMenu.setAttribute("role", "menu");
    const options = [
      { label: "Recorded (WebM)", ext: "webm", format: "webm" as const },
      { label: "Convert to WAV", ext: "wav", format: "wav" as const },
      { label: "Convert to MP3", ext: "mp3", format: "mp3" as const },
    ];
    for (const opt of options) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "download-menu-item";
      item.textContent = opt.label;
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", async () => {
        const base = "eno-tape-loop-recording";
        if (opt.format === "webm") {
          downloadBlob(recordedBlob!, `${base}.${opt.ext}`);
          downloadMenu.classList.remove("download-menu--open");
          return;
        }
        item.disabled = true;
        item.textContent = "Converting…";
        try {
          const ctx = engine.context;
          if (!ctx) throw new Error("No audio context");
          const buffer = await decodeBlobToAudioBuffer(recordedBlob!, ctx);
          const blob = opt.format === "wav" ? encodeAudioBufferToWav(buffer) : encodeAudioBufferToMp3(buffer);
          downloadBlob(blob, `${base}.${opt.ext}`);
          downloadMenu.classList.remove("download-menu--open");
        } catch (e) {
          console.error("Conversion failed", e);
          item.textContent = "Error";
        } finally {
          item.disabled = false;
          item.textContent = opt.label;
        }
      });
      downloadMenu.appendChild(item);
    }
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = downloadMenu.classList.toggle("download-menu--open");
      if (open) {
        const closeMenu = (e2: MouseEvent): void => {
          if (!downloadWrap.contains(e2.target as Node)) {
            downloadMenu.classList.remove("download-menu--open");
            document.removeEventListener("click", closeMenu);
          }
        };
        setTimeout(() => document.addEventListener("click", closeMenu), 0);
      }
    });
    downloadWrap.append(downloadBtn, downloadMenu);
    playSection.appendChild(downloadWrap);
  }
  app.appendChild(playSection);

  const trackList = document.createElement("section");
  trackList.className = "section track-list";
  if (tracks.length > 0) {
    const listTitle = document.createElement("h2");
    listTitle.className = "track-list-title";
    listTitle.textContent = "Tracks — drag handles on waveform or set times; adjust volume per track";
    trackList.appendChild(listTitle);
    const list = document.createElement("div");
    list.className = "track-rows";
    for (const track of tracks) {
      const { row, cleanup } = createTrackRow(
        track,
        render,
        () => {
          engine.removeTrack(track.id);
          render();
        }
      );
      trackCleanups.push(cleanup);
      list.appendChild(row);
    }
    trackList.appendChild(list);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No tracks yet. Add audio files above.";
    trackList.appendChild(empty);
  }
  app.appendChild(trackList);

  const footer = document.createElement("footer");
  footer.className = "footer";
  footer.textContent = "Inspired by Brian Eno's tape loop pieces.";
  app.appendChild(footer);
}

/**
 * Mount the Eno Tape Loop app into a container element.
 * Use this to embed the app on any page. Returns an unmount function.
 */
export function mount(container: HTMLElement): () => void {
  if (rootContainer) {
    throw new Error("Eno Tape Loop is already mounted. Call unmount() first.");
  }
  rootContainer = container;
  render();

  return function unmount(): void {
    if (!rootContainer) return;
    if (recordingTimerIntervalId !== null) {
      clearInterval(recordingTimerIntervalId);
      recordingTimerIntervalId = null;
    }
    if (isRecording && activeRecorder) {
      activeRecorder.stop().catch(() => {});
      engine.stopRecording();
      activeRecorder = null;
      isRecording = false;
    }
    engine.stopAll();
    playheadUpdaters.forEach((updater) => updater(-1));
    playheadUpdaters.clear();
    trackCleanups.forEach((c) => c());
    trackCleanups = [];
    rootContainer.innerHTML = "";
    rootContainer.classList.remove("eno-tape-loop");
    rootContainer = null;
  };
}

export type { LoopTrack } from "./engine";
export { MAX_START_DELAY } from "./engine";
