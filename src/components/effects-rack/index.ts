/**
 * Effects Rack – studio-style rack for effect units.
 * User can upload an audio file or record from mic, play through the chain,
 * adjust master volume, and record the output (with effects when added) for download.
 */

import {
  createRecorder,
  decodeBlobToAudioBuffer,
  encodeAudioBufferToWav,
  encodeAudioBufferToMp3,
  downloadBlob,
} from "../../lib/master-record";
import {
  createDaftPunkFilter,
  DAFTPUNK_FILTER_DEFAULT_PARAMS,
  type DaftPunkFilterParams,
} from "./daftpunk-filter";
import {
  createELCompressor,
  EL_COMPRESSOR_DEFAULT_PARAMS,
  EL_COMPRESSOR_RATIO_OPTIONS,
  type ELCompressorParams,
} from "./el-compressor";
import {
  createLexicon224Reverb,
  LEXICON224_DEFAULT_PARAMS,
  type Lexicon224Params,
} from "./lexicon224-reverb";
import "./styles.css";

let rootContainer: HTMLElement | null = null;
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let recordDestination: MediaStreamAudioDestinationNode | null = null;
let meterAnimationId: number | null = null;

/** Currently loaded source audio (from file upload or mic recording). */
let sourceBuffer: AudioBuffer | null = null;

/** Recording from mic: capture to buffer, then store as source like an uploaded file. */
let isRecordingFromMic = false;
let micRecordStream: MediaStream | null = null;
let micRecordSource: MediaStreamAudioSourceNode | null = null;
let micRecorder: ReturnType<typeof createRecorder> | null = null;
let micRecordingStartTime = 0;
let micRecordingTimerIntervalId: number | null = null;

/** File playback: active buffer source and playing state. */
let currentBufferSource: AudioBufferSourceNode | null = null;
let isPlaying = false;

/** Master volume 0–1. */
let masterVolume = 0.8;

/** Output recording state. */
let isRecording = false;
let recordedBlob: Blob | null = null;
let recordingStartTime = 0;
let activeRecorder: ReturnType<typeof createRecorder> | null = null;
let recordingTimerIntervalId: number | null = null;

/** Effect unit in the rack. */
type RackUnit =
  | { id: string; type: "lexicon224"; params: Lexicon224Params; bypass: boolean }
  | { id: string; type: "daftpunkfilter"; params: DaftPunkFilterParams; bypass: boolean }
  | { id: string; type: "elcompressor"; params: ELCompressorParams; bypass: boolean };

let rackUnits: RackUnit[] = [];

/** Effect types that can be added. Only one instance of each type allowed. */
const EFFECT_TYPES = [
  { type: "lexicon224" as const, label: "Lexicon 224 Reverb" },
  { type: "daftpunkfilter" as const, label: "Daft Punk Filter" },
  { type: "elcompressor" as const, label: "EL Compressor (Distressor)" },
];

/** Effect chain: source → chain[0] → … → chain[n] → masterGain. Rebuilt when units change. */
interface EffectChainNode {
  input: AudioNode;
  output: AudioNode;
  dispose?: () => void;
  setParams?: (p: unknown) => void;
  setBypass?: (bypass: boolean) => void;
}
let effectChainNodes: EffectChainNode[] = [];

/** Wire masterGain → analyser → destination for the given context. */
function wireContext(ctx: AudioContext): void {
  masterGain = ctx.createGain();
  masterGain.gain.value = masterVolume;
  analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.75;
  analyserNode.minDecibels = -60;
  analyserNode.maxDecibels = 0;
  masterGain.connect(analyserNode);
  analyserNode.connect(ctx.destination);
}

function getOrCreateContext(): AudioContext {
  if (audioContext?.state !== "closed") {
    if (audioContext) return audioContext;
    audioContext = new AudioContext();
    wireContext(audioContext);
    return audioContext;
  }
  audioContext = new AudioContext();
  wireContext(audioContext);
  return audioContext;
}

function ensureMasterGain(): GainNode {
  getOrCreateContext();
  masterGain!.gain.value = masterVolume;
  return masterGain!;
}

