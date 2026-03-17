/**
 * Lexicon 224-style reverb: convolution with a generated smooth, lush tail.
 * Parameters: mix (dry/wet), decay time, pre-delay.
 */

export interface Lexicon224Params {
  /** Dry/wet mix 0–1 (0 = dry, 1 = full reverb). */
  mix: number;
  /** Reverb decay time in seconds (tail length). */
  decay: number;
  /** Pre-delay in seconds before reverb onset. */
  preDelay: number;
}

const DEFAULT_PARAMS: Lexicon224Params = {
  mix: 0.35,
  decay: 2.5,
  preDelay: 0.02,
};

/**
 * Generate an impulse response that approximates a smooth, lush reverb tail
 * (Lexicon 224 style): noise burst with exponential decay, slightly darkened.
 */
function generateImpulseResponse(
  context: BaseAudioContext,
  decaySeconds: number,
  sampleRate: number
): AudioBuffer {
  const length = Math.min(sampleRate * decaySeconds, sampleRate * 8);
  const buffer = context.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);
  const decay = 3 / decaySeconds;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    channel[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t);
  }
  return buffer;
}

export interface ReverbNodePair {
  input: GainNode;
  output: GainNode;
  /** Update params without recreating the reverb (mix and pre-delay only; decay needs new IR). */
  setParams: (p: Partial<Lexicon224Params>) => void;
  dispose: () => void;
}

/**
 * Create a Lexicon 224-style reverb node. Input and output are GainNodes so they
 * can be connected into the graph. Internal chain: input → dry gain + (preDelay → convolver → wet gain) → output.
 */
export function createLexicon224Reverb(
  context: AudioContext,
  params: Partial<Lexicon224Params> = {}
): ReverbNodePair {
  const p = { ...DEFAULT_PARAMS, ...params };
  const input = context.createGain();
  input.gain.value = 1;

  const output = context.createGain();
  output.gain.value = 1;

  const dryGain = context.createGain();
  dryGain.gain.value = 1 - p.mix;
  input.connect(dryGain);
  dryGain.connect(output);

  const preDelayNode = context.createDelay(0.5);
  preDelayNode.delayTime.value = Math.min(0.5, Math.max(0, p.preDelay));
  const wetGain = context.createGain();
  wetGain.gain.value = p.mix;
  input.connect(preDelayNode);
  preDelayNode.connect(wetGain);

  const ir = generateImpulseResponse(context, p.decay, context.sampleRate);
  const convolver = context.createConvolver();
  convolver.buffer = ir;
  convolver.normalize = true;
  wetGain.connect(convolver);
  convolver.connect(output);

  function setParams(newP: Partial<Lexicon224Params>): void {
    if (newP.mix !== undefined) {
      const m = Math.max(0, Math.min(1, newP.mix));
      dryGain.gain.value = 1 - m;
      wetGain.gain.value = m;
    }
    if (newP.preDelay !== undefined) {
      preDelayNode.delayTime.value = Math.min(0.5, Math.max(0, newP.preDelay));
    }
    if (newP.decay !== undefined) {
      convolver.buffer = generateImpulseResponse(context, newP.decay, context.sampleRate);
    }
  }

  function dispose(): void {
    input.disconnect();
    preDelayNode.disconnect();
    dryGain.disconnect();
    wetGain.disconnect();
    convolver.disconnect();
  }

  return { input, output, setParams, dispose };
}

export { DEFAULT_PARAMS as LEXICON224_DEFAULT_PARAMS };
