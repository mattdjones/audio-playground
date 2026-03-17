/**
 * Draws a waveform from an AudioBuffer and supports draggable loop region handles.
 */

import type { LoopTrack } from "./engine";

const WAVEFORM_HEIGHT = 48;
const HANDLE_HIT_RADIUS = 8;
const DEFAULT_CANVAS_WIDTH = 320;

function maxInRange(data: Float32Array, start: number, end: number): number {
  let max = 0;
  for (let j = start; j < end; j++) {
    const v = Math.abs(data[j] ?? 0);
    if (v > max) max = v;
  }
  return max;
}

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  buffer: AudioBuffer,
  loopStart: number,
  loopEnd: number,
  duration: number
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const mid = height / 2;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#444";
  ctx.beginPath();
  for (let i = 0; i < width; i++) {
    const start = Math.floor((i / width) * data.length);
    const end = Math.min(start + step, data.length);
    const max = maxInRange(data, start, end);
    const y = mid - (max * mid);
    if (i === 0) ctx.moveTo(i, y);
    else ctx.lineTo(i, y);
  }
  for (let i = width - 1; i >= 0; i--) {
    const start = Math.floor((i / width) * data.length);
    const end = Math.min(start + step, data.length);
    const max = maxInRange(data, start, end);
    const y = mid + (max * mid);
    ctx.lineTo(i, y);
  }
  ctx.closePath();
  ctx.fill();

  const startX = (loopStart / duration) * width;
  const endX = (loopEnd / duration) * width;

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  if (startX > 0) ctx.fillRect(0, 0, startX, height);
  if (endX < width) ctx.fillRect(endX, 0, width - endX, height);

  ctx.strokeStyle = "#c4a574";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(startX, height);
  ctx.moveTo(endX, 0);
  ctx.lineTo(endX, height);
  ctx.stroke();
}

export interface WaveformResult {
  element: HTMLElement;
  cleanup: () => void;
  /** Update playhead position (seconds). Pass a negative value to hide. */
  setPlayheadPosition: (positionInSeconds: number) => void;
}

export function createWaveformElement(
  track: LoopTrack,
  onLoopChange: (start: number, end: number) => void
): WaveformResult {
  const container = document.createElement("div");
  container.className = "waveform-container";

  const canvas = document.createElement("canvas");
  canvas.width = DEFAULT_CANVAS_WIDTH;
  canvas.height = WAVEFORM_HEIGHT;
  canvas.className = "waveform-canvas";

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      element: container,
      cleanup: () => {},
      setPlayheadPosition: () => {},
    };
  }

  const wrapper = document.createElement("div");
  wrapper.className = "waveform-wrapper";

  const playhead = document.createElement("div");
  playhead.className = "waveform-playhead";
  playhead.setAttribute("aria-hidden", "true");
  playhead.style.visibility = "hidden";
  wrapper.appendChild(canvas);
  wrapper.appendChild(playhead);
  container.appendChild(wrapper);

  let ro: ResizeObserver | null = null;
  const resize = (): void => {
    const w = wrapper.clientWidth;
    if (w <= 0) return;
    canvas.width = w;
    canvas.height = WAVEFORM_HEIGHT;
    drawWaveform(ctx, track.buffer, track.loopStart, track.loopEnd, track.duration);
  };
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(resize);
    ro.observe(wrapper);
  }
  const cleanupResize = (): void => {
    ro?.disconnect();
    ro = null;
  };

  const setPlayheadPosition = (positionInSeconds: number): void => {
    if (positionInSeconds < 0) {
      playhead.style.visibility = "hidden";
      return;
    }
    const pct = Math.max(0, Math.min(1, positionInSeconds / track.duration)) * 100;
    playhead.style.left = `${pct}%`;
    playhead.style.visibility = "visible";
  };

  let draggingStart = false;
  let draggingEnd = false;

  const redraw = (): void => {
    drawWaveform(ctx, track.buffer, track.loopStart, track.loopEnd, track.duration);
  };

  const timeToDisplayX = (t: number, displayWidth: number): number =>
    (t / track.duration) * displayWidth;
  const displayXToTime = (x: number, displayWidth: number): number =>
    (x / displayWidth) * track.duration;

  const removeDocumentListeners = (): void => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent): void => {
    if (!draggingStart && !draggingEnd) return;
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width;
    const x = Math.max(0, Math.min(e.clientX - rect.left, displayWidth));
    const time = displayXToTime(x, displayWidth);
    if (draggingStart) {
      const newStart = Math.max(0, Math.min(time, track.loopEnd - 0.01));
      onLoopChange(newStart, track.loopEnd);
    } else {
      const newEnd = Math.max(track.loopStart + 0.01, Math.min(time, track.duration));
      onLoopChange(track.loopStart, newEnd);
    }
    redraw();
  };

  const handleMouseUp = (): void => {
    if (draggingStart || draggingEnd) {
      removeDocumentListeners();
    }
    draggingStart = false;
    draggingEnd = false;
  };

  const handleMouseDown = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width;
    const x = e.clientX - rect.left;
    const startX = timeToDisplayX(track.loopStart, displayWidth);
    const endX = timeToDisplayX(track.loopEnd, displayWidth);
    if (Math.abs(x - startX) < HANDLE_HIT_RADIUS) {
      draggingStart = true;
      e.preventDefault();
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else if (Math.abs(x - endX) < HANDLE_HIT_RADIUS) {
      draggingEnd = true;
      e.preventDefault();
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
  };

  canvas.addEventListener("mousedown", handleMouseDown);

  redraw();

  return {
    element: container,
    cleanup: () => {
      removeDocumentListeners();
      cleanupResize();
    },
    setPlayheadPosition,
  };
}
