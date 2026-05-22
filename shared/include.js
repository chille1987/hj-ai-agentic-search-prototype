/* Tiny <div data-include="path.html"> loader. Fetches each partial once,
   injects its HTML inline, then post-processes per-page state from
   data-active / data-no-search attributes on the slot. */
(function () {
  "use strict";

  const cache = new Map();

  async function fetchPartial(path) {
    if (!cache.has(path)) cache.set(path, fetch(path).then(r => r.text()));
    return cache.get(path);
  }

  function postProcess(host, slot) {
    /* Mark the active sidebar group. */
    const activeGroup = slot.dataset.active;
    if (activeGroup) {
      const group = host.querySelector(`[data-nav-group="${activeGroup}"]`);
      if (group) {
        group.classList.add("is-current");
        group.querySelector("[data-group-toggle]")?.setAttribute("aria-current", "page");
      }
    }
    /* Mark an active link inside that group. */
    const activeLink = slot.dataset.activeLink;
    if (activeLink) {
      const link = host.querySelector(`[data-nav-link="${activeLink}"]`);
      if (link) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    }
    /* Pages that own a hero search drop the header trigger. */
    if (slot.dataset.noSearch === "1") {
      host.querySelector("[data-chrome-search-trigger]")?.remove();
    }
  }

  async function includeOne(slot) {
    const path = slot.dataset.include;
    try {
      const html = await fetchPartial(path);
      /* <template> parses with the full HTML5 algorithm (no fragment-
         context quirks of innerHTML on a regular <div>). */
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      postProcess(tpl.content, slot);
      slot.replaceWith(tpl.content);
    } catch (err) {
      console.error(`[include] failed to inject ${path}:`, err);
      throw err;
    }
  }

  window.includeChrome = function () {
    const slots = [...document.querySelectorAll("[data-include]")];
    return Promise.all(slots.map(includeOne));
  };
})();
