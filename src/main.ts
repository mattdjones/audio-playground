/**
 * Site entry: layout, routing, and page rendering.
 * Re-exports mount from eno-tape-loop for embedding on other sites.
 */

import { createLayout, pathnameToPageId, DEMO_ITEMS } from "./site/layout";
import { renderHome } from "./site/pages/home";
import { renderAbout } from "./site/pages/about";
import { renderContact } from "./site/pages/contact";
import { renderEnoTapeLoopDemo } from "./site/pages/demos/eno-tape-loop";
import { renderEffectsRackDemo } from "./site/pages/demos/effects-rack";
import "./site/site.css";

export { mount } from "./components/eno-tape-loop";

function run(): void {
  const appEl = document.getElementById("app");
  if (!appEl) return;

  const pathname = window.location.pathname;
  const pageId = pathnameToPageId(pathname);
  const { root, main } = createLayout(pageId);

  switch (pageId) {
    case "home":
      renderHome(main, DEMO_ITEMS);
      break;
    case "about":
      renderAbout(main);
      break;
    case "contact":
      renderContact(main);
      break;
    case "demos/eno-tape-loop":
      renderEnoTapeLoopDemo(main);
      break;
    case "demos/effects-rack":
      renderEffectsRackDemo(main);
      break;
    default:
      main.innerHTML = "<p class=\"site__page-content\">Page not found.</p>";
  }

  appEl.innerHTML = "";
  appEl.appendChild(root);
}

if (typeof document !== "undefined") {
  run();
}
