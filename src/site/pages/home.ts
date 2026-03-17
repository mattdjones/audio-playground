import type { NavItem } from "../layout";

/**
 * Home page: intro + list of demo links (demos only, not About/Contact).
 */
export function renderHome(main: HTMLElement, demos: NavItem[]): void {
  const title = document.createElement("h1");
  title.className = "site__page-title";
  title.textContent = "Home";

  const content = document.createElement("div");
  content.className = "site__page-content";

  const intro = document.createElement("p");
  intro.textContent =
    "A collection of browser-based audio tools and experiments. Each demo runs in your browser using the Web Audio API—no uploads, no server processing.";

  const demosHeading = document.createElement("h2");
  demosHeading.style.fontSize = "1rem";
  demosHeading.style.fontWeight = "500";
  demosHeading.style.marginTop = "1.5rem";
  demosHeading.style.marginBottom = "0.5rem";
  demosHeading.textContent = "Demos";

  const list = document.createElement("ul");
  list.className = "site__demos-list";
  for (const item of demos) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    li.appendChild(a);
    list.appendChild(li);
  }

  content.append(intro, demosHeading, list);
  main.append(title, content);
}
