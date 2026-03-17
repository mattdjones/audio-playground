/**
 * About page content.
 */
export function renderAbout(main: HTMLElement): void {
  const title = document.createElement("h1");
  title.className = "site__page-title";
  title.textContent = "About";

  const content = document.createElement("div");
  content.className = "site__page-content";

  const p1 = document.createElement("p");
  p1.textContent =
    "Audio Playgrounds is a set of small web apps for playing with sound in the browser. Each tool is self-contained and runs locally—your audio never leaves your device.";

  const p2 = document.createElement("p");
  p2.textContent =
    "The projects are inspired by ideas from generative music, tape loops, and experimental production. More demos will be added over time.";

  content.append(p1, p2);
  main.append(title, content);
}