async function loadFileAsBuffer(file: File): Promise<AudioBuffer> {
  const ctx = getOrCreateContext();
  if (ctx.state === "suspended") await ctx.resume();
  const arrayBuffer = await file.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

function getCurrentSourceNode(): AudioNode | null {
  return currentBufferSource ?? micRecordSource;
}

/** Reconnect the current source (file or mic) through the effect chain or straight to masterGain. */
function reconnectSourceToChain(): void {
  const source = getCurrentSourceNode();
  if (!source || !masterGain) return;
  source.disconnect();
  if (effectChainNodes.length > 0) {
    const first = effectChainNodes[0];
    const last = effectChainNodes[effectChainNodes.length - 1];
    if (first && last) {
      source.connect(first.input);
      last.output.connect(masterGain);
    } else {
      source.connect(masterGain);
    }
  } else {
    source.connect(masterGain);
  }
}

/** Rebuild effect chain from rackUnits. Disconnects old nodes, creates new ones, then reconnects source. */
function rebuildEffectChain(): void {
  const ctx = audioContext;
  if (!ctx || !masterGain) return;

  for (const node of effectChainNodes) {
    node.output.disconnect();
    node.dispose?.();
  }
  effectChainNodes = [];

  for (let i = 0; i < rackUnits.length; i++) {
    const unit = rackUnits[i];
    if (!unit) continue;

    const wrapperInput = ctx.createGain();
    wrapperInput.gain.value = 1;
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const merge = ctx.createGain();
    merge.gain.value = 1;
    dryGain.gain.value = unit.bypass ? 1 : 0;
    wetGain.gain.value = unit.bypass ? 0 : 1;
    wrapperInput.connect(dryGain);
    dryGain.connect(merge);

    let setParams: ((p: unknown) => void) | undefined;
    let disposeInner: () => void;

    if (unit.type === "lexicon224") {
      const reverb = createLexicon224Reverb(ctx, unit.params);
      wrapperInput.connect(reverb.input);
      reverb.output.connect(wetGain);
      setParams = reverb.setParams as (p: unknown) => void;
      disposeInner = reverb.dispose;
    } else if (unit.type === "daftpunkfilter") {
      const filter = createDaftPunkFilter(ctx, unit.params);
      wrapperInput.connect(filter.input);
      filter.output.connect(wetGain);
      setParams = filter.setParams as (p: unknown) => void;
      disposeInner = filter.dispose;
    } else if (unit.type === "elcompressor") {
      const comp = createELCompressor(ctx, unit.params);
      wrapperInput.connect(comp.input);
      comp.output.connect(wetGain);
      setParams = comp.setParams as (p: unknown) => void;
      disposeInner = comp.dispose;
    } else {
      continue;
    }

    wetGain.connect(merge);
    if (effectChainNodes.length > 0) {
      const prev = effectChainNodes[effectChainNodes.length - 1];
      if (prev) prev.output.connect(wrapperInput);
    }
    effectChainNodes.push({
      input: wrapperInput,
      output: merge,
      setBypass(b: boolean) {
        dryGain.gain.value = b ? 1 : 0;
        wetGain.gain.value = b ? 0 : 1;
      },
      setParams,
      dispose() {
        wrapperInput.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        disposeInner();
      },
    });
  }

  reconnectSourceToChain();
}

/** Stop mic recording and discard (no buffer saved). Used when switching to file upload or unmount. */
function stopMicRecordingAndDiscard(): void {
  if (micRecorder) {
    micRecorder.stop().catch(() => {});
    micRecorder = null;
  }
  if (micRecordSource) {
    micRecordSource.disconnect();
    micRecordSource = null;
  }
  if (micRecordStream) {
    micRecordStream.getTracks().forEach((t) => t.stop());
    micRecordStream = null;
  }
  if (micRecordingTimerIntervalId !== null) {
    clearInterval(micRecordingTimerIntervalId);
    micRecordingTimerIntervalId = null;
  }
  isRecordingFromMic = false;
}

function stopFilePlayback(): void {
  if (currentBufferSource) {
    try {
      currentBufferSource.stop();
    } catch {
      // already stopped
    }
    currentBufferSource.disconnect();
    currentBufferSource = null;
  }
  isPlaying = false;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function render(): void {
  if (!rootContainer) return;

  rootContainer.innerHTML = "";
  rootContainer.classList.add("effects-rack");

  const app = document.createElement("div");
  app.className = "effects-rack__inner";

  const header = document.createElement("header");
  header.className = "effects-rack__header";
  const title = document.createElement("h1");
  title.className = "effects-rack__title";
  title.textContent = "Effects Rack";
  const subtitle = document.createElement("p");
  subtitle.className = "effects-rack__subtitle";
  subtitle.textContent =
    "Load an audio file or record from mic, then add effects to the rack.";
  header.append(title, subtitle);
  app.appendChild(header);

  const inputSection = document.createElement("section");
  inputSection.className = "effects-rack__section effects-rack__input-section";
  const inputLabel = document.createElement("h2");
  inputLabel.className = "effects-rack__section-title";
  inputLabel.textContent = "Input";
  inputSection.appendChild(inputLabel);

  const sourceRow = document.createElement("div");
  sourceRow.className = "effects-rack__source-row";

  const fileWrap = document.createElement("label");
  fileWrap.className = "effects-rack__file-label";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*";
  fileInput.className = "effects-rack__file-input";
  fileWrap.appendChild(fileInput);
  const fileText = document.createElement("span");
  fileText.className = "effects-rack__file-text";
  fileText.textContent = sourceBuffer ? "Replace file…" : "Upload audio file";
  fileWrap.appendChild(fileText);
  sourceRow.appendChild(fileWrap);

  const micBtn = document.createElement("button");
  micBtn.type = "button";
  micBtn.className = "effects-rack__btn effects-rack__btn--secondary";
  if (isRecordingFromMic) {
    micBtn.textContent = "Stop";
    micBtn.title = "Stop recording and save as source";
  } else {
    micBtn.textContent = "Record from mic";
    micBtn.title = "Record from microphone; saved as source so you can play and add effects";
  }
  sourceRow.appendChild(micBtn);

  inputSection.appendChild(sourceRow);

  const hasSource = sourceBuffer !== null;
  const controlsRow = document.createElement("div");
  controlsRow.className = "effects-rack__controls-row";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "effects-rack__btn effects-rack__btn--play";
  playBtn.textContent = isPlaying ? "Stop" : "Play";
  playBtn.title =
    sourceBuffer
      ? isPlaying
        ? "Stop playback"
        : "Play source (file or mic recording)"
      : "Upload a file or record from mic first";
  playBtn.disabled = !sourceBuffer;
  controlsRow.appendChild(playBtn);

  const volWrap = document.createElement("div");
  volWrap.className = "effects-rack__vol-wrap";
  const volLabel = document.createElement("label");
  volLabel.className = "effects-rack__vol-label";
  volLabel.textContent = "Master";
  const volSlider = document.createElement("input");
  volSlider.type = "range";
  volSlider.min = "0";
  volSlider.max = "100";
  volSlider.value = String(Math.round(masterVolume * 100));
  volSlider.className = "effects-rack__vol-slider";
  volLabel.appendChild(volSlider);
  volWrap.appendChild(volLabel);
  controlsRow.appendChild(volWrap);

  const recordBtn = document.createElement("button");
  recordBtn.type = "button";
  recordBtn.className = "effects-rack__btn effects-rack__btn--record";
  recordBtn.textContent = isRecording ? "Stop" : "Record effects";
  recordBtn.title = isRecording
    ? "Stop recording output"
    : "Record output (with effects) for download";
  recordBtn.disabled = !hasSource;
  controlsRow.appendChild(recordBtn);

  const levelMeterWrap = document.createElement("div");
  levelMeterWrap.className = "effects-rack__level-wrap";
  levelMeterWrap.setAttribute("aria-label", "Output level");
  const levelMeterLabel = document.createElement("span");
  levelMeterLabel.className = "effects-rack__level-label";
  levelMeterLabel.textContent = "Level";
  const levelMeter = document.createElement("div");
  levelMeter.className = "effects-rack__level-meter";
  const levelMeterFill = document.createElement("div");
  levelMeterFill.className = "effects-rack__level-meter-fill";
  levelMeter.appendChild(levelMeterFill);
  levelMeterWrap.append(levelMeterLabel, levelMeter);
  controlsRow.appendChild(levelMeterWrap);

  inputSection.appendChild(controlsRow);

  if (isRecording) {
    const recIndicator = document.createElement("span");
    recIndicator.className = "effects-rack__recording-indicator";
    recIndicator.textContent = `● ${formatTime((Date.now() - recordingStartTime) / 1000)}`;
    recIndicator.setAttribute("aria-live", "polite");
    inputSection.appendChild(recIndicator);
    if (recordingTimerIntervalId !== null) {
      clearInterval(recordingTimerIntervalId);
    }
    recordingTimerIntervalId = window.setInterval(() => {
      const el = rootContainer?.querySelector(".effects-rack__recording-indicator");
      if (el) {
        el.textContent = `● ${formatTime((Date.now() - recordingStartTime) / 1000)}`;
      }
    }, 500);
  }

  if (isRecordingFromMic) {
    const micRecIndicator = document.createElement("span");
    micRecIndicator.className = "effects-rack__recording-indicator effects-rack__recording-indicator--mic";
    micRecIndicator.textContent = `Mic ● ${formatTime((Date.now() - micRecordingStartTime) / 1000)}`;
    micRecIndicator.setAttribute("aria-live", "polite");
    inputSection.appendChild(micRecIndicator);
    if (micRecordingTimerIntervalId !== null) {
      clearInterval(micRecordingTimerIntervalId);
    }
    micRecordingTimerIntervalId = window.setInterval(() => {
      const el = rootContainer?.querySelector(".effects-rack__recording-indicator--mic");
      if (el) {
        el.textContent = `Mic ● ${formatTime((Date.now() - micRecordingStartTime) / 1000)}`;
      }
    }, 500);
  }

  if (recordedBlob) {
    const recordingReady = document.createElement("p");
    recordingReady.className = "effects-rack__recording-ready";
    recordingReady.textContent = "● Recording ready";
    inputSection.appendChild(recordingReady);
    const downloadWrap = document.createElement("div");
    downloadWrap.className = "effects-rack__download-wrap";
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "effects-rack__btn effects-rack__btn--download";
    downloadBtn.textContent = "Download ▼";
    downloadBtn.setAttribute("aria-haspopup", "true");
    downloadBtn.setAttribute("aria-expanded", "false");
    const downloadMenu = document.createElement("div");
    downloadMenu.className = "effects-rack__download-menu";
    downloadMenu.setAttribute("role", "menu");
    const base = `effects-rack-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`;
    const opts: { label: string; ext: string; getBlob: () => Blob | Promise<Blob> }[] = [
      { label: "Recorded (WebM)", ext: "webm", getBlob: () => recordedBlob! },
      {
        label: "Convert to WAV",
        ext: "wav",
        getBlob: async () => {
          const ctx = getOrCreateContext();
          const buf = await decodeBlobToAudioBuffer(recordedBlob!, ctx);
          return encodeAudioBufferToWav(buf);
        },
      },
      {
        label: "Convert to MP3",
        ext: "mp3",
        getBlob: async () => {
          const ctx = getOrCreateContext();
          const buf = await decodeBlobToAudioBuffer(recordedBlob!, ctx);
          return encodeAudioBufferToMp3(buf);
        },
      },
    ];
    opts.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "effects-rack__download-menu-item";
      item.textContent = opt.label;
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", async () => {
        downloadMenu.classList.remove("effects-rack__download-menu--open");
        try {
          const blob = await Promise.resolve(opt.getBlob());
          downloadBlob(blob, `${base}.${opt.ext}`);
        } catch (e) {
          console.error("Download failed", e);
        }
      });
      downloadMenu.appendChild(item);
    });
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = downloadMenu.classList.toggle("effects-rack__download-menu--open");
      downloadBtn.setAttribute("aria-expanded", String(open));
      if (open) {
        const closeMenu = (e2: MouseEvent): void => {
          if (!downloadWrap.contains(e2.target as Node)) {
            downloadMenu.classList.remove("effects-rack__download-menu--open");
            downloadBtn.setAttribute("aria-expanded", "false");
            document.removeEventListener("click", closeMenu);
          }
        };
        setTimeout(() => document.addEventListener("click", closeMenu), 0);
      }
    });
    downloadWrap.append(downloadBtn, downloadMenu);
    inputSection.appendChild(downloadWrap);
  }

  if (sourceBuffer) {
    const sourceInfo = document.createElement("p");
    sourceInfo.className = "effects-rack__source-info";
    sourceInfo.textContent = `Loaded: ${sourceBuffer.duration.toFixed(1)}s, ${sourceBuffer.numberOfChannels} ch, ${sourceBuffer.sampleRate} Hz`;
    inputSection.appendChild(sourceInfo);
  }

  app.appendChild(inputSection);

  fileInput.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      stopMicRecordingAndDiscard();
      stopFilePlayback();
      sourceBuffer = await loadFileAsBuffer(file);
      render();
    } catch (err) {
      console.error("Failed to load audio", err);
    }
    fileInput.value = "";
  });

  micBtn.addEventListener("click", async () => {
    if (isRecordingFromMic) {
      if (!micRecorder || !audioContext) return;
      try {
        const blob = await micRecorder.stop();
        micRecorder = null;
        sourceBuffer = await decodeBlobToAudioBuffer(blob, audioContext);
      } catch (err) {
        console.error("Failed to decode mic recording", err);
      }
      if (micRecordSource && masterGain) {
        micRecordSource.disconnect(masterGain);
        micRecordSource = null;
      }
      if (micRecordStream) {
        micRecordStream.getTracks().forEach((t) => t.stop());
        micRecordStream = null;
      }
      if (micRecordingTimerIntervalId !== null) {
        clearInterval(micRecordingTimerIntervalId);
        micRecordingTimerIntervalId = null;
      }
      isRecordingFromMic = false;
      stopFilePlayback();
      render();
      return;
    }
    try {
      stopFilePlayback();
      sourceBuffer = null;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRecordStream = stream;
      const ctx = getOrCreateContext();
      if (ctx.state === "suspended") await ctx.resume();
      ensureMasterGain();
      micRecordSource = ctx.createMediaStreamSource(stream);
      rebuildEffectChain();
      micRecorder = createRecorder(stream);
      micRecorder.start();
      micRecordingStartTime = Date.now();
      isRecordingFromMic = true;
      render();
    } catch (err) {
      console.error("Failed to access microphone", err);
    }
  });

  playBtn.addEventListener("click", async () => {
    if (!sourceBuffer || !masterGain) return;
    const ctx = getOrCreateContext();
    if (ctx.state === "suspended") await ctx.resume();
    ensureMasterGain();

    if (isPlaying) {
      stopFilePlayback();
      render();
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = sourceBuffer;
    source.loop = false;
    currentBufferSource = source;
    reconnectSourceToChain();
    source.onended = () => {
      currentBufferSource = null;
      isPlaying = false;
      if (rootContainer) render();
    };
    source.start(0);
    isPlaying = true;
    render();
  });

  volSlider.addEventListener("input", () => {
    const v = Number((volSlider as HTMLInputElement).value) / 100;
    masterVolume = Math.max(0, Math.min(1, v));
    if (masterGain) masterGain.gain.value = masterVolume;
  });

  recordBtn.addEventListener("click", async () => {
    if (isRecording) {
      if (activeRecorder) {
        recordedBlob = await activeRecorder.stop();
        activeRecorder = null;
      }
      if (recordDestination && masterGain) {
        masterGain.disconnect(recordDestination);
        recordDestination = null;
      }
      isRecording = false;
      if (recordingTimerIntervalId !== null) {
        clearInterval(recordingTimerIntervalId);
        recordingTimerIntervalId = null;
      }
      render();
      return;
    }

    const ctx = getOrCreateContext();
    if (ctx.state === "suspended") await ctx.resume();
    const gain = ensureMasterGain();
    recordDestination = ctx.createMediaStreamDestination();
    gain.connect(recordDestination);
    activeRecorder = createRecorder(recordDestination.stream);
    activeRecorder.start();
    recordingStartTime = Date.now();
    isRecording = true;
    render();
  });

  const rackSection = document.createElement("section");
  rackSection.className = "effects-rack__section effects-rack__rack-section";
  const rackTitle = document.createElement("h2");
  rackTitle.className = "effects-rack__section-title";
  rackTitle.textContent = "Rack";
  rackSection.appendChild(rackTitle);

  const rackShell = document.createElement("div");
  rackShell.className = "effects-rack__shell";
  rackShell.setAttribute("role", "list");

  rackUnits.forEach((unit, index) => {
    const unitEl = document.createElement("div");
    unitEl.className = `effects-rack__unit effects-rack__unit--${unit.type}`;
    unitEl.setAttribute("role", "listitem");
    unitEl.dataset.unitId = unit.id;

    const unitFace = document.createElement("div");
    unitFace.className = "effects-rack__unit-face";
    const unitLabel = document.createElement("span");
    unitLabel.className = "effects-rack__unit-label";
    unitLabel.textContent =
      unit.type === "lexicon224"
        ? "Lexicon 224"
        : unit.type === "daftpunkfilter"
          ? "Daft Punk Filter"
          : unit.type === "elcompressor"
            ? "EL Compressor"
            : "Effect";
    const bypassWrap = document.createElement("div");
    bypassWrap.className = "effects-rack__unit-bypass";
    const bypassBtn = document.createElement("button");
    bypassBtn.type = "button";
    bypassBtn.className = "effects-rack__bypass-btn";
    bypassBtn.setAttribute("aria-pressed", String(unit.bypass));
    bypassBtn.setAttribute("aria-label", unit.bypass ? "Bypass on (effect off)" : "Bypass off (effect on)");
    bypassBtn.title = unit.bypass ? "Click to enable effect" : "Click to bypass effect";
    bypassBtn.textContent = unit.bypass ? "BYP" : "ON";
    bypassBtn.addEventListener("click", () => {
      unit.bypass = !unit.bypass;
      effectChainNodes[index]?.setBypass?.(unit.bypass);
      render();
    });
    bypassWrap.appendChild(bypassBtn);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "effects-rack__unit-remove";
    removeBtn.textContent = "\u23FB";
    removeBtn.title = "Remove effect from rack (power off)";
    removeBtn.setAttribute("aria-label", "Remove effect from rack");
    unitFace.append(unitLabel, bypassWrap, removeBtn);
    unitEl.appendChild(unitFace);

    if (unit.type === "lexicon224") {
      const paramsRow = document.createElement("div");
      paramsRow.className = "effects-rack__unit-params";
      const p = unit.params;
      const mixLabel = document.createElement("label");
      mixLabel.className = "effects-rack__param";
      mixLabel.innerHTML = `Mix <output>${Math.round(p.mix * 100)}</output>%`;
      const mixSlider = document.createElement("input");
      mixSlider.type = "range";
      mixSlider.min = "0";
      mixSlider.max = "100";
      mixSlider.value = String(Math.round(p.mix * 100));
      mixSlider.className = "effects-rack__param-slider";
      mixLabel.appendChild(mixSlider);
      mixSlider.addEventListener("input", () => {
        const v = Number(mixSlider.value) / 100;
        unit.params.mix = v;
        (mixLabel.querySelector("output") as HTMLElement).textContent = `${Math.round(v * 100)}%`;
        effectChainNodes[index]?.setParams?.({ mix: v });
      });
      const decayLabel = document.createElement("label");
      decayLabel.className = "effects-rack__param";
      decayLabel.innerHTML = `Decay <output>${p.decay.toFixed(1)}</output>s`;
      const decaySlider = document.createElement("input");
      decaySlider.type = "range";
      decaySlider.min = "0.5";
      decaySlider.max = "6";
      decaySlider.step = "0.1";
      decaySlider.value = String(p.decay);
      decaySlider.className = "effects-rack__param-slider";
      decayLabel.appendChild(decaySlider);
      decaySlider.addEventListener("input", () => {
        const v = Number(decaySlider.value);
        unit.params.decay = v;
        (decayLabel.querySelector("output") as HTMLElement).textContent = `${v.toFixed(1)}s`;
        effectChainNodes[index]?.setParams?.({ decay: v });
      });
      const preLabel = document.createElement("label");
      preLabel.className = "effects-rack__param";
      preLabel.innerHTML = `Pre <output>${(p.preDelay * 1000).toFixed(0)}</output>ms`;
      const preSlider = document.createElement("input");
      preSlider.type = "range";
      preSlider.min = "0";
      preSlider.max = "100";
      preSlider.value = String(p.preDelay * 1000);
      preSlider.className = "effects-rack__param-slider";
      preLabel.appendChild(preSlider);
      preSlider.addEventListener("input", () => {
        const v = Number(preSlider.value) / 1000;
        unit.params.preDelay = v;
        (preLabel.querySelector("output") as HTMLElement).textContent = `${(v * 1000).toFixed(0)}ms`;
        effectChainNodes[index]?.setParams?.({ preDelay: v });
      });
      paramsRow.append(mixLabel, decayLabel, preLabel);
      unitEl.appendChild(paramsRow);
    } else if (unit.type === "daftpunkfilter") {
      const paramsRow = document.createElement("div");
      paramsRow.className = "effects-rack__unit-params";
      const p = unit.params;
      const faderRow = document.createElement("div");
      faderRow.className = "effects-rack__param effects-rack__param--fader-row";
      const openLabel = document.createElement("label");
      openLabel.className = "effects-rack__param-label";
      openLabel.innerHTML = `Open <output>${Math.round(p.open * 100)}</output>%`;
      const faderWrap = document.createElement("div");
      faderWrap.className = "effects-rack__param-fader-wrap";
      const openSlider = document.createElement("input");
      openSlider.type = "range";
      openSlider.min = "0";
      openSlider.max = "100";
      openSlider.value = String(Math.round(p.open * 100));
      openSlider.className = "effects-rack__param-fader";
      openSlider.title = "Muffled (left) ← → Crystal clear (right)";
      openSlider.setAttribute("aria-label", "Filter open: muffled to crystal clear");
      const scale = document.createElement("div");
      scale.className = "effects-rack__param-fader-scale";
      scale.setAttribute("aria-hidden", "true");
      for (const n of [0, 25, 50, 75, 100]) {
        const tick = document.createElement("span");
        tick.className = "effects-rack__param-fader-scale-tick";
        tick.textContent = String(n);
        scale.appendChild(tick);
      }
      faderWrap.append(openSlider, scale);
      faderRow.append(openLabel, faderWrap);
      openSlider.addEventListener("input", () => {
        const v = Number(openSlider.value) / 100;
        unit.params.open = v;
        (openLabel.querySelector("output") as HTMLElement).textContent = `${Math.round(v * 100)}%`;
        effectChainNodes[index]?.setParams?.({ open: v });
      });
      paramsRow.appendChild(faderRow);
      unitEl.appendChild(paramsRow);
    } else if (unit.type === "elcompressor") {
      const paramsRow = document.createElement("div");
      paramsRow.className = "effects-rack__unit-params";
      const p = unit.params;

      const addParam = (
        labelText: string,
        valueDisplay: string,
        min: string,
        max: string,
        step: string,
        value: string,
        getUpdate: (v: number) => Partial<ELCompressorParams>,
        format: (v: number) => string
      ): void => {
        const label = document.createElement("label");
        label.className = "effects-rack__param effects-rack__param--el";
        label.innerHTML = `${labelText} <output>${valueDisplay}</output>`;
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.className = "effects-rack__param-slider effects-rack__param-slider--el";
        label.appendChild(slider);
        slider.addEventListener("input", () => {
          const v = Number(slider.value);
          Object.assign(unit.params, getUpdate(v));
          (label.querySelector("output") as HTMLElement).textContent = format(v);
          effectChainNodes[index]?.setParams?.(getUpdate(v));
        });
        paramsRow.appendChild(label);
      };

      addParam("Input", Math.round(p.input * 100).toString(), "0", "100", "1", String(Math.round(p.input * 100)), (v) => ({ input: v / 100 }), (v) => `${Math.round(v)}%`);
      addParam("Thresh", String(p.threshold), "-40", "0", "1", String(p.threshold), (v) => ({ threshold: v }), (v) => `${Math.round(v)} dB`);
      addParam("Attack", (p.attack * 1000).toFixed(0), "1", "200", "1", String(p.attack * 1000), (v) => ({ attack: v / 1000 }), (v) => `${Math.round(v)} ms`);
      addParam("Release", (p.release * 1000).toFixed(0), "10", "1000", "5", String(p.release * 1000), (v) => ({ release: v / 1000 }), (v) => `${Math.round(v)} ms`);
      addParam("Output", Math.round(p.output * 100).toString(), "0", "100", "1", String(Math.round(p.output * 100)), (v) => ({ output: v / 100 }), (v) => `${Math.round(v)}%`);

      const ratioRow = document.createElement("div");
      ratioRow.className = "effects-rack__param effects-rack__param--el-ratio";
      const ratioLabel = document.createElement("span");
      ratioLabel.className = "effects-rack__param-ratio-label";
      ratioLabel.textContent = "Ratio";
      ratioRow.appendChild(ratioLabel);
      const ratioWrap = document.createElement("div");
      ratioWrap.className = "effects-rack__param-ratio-btns";
      for (const r of EL_COMPRESSOR_RATIO_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "effects-rack__param-ratio-btn";
        btn.textContent = r === 20 ? "20" : `${r}:1`;
        if (unit.params.ratio === r) btn.classList.add("effects-rack__param-ratio-btn--active");
        btn.addEventListener("click", () => {
          unit.params.ratio = r;
          ratioWrap.querySelectorAll(".effects-rack__param-ratio-btn").forEach((b) => b.classList.remove("effects-rack__param-ratio-btn--active"));
          btn.classList.add("effects-rack__param-ratio-btn--active");
          effectChainNodes[index]?.setParams?.({ ratio: r });
          render();
        });
        ratioWrap.appendChild(btn);
      }
      ratioRow.appendChild(ratioWrap);
      paramsRow.appendChild(ratioRow);

      unitEl.appendChild(paramsRow);
    }

    rackShell.appendChild(unitEl);

    removeBtn.addEventListener("click", () => {
      rackUnits = rackUnits.filter((u) => u.id !== unit.id);
      rebuildEffectChain();
      render();
    });
  });

  const addWrap = document.createElement("div");
  addWrap.className = "effects-rack__add-wrap";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "effects-rack__btn effects-rack__btn--add";
  addBtn.textContent = "+ Add effect ▼";
  addBtn.setAttribute("aria-haspopup", "true");
  addBtn.setAttribute("aria-expanded", "false");
  const addMenu = document.createElement("div");
  addMenu.className = "effects-rack__add-menu";
  addMenu.setAttribute("role", "menu");
  EFFECT_TYPES.forEach(({ type, label }) => {
    const alreadyAdded = rackUnits.some((u) => u.type === type);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "effects-rack__add-menu-item";
    item.textContent = label;
    item.setAttribute("role", "menuitem");
    item.disabled = alreadyAdded;
    if (alreadyAdded) item.title = "Already in rack (one per type)";
    item.addEventListener("click", () => {
      addMenu.classList.remove("effects-rack__add-menu--open");
      addBtn.setAttribute("aria-expanded", "false");
      if (alreadyAdded) return;
      if (type === "lexicon224") {
        rackUnits = [
          ...rackUnits,
          {
            id: crypto.randomUUID(),
            type: "lexicon224",
            params: { ...LEXICON224_DEFAULT_PARAMS },
            bypass: false,
          },
        ];
      } else if (type === "daftpunkfilter") {
        rackUnits = [
          ...rackUnits,
          {
            id: crypto.randomUUID(),
            type: "daftpunkfilter",
            params: { ...DAFTPUNK_FILTER_DEFAULT_PARAMS },
            bypass: false,
          },
        ];
      } else if (type === "elcompressor") {
        rackUnits = [
          ...rackUnits,
          {
            id: crypto.randomUUID(),
            type: "elcompressor",
            params: { ...EL_COMPRESSOR_DEFAULT_PARAMS },
            bypass: false,
          },
        ];
      }
      rebuildEffectChain();
      render();
    });
    addMenu.appendChild(item);
  });
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = addMenu.classList.toggle("effects-rack__add-menu--open");
    addBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      const closeMenu = (e2: MouseEvent): void => {
        if (!addWrap.contains(e2.target as Node)) {
          addMenu.classList.remove("effects-rack__add-menu--open");
          addBtn.setAttribute("aria-expanded", "false");
          document.removeEventListener("click", closeMenu);
        }
      };
      setTimeout(() => document.addEventListener("click", closeMenu), 0);
    }
  });
  addWrap.append(addBtn, addMenu);
  rackSection.append(rackShell, addWrap);
  app.appendChild(rackSection);

  rootContainer.appendChild(app);

  if (analyserNode && meterAnimationId === null) {
    const dataArray = new Uint8Array(analyserNode.fftSize);
    const updateMeter = (): void => {
      if (!rootContainer || !analyserNode) return;
      analyserNode.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = dataArray[i] ?? 128;
        const n = (sample - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(1, rms * 2);
      const fill = rootContainer.querySelector(".effects-rack__level-meter-fill");
      if (fill instanceof HTMLElement) {
        fill.style.height = `${level * 100}%`;
        fill.classList.toggle("effects-rack__level-meter-fill--hot", level >= 0.85);
      }
      meterAnimationId = requestAnimationFrame(updateMeter);
    };
    meterAnimationId = requestAnimationFrame(updateMeter);
  }
}

/**
 * Mount the Effects Rack into a container element.
 * Returns an unmount function.
 */
export function mount(container: HTMLElement): () => void {
  if (rootContainer) {
    throw new Error("Effects Rack is already mounted. Call unmount() first.");
  }
  rootContainer = container;
  getOrCreateContext();
  render();

  return function unmount(): void {
    if (!rootContainer) return;
    stopMicRecordingAndDiscard();
    stopFilePlayback();
    for (const node of effectChainNodes) {
      node.output.disconnect();
      node.dispose?.();
    }
    effectChainNodes = [];
    if (isRecording && activeRecorder) {
      activeRecorder.stop().catch(() => {});
      activeRecorder = null;
    }
    if (recordDestination && masterGain) {
      masterGain.disconnect(recordDestination);
      recordDestination = null;
    }
    if (recordingTimerIntervalId !== null) {
      clearInterval(recordingTimerIntervalId);
      recordingTimerIntervalId = null;
    }
    if (meterAnimationId !== null) {
      cancelAnimationFrame(meterAnimationId);
      meterAnimationId = null;
    }
    rootContainer.innerHTML = "";
    rootContainer.classList.remove("effects-rack");
    rootContainer = null;
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    masterGain = null;
    analyserNode = null;
  };
}
