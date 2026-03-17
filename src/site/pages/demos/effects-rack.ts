/**
 * Effects Rack demo page: mounts the component into the main content area.
 */
import { mount } from "../../../components/effects-rack";

export function renderEffectsRackDemo(main: HTMLElement): () => void {
  const wrapper = document.createElement("div");
  wrapper.className = "site__demo";
  main.appendChild(wrapper);
  return mount(wrapper);
}
