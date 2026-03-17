/**
 * Site layout: nav + main content area.
 * Caller fills the main area with page content.
 */

export type PageId = "home" | "about" | "contact" | "demos/eno-tape-loop" | "demos/effects-rack";

export interface NavItem {
  id: PageId;
  label: string;
  href: string;
}

/** Top-level nav: Home, About, Contact, and Demos (with submenu). */
export const NAV_TOP: NavItem[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "about", label: "About", href: "/about/" },
  { id: "contact", label: "Contact", href: "/contact/" },
];

/** Demo submenu items (under Demos). Used in nav dropdown and on home page. */
export const DEMO_ITEMS: NavItem[] = [
  { id: "demos/eno-tape-loop", label: "Eno Tape Loop", href: "/demos/eno-tape-loop/" },
  { id: "demos/effects-rack", label: "Effects Rack", href: "/demos/effects-rack/" },
];

/**
 * Normalise pathname to a page id, or null if unknown.
 */
export function pathnameToPageId(pathname: string): PageId | null {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/") return "home";
  if (normalized === "/about") return "about";
  if (normalized === "/contact") return "contact";
  if (normalized === "/demos/eno-tape-loop") return "demos/eno-tape-loop";
  if (normalized === "/demos/effects-rack") return "demos/effects-rack";
  return null;
}

/**
 * Create the site shell: nav + main content container.
 * Returns { root, main } so the app can append page content into main.
 */
export function createLayout(currentPageId: PageId | null): {
  root: HTMLElement;
  main: HTMLElement;
} {
  const root = document.createElement("div");
  root.className = "site";

  const nav = document.createElement("nav");
  nav.className = "site__nav";
  nav.setAttribute("aria-label", "Main");

  const navInner = document.createElement("div");
  navInner.className = "site__nav-inner";

  const logo = document.createElement("div");
  logo.className = "site__logo";
  const logoLink = document.createElement("a");
  logoLink.href = "/";
  logoLink.textContent = "Audio Playgrounds";
  logo.appendChild(logoLink);
  navInner.appendChild(logo);

  const menu = document.createElement("ul");
  menu.className = "site__menu";

  for (const item of NAV_TOP) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    if (item.id === currentPageId) {
      a.setAttribute("aria-current", "page");
    }
    li.appendChild(a);
    menu.appendChild(li);
  }

  const demosLi = document.createElement("li");
  demosLi.className = "site__menu-item site__menu-item--dropdown";
  const demosBtn = document.createElement("button");
  demosBtn.type = "button";
  demosBtn.className = "site__menu-trigger";
  demosBtn.textContent = "Demos";
  demosBtn.setAttribute("aria-expanded", "false");
  demosBtn.setAttribute("aria-haspopup", "true");
  const submenu = document.createElement("ul");
  submenu.id = "site-demos-submenu";
  submenu.className = "site__submenu";
  submenu.setAttribute("role", "menu");
  demosBtn.setAttribute("aria-controls", submenu.id);
  for (const item of DEMO_ITEMS) {
    const subLi = document.createElement("li");
    subLi.setAttribute("role", "none");
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    a.setAttribute("role", "menuitem");
    if (item.id === currentPageId) {
      a.setAttribute("aria-current", "page");
    }
    subLi.appendChild(a);
    submenu.appendChild(subLi);
  }
  demosLi.appendChild(demosBtn);
  demosLi.appendChild(submenu);

  demosBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = demosBtn.getAttribute("aria-expanded") === "true";
    demosBtn.setAttribute("aria-expanded", String(!open));
    submenu.classList.toggle("site__submenu--open", !open);
  });
  const closeDemos = (): void => {
    demosBtn.setAttribute("aria-expanded", "false");
    submenu.classList.remove("site__submenu--open");
  };
  demosBtn.addEventListener("blur", () => {
    const focusInside = demosLi.contains(document.activeElement);
    if (!focusInside) closeDemos();
  });
  submenu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDemos();
      (demosBtn as HTMLButtonElement).focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (submenu.classList.contains("site__submenu--open") && !demosLi.contains(e.target as Node)) {
      closeDemos();
    }
  });

  menu.appendChild(demosLi);
  navInner.appendChild(menu);
  nav.appendChild(navInner);
  root.appendChild(nav);

  const main = document.createElement("main");
  main.className = "site__main";
  main.setAttribute("role", "main");
  root.appendChild(main);

  return { root, main };
}
