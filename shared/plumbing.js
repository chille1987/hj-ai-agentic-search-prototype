/* Non-agent UI plumbing shared across every version: sidebar drawer,
   FAQ tabs, article TOC dock, back-to-top ring. Call initPlumbing()
   after the chrome partials have been injected so the IDs exist. */
(function () {
  "use strict";

  function wireSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const openBtn = document.getElementById("menuBtn");
    const closeBtn = document.getElementById("sidebarClose");
    const filterInput = document.getElementById("sidebarFilter");
    const filterClear = document.getElementById("sidebarFilterClear");
    const filterEmpty = document.getElementById("sidebarFilterEmpty");
    const nav = document.getElementById("sidebarNav");
    if (!sidebar || !overlay || !openBtn) return;

    let lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      sidebar.classList.add("is-open");
      overlay.classList.add("is-open");
      overlay.hidden = false;
      sidebar.setAttribute("aria-hidden", "false");
      openBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("is-sidebar-open");
      setTimeout(() => filterInput?.focus(), 80);
    }
    function close() {
      sidebar.classList.remove("is-open");
      overlay.classList.remove("is-open");
      sidebar.setAttribute("aria-hidden", "true");
      openBtn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("is-sidebar-open");
      setTimeout(() => { overlay.hidden = true; }, 260);
      lastFocus?.focus?.();
    }

    openBtn.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("is-open")) {
        e.preventDefault();
        close();
      }
    });

    nav?.addEventListener("click", (e) => {
      if (e.target.closest(".outlearn-nav-link")) close();
    });

    nav?.addEventListener("click", (e) => {
      const label = e.target.closest("[data-group-toggle]");
      if (!label) return;
      const group = label.closest(".outlearn-nav-group");
      if (!group) return;
      const willOpen = !group.classList.contains("is-open");
      group.classList.toggle("is-open", willOpen);
      label.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    function applyFilter() {
      const q = (filterInput.value || "").trim().toLowerCase();
      filterClear.hidden = !q;
      let anyMatch = false;
      nav.querySelectorAll(".outlearn-nav-group").forEach(group => {
        const links = group.querySelectorAll(".outlearn-nav-link");
        let groupHasMatch = false;
        links.forEach(link => {
          const text = link.textContent.trim().toLowerCase();
          const hit = !q || text.includes(q);
          link.classList.toggle("is-hidden", !hit);
          if (hit) groupHasMatch = true;
        });
        const labelText = group.querySelector(".outlearn-nav-group__name")?.textContent.trim().toLowerCase() || "";
        if (q && labelText.includes(q)) {
          links.forEach(l => l.classList.remove("is-hidden"));
          groupHasMatch = true;
        }
        group.classList.toggle("is-hidden", !groupHasMatch);
        if (q && groupHasMatch) group.classList.add("is-open");
        if (groupHasMatch) anyMatch = true;
      });
      filterEmpty.hidden = !q || anyMatch;
    }
    filterInput?.addEventListener("input", applyFilter);
    filterClear?.addEventListener("click", () => {
      filterInput.value = "";
      applyFilter();
      filterInput.focus();
    });

    /* Category view toggle (grid/list) — only on category pages. */
    (function wireCategoryView() {
      const grid = document.getElementById("articlesGrid");
      const buttons = document.querySelectorAll(".kb-view-toggle__btn[data-view]");
      if (!grid || !buttons.length) return;

      const VIEW_KEY = "outlearn-articles-view";
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "grid" || saved === "list") applyView(saved);

      buttons.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          applyView(btn.dataset.view);
          try { localStorage.setItem(VIEW_KEY, btn.dataset.view); } catch (_) { }
        });
      });

      function applyView(view) {
        grid.dataset.view = view;
        buttons.forEach(b => {
          const on = b.dataset.view === view;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
    })();

    /* Desktop collapse handle. State persists across reloads. */
    const handle = document.getElementById("sidebarHandle");
    const STORAGE_KEY = "outlearn-sidebar-collapsed";
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      document.body.classList.add("is-sidebar-collapsed");
      handle?.setAttribute("aria-expanded", "false");
      handle?.setAttribute("aria-label", "Expand sidebar");
    }
    handle?.addEventListener("click", () => {
      const collapsed = document.body.classList.toggle("is-sidebar-collapsed");
      handle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      handle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
      try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch (_) { }
    });
  }

  function wireFaq() {
    const faq = document.getElementById("faq");
    if (!faq) return;

    const dots = [...faq.querySelectorAll(".outlearn-faq__dot-item")];
    const cards = [...faq.querySelectorAll(".outlearn-faq-card")];

    function setActive(idx) {
      dots.forEach((d, i) => {
        const on = i === idx;
        d.classList.toggle("is-active", on);
        d.setAttribute("aria-selected", on ? "true" : "false");
      });
      cards.forEach((c, i) => {
        const on = i === idx;
        c.classList.toggle("is-active", on);
        const header = c.querySelector(".outlearn-faq-card__header");
        if (header) header.setAttribute("aria-expanded", on ? "true" : "false");
      });
    }

    dots.forEach((d, i) => d.addEventListener("click", () => setActive(i)));
    cards.forEach((c, i) => {
      const header = c.querySelector(".outlearn-faq-card__header");
      header?.addEventListener("click", () => setActive(i));
    });
  }

  function wireTocDock() {
    const dock = document.getElementById("tocDock");
    if (!dock) return;
    const targets = dock.querySelectorAll("[data-toc-target]");
    if (!targets.length) return;

    const buckets = {};
    targets.forEach(el => {
      const id = el.dataset.tocTarget;
      (buckets[id] = buckets[id] || []).push(el);
    });
    const headings = Object.keys(buckets)
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if (!headings.length) return;

    function setActive(id) {
      Object.entries(buckets).forEach(([k, els]) => {
        els.forEach(el => el.classList.toggle("is-active", k === id));
      });
    }

    const ACTIVE_OFFSET = 140;
    let ticking = false;
    function update() {
      ticking = false;
      let activeId = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= ACTIVE_OFFSET) activeId = h.id;
        else break;
      }
      setActive(activeId || headings[0].id);
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener("resize", () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    });
    update();
  }

  function wireBackToTop() {
    const btn = document.getElementById("backToTop");
    const ring = document.getElementById("backToTopRing");
    if (!btn || !ring) return;

    const CIRC = 119.381;
    ring.style.strokeDasharray = String(CIRC);

    let ticking = false;
    function update() {
      ticking = false;
      const doc = document.documentElement;
      const max = (doc.scrollHeight - window.innerHeight) || 1;
      const y = window.scrollY || doc.scrollTop;
      const pct = Math.min(1, Math.max(0, y / max));
      btn.classList.toggle("is-visible", y > 400);
      ring.style.strokeDashoffset = String(CIRC * (1 - pct));
    }
    function onScroll() {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  window.initPlumbing = function () {
    wireSidebar();
    wireFaq();
    wireTocDock();
    wireBackToTop();
  };
})();
