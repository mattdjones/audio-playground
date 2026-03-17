/**
 * Eno Tape Loop demo page: mounts the component into the main content area.
 */
import { mount } from "../../../components/eno-tape-loop";

export function renderEnoTapeLoopDemo(main: HTMLElement): () => void {
  const wrapper = document.createElement("div");
  wrapper.className = "site__demo";
  main.appendChild(wrapper);
  return mount(wrapper);
}
