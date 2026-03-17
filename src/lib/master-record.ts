/**
 * Master recording: capture from MediaStream, and convert to WAV/MP3 for download.
 * Shared by eno-tape-loop and effects-rack.
 */

import { Mp3Encoder } from "lamejs";

const SAMPLE_BLOCK = 1152;

/** Record from stream until stop() is called; returns the recorded Blob. */
export function createRecorder(stream: MediaStream): {
  start: () => void;
  stop: () => Promise<Blob>;
} {
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const chunks: Blob[] = [];

  let recorder: MediaRecorder | null = null;
  let resolveStop: (value: Blob) => void;

  const start = (): void => {
    chunks.length = 0;
    recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolveStop(blob);
    };
    recorder.start(100);
  };

  const stop = (): Promise<Blob> => {
    return new Promise((resolve) => {
      resolveStop = resolve;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        resolve(new Blob(chunks, { type: mimeType }));
      }
    });
  };

  return { start, stop };
}

/** Decode a recorded blob (e.g. WebM) to an AudioBuffer. */
export async function decodeBlobToAudioBuffer(
  blob: Blob,
  context: BaseAudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return context.decodeAudioData(arrayBuffer);
}

/** Encode an AudioBuffer to WAV and return a Blob. */
export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  let pos = 0;
  const writeString = (s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(pos + i, s.charCodeAt(i));
    pos += s.length;
  };

  writeString("RIFF");
  view.setUint32(pos, totalSize - 8, true);
  pos += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(pos, 16, true);
  pos += 4;
  view.setUint16(pos, 1, true);
  pos += 2;
  view.setUint16(pos, numChannels, true);
  pos += 2;
  view.setUint32(pos, sampleRate, true);
  pos += 4;
  view.setUint32(pos, byteRate, true);
  pos += 4;
  view.setUint16(pos, blockAlign, true);
  pos += 2;
  view.setUint16(pos, 16, true);
  pos += 2;
  writeString("data");
  view.setUint32(pos, dataSize, true);
  pos += 4;

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = channels[c]?.[i] ?? 0;
      const s = Math.max(-1, Math.min(1, sample));
      const v = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(pos, v, true);
      pos += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/** Encode an AudioBuffer to MP3 and return a Blob. Uses lamejs. */
export function encodeAudioBufferToMp3(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const encoder = new Mp3Encoder(numChannels, sampleRate, 128);

  const left = buffer.getChannelData(0);
  const right: Float32Array = numChannels > 1 ? buffer.getChannelData(1) : left;

  const float32ToInt16 = (f: number): number => {
    const s = Math.max(-1, Math.min(1, f));
    return s < 0 ? s * 0x8000 : s * 0x7fff;
  };

  const mp3Chunks: Int8Array[] = [];

  for (let i = 0; i < buffer.length; i += SAMPLE_BLOCK) {
    const block = Math.min(SAMPLE_BLOCK, buffer.length - i);
    const leftChunk = new Int16Array(block);
    const rightChunk = new Int16Array(block);
    for (let j = 0; j < block; j++) {
      leftChunk[j] = float32ToInt16(left[i + j] ?? 0);
      rightChunk[j] = float32ToInt16(right[i + j] ?? 0);
    }
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) mp3Chunks.push(mp3buf);
  }

  const flush = encoder.flush();
  if (flush.length > 0) mp3Chunks.push(flush);

  return new Blob(mp3Chunks, { type: "audio/mpeg" });
}

/** Trigger download of a Blob with a suggested filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
