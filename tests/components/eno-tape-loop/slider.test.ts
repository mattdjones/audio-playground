import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test: a volume-slider-like control must still respond after
 * a document-level mouseup (e.g. after the user releases the slider).
 * Ensures no global listener (e.g. waveform cleanup) interferes with
 * other controls.
 */
describe("slider-style control", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("invokes callback on every input event, including after a document mouseup", () => {
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "50";
    document.body.appendChild(slider);

    const onInput = vi.fn();
    slider.addEventListener("input", onInput);

    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onInput).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onInput).toHaveBeenCalledTimes(2);
  });
});
