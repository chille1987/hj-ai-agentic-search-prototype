(function () {
  "use strict";

  const els = {
    hero: document.getElementById("hero"),
    form: document.getElementById("search-form"),
    input: document.getElementById("search-input"),
    suggestions: document.getElementById("suggestions"),
    agentRoot: document.getElementById("agent-root")
  };

  let turnCount = 0;
  let isBusy = false;
  const initialTitle = document.title;

  async function ask(query, opts = {}) {
    if (isBusy || !query.trim()) return;
    isBusy = true;
    els.input.value = "";
    els.hero.classList.add("is-compact");

    document.title = `${query} — OutlearnTest Knowledge Base`;

    const turnEl = appendTurn(query);
    turnEl.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const response = await window.mockSearch(query, { responseId: opts.responseId });

      /* Mirror the query (and resolved response id) in the URL so the
         result is shareable. fromHistory means we're replaying a
         popstate or hydration — don't push a new history entry. */
      if (!opts.fromHistory) {
        const url = new URL(window.location.href);
        url.searchParams.set("q", query);
        if (response.id) url.searchParams.set("r", response.id);
        else url.searchParams.delete("r");
        history.pushState({ q: query, r: response.id || null }, "", url);
      } else if (response.id) {
        const url = new URL(window.location.href);
        if (url.searchParams.get("r") !== response.id) {
          url.searchParams.set("r", response.id);
          history.replaceState({ q: query, r: response.id }, "", url);
        }
      }

      await runPlan(turnEl, response.plan);
      mountAnswerScaffolding(turnEl, response);
      await streamAnswer(turnEl, response.answer);
      mountFollowups(turnEl, response.followups);
    } catch (err) {
      console.error(err);
      turnEl.querySelector(".kb-card").innerHTML =
        `<p style="color:#b91c1c">Something went wrong: ${err.message}</p>`;
    } finally {
      isBusy = false;
      els.input.focus();
    }
  }

  function resetToIdle() {
    els.agentRoot.innerHTML = "";
    els.hero.classList.remove("is-compact");
    turnCount = 0;
    document.title = initialTitle;
  }

  function appendTurn(query) {
    turnCount += 1;
    const turn = document.createElement("article");
    turn.className = "kb-turn";
    turn.dataset.turnId = String(turnCount);
    turn.innerHTML = `
      <header class="kb-turn__question">
        <div class="kb-turn__qicon" aria-hidden="true">Q</div>
        <h2 class="kb-turn__qtext">${escapeHtml(query)}</h2>
      </header>
      <div class="kb-turn__body">
        <section class="kb-card" aria-label="Agent response">
          <div class="kb-card__header">
            <svg class="kb-sparkle-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 2 L13.8 9.2 L21 11 L13.8 12.8 L12 20 L10.2 12.8 L3 11 L10.2 9.2 Z" fill="currentColor"/>
              <path d="M19 3 L19.7 5.3 L22 6 L19.7 6.7 L19 9 L18.3 6.7 L16 6 L18.3 5.3 Z" fill="currentColor" opacity="0.6"/>
            </svg>
            <span class="kb-card__title">Agent</span>
            <span class="kb-pulse" aria-hidden="true"></span>
          </div>
          <div class="kb-plan" role="list"></div>
        </section>
        <aside class="kb-sources-rail" hidden></aside>
      </div>
    `;
    els.agentRoot.appendChild(turn);
    return turn;
  }

  async function runPlan(turnEl, planSteps) {
    const planEl = turnEl.querySelector(".kb-plan");

    for (let i = 0; i < planSteps.length; i++) {
      const step = planSteps[i];

      const stepEl = document.createElement("div");
      stepEl.className = "kb-plan__step is-running";
      stepEl.style.animationDelay = "0s";
      stepEl.innerHTML = `
        <span class="kb-plan__tick" aria-hidden="true"></span>
        <div>
          <div class="kb-plan__label">${escapeHtml(step.label)}…</div>
          ${step.matchedTitles ? `<div class="kb-plan__chips"></div>` : ""}
        </div>
      `;
      planEl.appendChild(stepEl);

      if (step.matchedTitles && step.matchedTitles.length) {
        const chipsEl = stepEl.querySelector(".kb-plan__chips");
        const slice = Math.max(120, Math.floor(step.duration / (step.matchedTitles.length + 1)));
        step.matchedTitles.forEach((t, idx) => {
          setTimeout(() => {
            const chip = document.createElement("span");
            chip.className = "kb-plan__chip";
            chip.style.animationDelay = "0s";
            chip.textContent = t;
            chipsEl.appendChild(chip);
          }, slice * (idx + 1));
        });
      }

      await sleep(step.duration);

      stepEl.classList.remove("is-running");
      stepEl.classList.add("is-done");
    }

    turnEl.querySelector(".kb-pulse")?.classList.add("is-done");
  }

  function mountAnswerScaffolding(turnEl, response) {
    const card = turnEl.querySelector(".kb-card");

    if (response.confident === false) {
      const banner = document.createElement("div");
      banner.className = "kb-confidence";
      banner.textContent = "No confident match in the knowledge base — showing the closest articles.";
      card.appendChild(banner);
    }

    const answer = document.createElement("div");
    answer.className = "kb-answer is-streaming";
    card.appendChild(answer);
    /* Bind once on the container, not per token — see wireCitations. */
    wireCitations(turnEl, answer);

    const rail = turnEl.querySelector(".kb-sources-rail");
    rail.hidden = false;
    rail.innerHTML = `
      <div class="kb-sources">
        <div class="kb-sources__title">Sources</div>
        ${response.sources.map((s, i) => `
          <a class="kb-source" data-source-num="${i + 1}" href="${s.url}" target="_blank" rel="noopener">
            <div class="kb-source__row">
              <div class="kb-source__num">${i + 1}</div>
              <div class="kb-source__title">${escapeHtml(s.title)}</div>
            </div>
            <div class="kb-source__cat">${escapeHtml(s.category)}</div>
            <p class="kb-source__excerpt">${escapeHtml(s.excerpt)}</p>
            <span class="kb-source__open">Open article →</span>
          </a>
        `).join("")}
      </div>
    `;
  }

  /* Re-rendering the whole markdown per token was costing 50ms+ on long
     answers (~15 fps). Throttle the innerHTML write while still
     receiving tokens at full speed - the stream stays smooth at 60 fps. */
  const RENDER_MS = 60;
  async function streamAnswer(turnEl, markdown) {
    const answerEl = turnEl.querySelector(".kb-answer");
    const tokens = tokenize(markdown);

    let acc = "";
    let lastRender = 0;
    for (let i = 0; i < tokens.length; i++) {
      acc += tokens[i];
      const now = performance.now();
      const isLast = i === tokens.length - 1;
      if (isLast || now - lastRender >= RENDER_MS) {
        answerEl.innerHTML = window.renderMarkdown(acc);
        lastRender = now;
      }
      await sleep(jitter(14, 30));
    }
    answerEl.classList.remove("is-streaming");
  }

  function tokenize(s) {
    /* Keep whitespace runs as their own tokens so paragraph breaks
       re-render at natural boundaries. */
    return s.match(/\s+|\S+/g) || [s];
  }

  /* Event delegation — one handler per answer container catches every
     .cite element including ones that stream in later. */
  function wireCitations(turnEl, root) {
    if (root.dataset.citesBound) return;
    root.dataset.citesBound = "1";

    function handle(c) {
      const n = c.dataset.cite;
      const target = turnEl.querySelector(`.kb-source[data-source-num="${n}"]`);
      if (!target) return;
      target.classList.add("is-highlighted");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => target.classList.remove("is-highlighted"), 1600);
    }

    root.addEventListener("click", (e) => {
      const c = e.target.closest(".cite");
      if (!c) return;
      e.preventDefault();
      handle(c);
    });
    root.addEventListener("keydown", (e) => {
      const c = e.target.closest(".cite");
      if (!c) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handle(c); }
    });
  }

  function mountFollowups(turnEl, followups) {
    if (!followups || !followups.length) return;
    const card = turnEl.querySelector(".kb-card");
    const wrap = document.createElement("div");
    wrap.className = "kb-followups";
    wrap.innerHTML = `
      <div class="kb-followups__label">Ask a follow-up</div>
      <ul class="kb-followups__list">
        ${followups.map(f => `<li><button class="kb-followups__chip" type="button">${escapeHtml(f)}</button></li>`).join("")}
      </ul>
    `;
    card.appendChild(wrap);

    wrap.querySelectorAll(".kb-followups__chip").forEach(btn => {
      btn.addEventListener("click", () => ask(btn.textContent.trim()));
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function jitter(a, b) { return a + Math.random() * (b - a); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  /* Optional chaining on the homepage-only nodes so this file is also
     safe to load on category/article pages. */
  els.form?.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(els.input.value);
  });

  els.suggestions?.addEventListener("click", (e) => {
    const btn = e.target.closest(".outlearn-hero__tag");
    if (!btn) return;
    /* innerText (not textContent) so the inline SVG icon's whitespace
       doesn't contaminate the label. */
    const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
    ask(label);
  });

  (function wireFaq() {
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
  })();

  (function wireTocDock() {
    const dock = document.getElementById("tocDock");
    if (!dock) return;
    const targets = dock.querySelectorAll("[data-toc-target]");
    if (!targets.length) return;

    /* sectionId → [tick, link] — one entry shared by the rail tick and
       the card link so .is-active can be flipped on both at once. */
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
        /* Headings are in document order, so the last one above the
           threshold is the current section. */
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
  })();

  /* Any element with data-ask-ai opens the spotlight (when present) and
     runs the agent on its value — used by the in-article Ask AI panel
     and the FAQ Ask AI buttons. */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ask-ai]");
    if (!btn) return;
    e.preventDefault();
    const q = btn.dataset.askAi;
    if (!q) return;
    if (openSpotlight) openSpotlight();
    const input = document.getElementById("search-input");
    if (input) input.value = q;
    ask(q);
  });

  (function wireBackToTop() {
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
  })();

  (function wireSidebar() {
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
      /* Defer the hidden attribute until the fade-out completes. */
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
        /* A match on the group name itself shows the whole group. */
        const labelText = group.querySelector(".outlearn-nav-group__name")?.textContent.trim().toLowerCase() || "";
        if (q && labelText.includes(q)) {
          links.forEach(l => l.classList.remove("is-hidden"));
          groupHasMatch = true;
        }
        group.classList.toggle("is-hidden", !groupHasMatch);
        /* Force-open groups while filtering so the matches are visible. */
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

    /* Desktop collapse handle. The hamburger is mobile-only; this is
       the only desktop trigger. State persists across reloads. */
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
  })();

  /* The spotlight modal reuses the canonical search IDs (#hero,
     #search-form, #search-input, #suggestions, #agent-root) so the
     existing ask() flow targets it without changes on inner pages. */
  let openSpotlight = null;
  let closeSpotlight = null;

  (function wireSpotlight() {
    const spotlight = document.getElementById("spotlight");
    if (!spotlight) return;

    const trigger = document.getElementById("searchTrigger");
    const closeBtn = document.getElementById("spotlightClose");
    const input = document.getElementById("search-input");
    let lastFocus = null;
    const DEBOUNCE_MS = 500;
    let debounceTimer = null;
    let lastQuery = "";

    openSpotlight = function () {
      if (spotlight.classList.contains("is-open")) return;
      lastFocus = document.activeElement;
      spotlight.hidden = false;
      /* Next frame so the transition animates from the hidden state. */
      requestAnimationFrame(() => spotlight.classList.add("is-open"));
      document.body.classList.add("is-spotlight-open");
      setTimeout(() => input?.focus(), 80);
    };
    closeSpotlight = function () {
      if (!spotlight.classList.contains("is-open")) return;
      spotlight.classList.remove("is-open");
      document.body.classList.remove("is-spotlight-open");
      clearTimeout(debounceTimer);
      setTimeout(() => { spotlight.hidden = true; }, 220);
      /* Never restore focus to an INPUT: the homepage hero input's
         focus handler would immediately reopen the spotlight. */
      if (lastFocus && lastFocus.tagName !== "INPUT") lastFocus.focus?.();
    };

    trigger?.addEventListener("click", openSpotlight);
    closeBtn?.addEventListener("click", closeSpotlight);
    spotlight.addEventListener("click", (e) => {
      if (e.target.closest("[data-spotlight-close]")) closeSpotlight();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && spotlight.classList.contains("is-open")) {
        e.preventDefault();
        closeSpotlight();
      }
    });

    async function fire(q) {
      const trimmed = q.trim();
      if (!trimmed || trimmed === lastQuery) return;
      lastQuery = trimmed;
      await ask(trimmed);
      /* Catch typing that happened while ask() was running. */
      const current = input?.value.trim() || "";
      if (current && current !== lastQuery) fire(current);
    }

    input?.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const value = input.value;
      if (!value.trim()) return;
      debounceTimer = setTimeout(() => fire(value), DEBOUNCE_MS);
    });
  })();

  /* The homepage hero search bar is a styled trigger only — every
     interaction opens the spotlight and runs the query there. */
  (function wireHeroTrigger() {
    if (!openSpotlight) return;
    const heroForm = document.getElementById("hero-search-form");
    const heroInput = document.getElementById("hero-search-input");
    const heroSuggestions = document.getElementById("hero-suggestions");
    if (!heroForm) return;

    function runInSpotlight(query) {
      openSpotlight();
      const q = (query || "").trim();
      if (!q) return;
      const spotlightInput = document.getElementById("search-input");
      if (spotlightInput) spotlightInput.value = q;
      ask(q);
    }

    /* preventDefault on mousedown stops focus from settling here. */
    heroInput?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openSpotlight();
    });
    /* Keyboard tab still lands focus here — defer to next tick so we
       can blur + open without fighting the same-frame focus event. */
    heroInput?.addEventListener("focus", () => {
      setTimeout(() => {
        heroInput.blur();
        openSpotlight();
      }, 0);
    });

    heroForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = heroInput?.value || "";
      runInSpotlight(q);
      if (heroInput) heroInput.value = "";
    });

    heroSuggestions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".outlearn-hero__tag");
      if (!btn) return;
      const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
      runInSpotlight(label);
    });
  })();

  document.addEventListener("keydown", (e) => {
    const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (inField || e.target?.isContentEditable) return;
    if (e.key === "/" || (e.metaKey && e.key === "k")) {
      if (!els.input) return;
      e.preventDefault();
      if (openSpotlight) {
        openSpotlight();
      } else {
        els.hero?.classList.remove("is-compact");
        els.input.focus();
      }
    }
  });

  window.addEventListener("popstate", () => {
    if (isBusy) return;
    const params = new URL(window.location.href).searchParams;
    const q = params.get("q");
    const r = params.get("r");
    resetToIdle();
    if (q) {
      openSpotlight?.();
      ask(q, { fromHistory: true, responseId: r || undefined });
    } else {
      closeSpotlight?.();
    }
  });

  function hydrateFromUrl() {
    if (!els.form) return;
    const params = new URL(window.location.href).searchParams;
    const q = params.get("q");
    const r = params.get("r");
    if (q) {
      openSpotlight?.();
      ask(q, { fromHistory: true, responseId: r || undefined });
    }
  }

  hydrateFromUrl();
})();
