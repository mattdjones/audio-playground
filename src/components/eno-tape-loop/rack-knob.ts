/**
 * Rack-style potentiometer (knob) control for recording-desk look.
 * Drag to rotate; value maps to a 270° sweep from top clockwise.
 */

export interface RackKnobOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  title?: string;
}

/** Map value [min, max] to rotation in degrees (0 = top, 270 = max). */
function valueToRotation(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const t = (value - min) / (max - min);
  return Math.max(0, Math.min(270, t * 270));
}

export interface RackKnobResult {
  element: HTMLElement;
  setValue: (value: number) => void;
}

export function createRackKnob(options: RackKnobOptions): RackKnobResult {
  const { label, min, max, step, value, onChange, title } = options;

  const block = document.createElement("div");
  block.className = "rack-control-block rack-knob-block";

  const labelEl = document.createElement("span");
  labelEl.className = "rack-label";
  labelEl.textContent = label;

  const knobEl = document.createElement("div");
  knobEl.className = "rack-knob";
  knobEl.title = title ?? `${label} ${min}–${max}`;
  knobEl.setAttribute("role", "slider");
  knobEl.setAttribute("aria-valuemin", String(min));
  knobEl.setAttribute("aria-valuemax", String(max));
  knobEl.setAttribute("aria-valuenow", String(value));
  knobEl.setAttribute("aria-label", title ?? label);

  const face = document.createElement("div");
  face.className = "rack-knob-face";
  const indicator = document.createElement("div");
  indicator.className = "rack-knob-indicator";
  face.appendChild(indicator);
  knobEl.appendChild(face);

  block.append(labelEl, knobEl);

  let currentValue = Math.max(min, Math.min(max, value));

  const setValue = (v: number): void => {
    currentValue = Math.max(min, Math.min(max, v));
    const rot = valueToRotation(currentValue, min, max);
    indicator.style.transform = `rotate(${rot}deg)`;
    knobEl.setAttribute("aria-valuenow", String(currentValue));
  };

  setValue(currentValue);

  let isDragging = false;
  let startY = 0;
  let startValue = 0;

  const handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    isDragging = true;
    startY = e.clientY;
    startValue = currentValue;
    (knobEl as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent): void => {
    if (!isDragging) return;
    const dy = e.clientY - startY;
    const sensitivity = (max - min) / 150;
    let newVal = startValue - dy * sensitivity;
    if (step > 0) {
      newVal = Math.round(newVal / step) * step;
    }
    newVal = Math.max(min, Math.min(max, newVal));
    if (newVal !== currentValue) {
      currentValue = newVal;
      setValue(currentValue);
      onChange(currentValue);
    }
  };

  const handlePointerUp = (e: PointerEvent): void => {
    if (!isDragging) return;
    isDragging = false;
    (knobEl as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  knobEl.addEventListener("pointerdown", handlePointerDown as EventListener);
  document.addEventListener("pointermove", handlePointerMove as EventListener);
  document.addEventListener("pointerup", handlePointerUp as EventListener);
  document.addEventListener("pointercancel", handlePointerUp as EventListener);

  return {
    element: block,
    setValue,
  };
}
