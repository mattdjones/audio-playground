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
    "The tools are inspired by real techniques from music history: tape loops and overlapping repeats used by artists like Brian Eno and Robert Fripp, classic studio reverb and effects units such as the Lexicon 224, and the kind of filter sweeps and production tricks that defined dance and electronic music in the 1990s. More demos will be added over time.";

  content.append(p1, p2);
  main.append(title, content);
}
