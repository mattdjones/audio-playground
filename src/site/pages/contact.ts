/**
 * Contact page content.
 */
export function renderContact(main: HTMLElement): void {
  const title = document.createElement("h1");
  title.className = "site__page-title";
  title.textContent = "Contact";

  const content = document.createElement("div");
  content.className = "site__page-content";

  const p = document.createElement("p");
  p.textContent =
    "To get in touch, add your preferred contact details or link here. For now this is a placeholder.";

  content.appendChild(p);
  main.append(title, content);
}
