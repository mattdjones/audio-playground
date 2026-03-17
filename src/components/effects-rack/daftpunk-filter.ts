/**
 * Daft Punk filter – low-pass that sweeps from muffled to crystal clear.
 * One control (open 0–1) maps to cutoff frequency; real-time sweep like 90s dance.
 */

export interface DaftPunkFilterParams {
  /** 0 = muffled (low cutoff), 1 = crystal clear (high cutoff). */
  open: number;
}

const DEFAULT_PARAMS: DaftPunkFilterParams = {
  open: 0.7,
};

/** Map open [0, 1] to cutoff in Hz. Low open = dark/muffled, high open = bright/clear. */
const CUTOFF_MIN = 150;
const CUTOFF_MAX = 18000;

function openToCutoff(open: number): number {
  const t = Math.max(0, Math.min(1, open));
  return CUTOFF_MIN + t * t * (CUTOFF_MAX - CUTOFF_MIN);
}

export interface FilterNodePair {
  input: GainNode;
  output: GainNode;
  setParams: (p: Partial<DaftPunkFilterParams>) => void;
  dispose: () => void;
}

/**
 * Create a Daft Punk-style low-pass filter. Single control sweeps cutoff in real time.
 */
export function createDaftPunkFilter(
  context: AudioContext,
  params: Partial<DaftPunkFilterParams> = {}
): FilterNodePair {
  const p = { ...DEFAULT_PARAMS, ...params };
  const input = context.createGain();
  input.gain.value = 1;

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = openToCutoff(p.open);
  filter.Q.value = 1.2;

  const output = context.createGain();
  output.gain.value = 1;

  input.connect(filter);
  filter.connect(output);

  function setParams(newP: Partial<DaftPunkFilterParams>): void {
    if (newP.open !== undefined) {
      filter.frequency.value = openToCutoff(Math.max(0, Math.min(1, newP.open)));
    }
  }

  function dispose(): void {
    input.disconnect();
    filter.disconnect();
  }

  return { input, output, setParams, dispose };
}

export { DEFAULT_PARAMS as DAFTPUNK_FILTER_DEFAULT_PARAMS };
