/**
 * Web Audio engine for loop-based soundscapes.
 * Loads audio files, sets loop regions, and plays multiple loops with staggered
 * start times so they drift in and out of phase (Eno-style).
 */

/** Maximum start delay (seconds) for the delay indicator scale. */
export const MAX_START_DELAY = 5;

export interface LoopTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  /** Loop start time in seconds */
  loopStart: number;
  /** Loop end time in seconds */
  loopEnd: number;
  /** Duration of the buffer in seconds */
  duration: number;
  /** Track volume 0–1 */
  volume: number;
  /** Delay in seconds before this track starts when playing (0–MAX_START_DELAY). */
  startDelay: number;
}

export interface PlayingSource {
  trackId: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  /** When this loop was started (AudioContext time). */
  startTime: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private tracks: Map<string, LoopTrack> = new Map();
  private playingSources: PlayingSource[] = [];
  private masterGain: GainNode | null = null;
  private _masterVolume = 1;
  private recordDestination: MediaStreamAudioDestinationNode | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.ctx?.state === "running";
  }

  get trackList(): LoopTrack[] {
    return Array.from(this.tracks.values());
  }

  /** Reuse existing context unless closed; create a new one only when needed. */
  async init(): Promise<AudioContext> {
    if (this.ctx?.state !== "closed") {
      if (this.ctx) return this.ctx;
      this.ctx = new AudioContext();
    } else {
      this.ctx = new AudioContext();
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._masterVolume;
    this.masterGain.connect(this.ctx.destination);
    return this.ctx;
  }

  async ensureContext(): Promise<AudioContext> {
    const ctx = await this.init();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }

  /**
   * Start recording the master output. Returns the stream to feed to MediaRecorder.
   * Call stopRecording() when done.
   */
  async startRecording(): Promise<MediaStream> {
    const ctx = await this.ensureContext();
    if (!this.masterGain) throw new Error("Engine not initialised");
    if (this.recordDestination) {
      this.masterGain.disconnect(this.recordDestination);
      this.recordDestination = null;
    }
    const dest = ctx.createMediaStreamDestination();
    this.masterGain.connect(dest);
    this.recordDestination = dest;
    return dest.stream;
  }

  /** Stop recording and disconnect the record destination from the master gain. */
  stopRecording(): void {
    if (this.recordDestination && this.masterGain) {
      this.masterGain.disconnect(this.recordDestination);
      this.recordDestination = null;
    }
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    const ctx = await this.ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
  }

  addTrack(file: File, buffer: AudioBuffer): LoopTrack {
    const id = crypto.randomUUID();
    const duration = buffer.duration;
    const track: LoopTrack = {
      id,
      name: file.name.replace(/\.[^.]+$/, ""),
      buffer,
      loopStart: 0,
      loopEnd: Math.max(0.1, duration),
      duration,
      volume: 1,
      startDelay: 0,
    };
    this.tracks.set(id, track);
    return track;
  }

  removeTrack(id: string): void {
    this.stopTrack(id);
    this.tracks.delete(id);
  }

  updateLoop(id: string, loopStart: number, loopEnd: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    const duration = track.duration;
    track.loopStart = Math.max(0, Math.min(loopStart, duration - 0.01));
    track.loopEnd = Math.max(track.loopStart + 0.01, Math.min(loopEnd, duration));

    const playing = this.playingSources.find((p) => p.trackId === id);
    if (playing && this.ctx) {
      this.stopSource(playing.source);
      this.playingSources = this.playingSources.filter((p) => p !== playing);
      this.scheduleLoopWithGain(track, this.ctx.currentTime, playing.gainNode);
    }
  }

  /** Current playback position in seconds (within the loop), or null if not playing. */
  getPlaybackPosition(trackId: string): number | null {
    const track = this.tracks.get(trackId);
    const playing = this.playingSources.find((p) => p.trackId === trackId);
    if (!track || !playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    const elapsed = now - playing.startTime;
    const loopDuration = track.loopEnd - track.loopStart;
    const positionInLoop = ((elapsed % loopDuration) + loopDuration) % loopDuration;
    return track.loopStart + positionInLoop;
  }

  setTrackVolume(id: string, value: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.volume = Math.max(0, Math.min(1, value));
    for (const p of this.playingSources) {
      if (p.trackId === id) {
        p.gainNode.gain.value = track.volume;
        break;
      }
    }
  }

  setTrackStartDelay(id: string, value: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.startDelay = Math.max(0, Math.min(MAX_START_DELAY, value));
  }

  private stopSource(source: AudioBufferSourceNode): void {
    try {
      source.stop();
    } catch {
      // already stopped
    }
  }

  private stopTrack(id: string): void {
    this.playingSources = this.playingSources.filter((p) => {
      if (p.trackId === id) {
        this.stopSource(p.source);
        return false;
      }
      return true;
    });
  }

  stopAll(): void {
    for (const p of this.playingSources) {
      this.stopSource(p.source);
    }
    this.playingSources = [];
  }

  get isPlaying(): boolean {
    return this.playingSources.length > 0;
  }

  /**
   * Start all tracks. Each track starts after its configured startDelay
   * so loops drift in and out of phase over time.
   */
  playAll(): void {
    if (!this.ctx || !this.masterGain) return;
    this.stopAll();
    const now = this.ctx.currentTime;
    for (const track of this.tracks.values()) {
      this.scheduleLoop(track, now + track.startDelay);
    }
  }

  private scheduleLoop(track: LoopTrack, startTime: number): void {
    if (!this.ctx || !this.masterGain) return;
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = track.volume;
    gainNode.connect(this.masterGain);
    this.scheduleLoopWithGain(track, startTime, gainNode);
  }

  private scheduleLoopWithGain(
    track: LoopTrack,
    startTime: number,
    gainNode: GainNode
  ): void {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = track.buffer;
    source.loop = true;
    source.loopStart = track.loopStart;
    source.loopEnd = track.loopEnd;
    source.connect(gainNode);
    source.start(startTime, track.loopStart);
    this.playingSources.push({ trackId: track.id, source, gainNode, startTime });
    source.onended = () => {
      this.playingSources = this.playingSources.filter((p) => p.source !== source);
    };
  }

  get masterVolume(): number {
    return this._masterVolume;
  }

  setMasterVolume(value: number): void {
    this._masterVolume = Math.max(0, Math.min(1, value));
    if (this.masterGain) this.masterGain.gain.value = this._masterVolume;
  }
}
