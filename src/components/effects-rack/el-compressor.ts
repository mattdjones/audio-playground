/**
 * EL Compressor – Empirical Labs EL8X Distressor-style dynamics compressor.
 * Uses DynamicsCompressorNode with controls mapped to Input, Attack, Release, Ratio, Output.
 */

export interface ELCompressorParams {
  /** Input drive (gain before compressor). 0–1 maps to conservative, 1 = unity; higher drive = more compression. */
  input: number;
  /** Compression threshold in dB. -40 to 0; lower = more compression. */
  threshold: number;
  /** Compression ratio. 2, 4, 6, 10, or 20 (British-style). */
  ratio: number;
  /** Attack time in seconds (how fast compression engages). */
  attack: number;
  /** Release time in seconds (how fast compression releases). */
  release: number;
  /** Output (makeup) gain. 0–1 linear, maps to gain node. */
  output: number;
}

const DEFAULT_PARAMS: ELCompressorParams = {
  input: 0.6,
  threshold: -18,
  ratio: 4,
  attack: 0.01,
  release: 0.15,
  output: 0.7,
};

const RATIO_OPTIONS = [2, 4, 6, 10, 20] as const;

export interface CompressorNodePair {
  input: GainNode;
  output: GainNode;
  setParams: (p: Partial<ELCompressorParams>) => void;
  dispose: () => void;
}

/**
 * Create an EL8X Distressor-style compressor. Chain: input gain → DynamicsCompressor → output gain.
 */
export function createELCompressor(
  context: AudioContext,
  params: Partial<ELCompressorParams> = {}
): CompressorNodePair {
  const p = { ...DEFAULT_PARAMS, ...params };

  const inputGain = context.createGain();
  inputGain.gain.value = 0.2 + p.input * 1.8; // ~0.2 to 2

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = Math.max(-40, Math.min(0, p.threshold));
  compressor.knee.value = 6;
  compressor.ratio.value = Math.max(1, Math.min(20, p.ratio));
  compressor.attack.value = Math.max(0.001, Math.min(1, p.attack));
  compressor.release.value = Math.max(0.01, Math.min(2, p.release));

  const outputGain = context.createGain();
  outputGain.gain.value = 0.3 + p.output * 1.7; // ~0.3 to 2

  inputGain.connect(compressor);
  compressor.connect(outputGain);

  function setParams(newP: Partial<ELCompressorParams>): void {
    if (newP.input !== undefined) {
      inputGain.gain.value = 0.2 + Math.max(0, Math.min(1, newP.input)) * 1.8;
    }
    if (newP.threshold !== undefined) {
      compressor.threshold.value = Math.max(-40, Math.min(0, newP.threshold));
    }
    if (newP.ratio !== undefined) {
      compressor.ratio.value = Math.max(1, Math.min(20, newP.ratio));
    }
    if (newP.attack !== undefined) {
      compressor.attack.value = Math.max(0.001, Math.min(1, newP.attack));
    }
    if (newP.release !== undefined) {
      compressor.release.value = Math.max(0.01, Math.min(2, newP.release));
    }
    if (newP.output !== undefined) {
      outputGain.gain.value = 0.3 + Math.max(0, Math.min(1, newP.output)) * 1.7;
    }
  }

  function dispose(): void {
    inputGain.disconnect();
    compressor.disconnect();
  }

  return { input: inputGain, output: outputGain, setParams, dispose };
}

export { DEFAULT_PARAMS as EL_COMPRESSOR_DEFAULT_PARAMS, RATIO_OPTIONS as EL_COMPRESSOR_RATIO_OPTIONS };
