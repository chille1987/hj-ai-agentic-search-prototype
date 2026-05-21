/*
 * app.js — UI controller for the OutlearnTest agent prototype.
 *
 * Drives:
 *   1. Idle state (hero + suggestion chips + categories).
 *   2. Planning animation per turn (steps tick in sequentially).
 *   3. Token-streamed markdown answer with [n] citations.
 *   4. Source rail + follow-up chips.
 *   5. Multi-turn transcript (each new question appends a turn).
 *
 * Backend swap: replace window.mockSearch() in mock-data.js.
 */

(function () {
  "use strict";

  const els = {
    hero:        document.getElementById("hero"),
    form:        document.getElementById("search-form"),
    input:       document.getElementById("search-input"),
    suggestions: document.getElementById("suggestions"),
    agentRoot:   document.getElementById("agent-root")
  };

  let turnCount = 0;
  let isBusy    = false;
  /* Snapshot the original title so we can restore it after a search */
  const initialTitle = document.title;

  /* ── Public-ish: handle a question ─────────────────────────────── */
  async function ask(query, opts = {}) {
    if (isBusy || !query.trim()) return;
    isBusy = true;
    els.input.value = "";
    els.hero.classList.add("is-compact");

    document.title = `${query} — OutlearnTest Knowledge Base`;

    const turnEl = appendTurn(query);
    turnEl.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      /* If we're hydrating from a URL that pins a specific response id,
         pass it to mockSearch so the answer matches the permalink. */
      const response = await window.mockSearch(query, { responseId: opts.responseId });

      /* Reflect both question and response id in the URL so the link is a
         true permalink. opts.fromHistory means we're replaying a popstate
         or initial load — don't push a new entry. */
      if (!opts.fromHistory) {
        const url = new URL(window.location.href);
        url.searchParams.set("q", query);
        if (response.id) url.searchParams.set("r", response.id);
        else             url.searchParams.delete("r");
        history.pushState({ q: query, r: response.id || null }, "", url);
      } else if (response.id) {
        /* Hydration path: stamp the resolved response id into the URL
           without creating a new history entry (in case the URL had ?q
           only — now it becomes a stable permalink). */
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

  /* Reset the page to idle (used when navigating back to the bare URL) */
  function resetToIdle() {
    els.agentRoot.innerHTML = "";
    els.hero.classList.remove("is-compact");
    turnCount = 0;
    document.title = initialTitle;
  }

  /* ── Build the markup for one turn ─────────────────────────────── */
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

  /* ── Run plan steps with staggered animation ───────────────────── */
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

      /* Reveal chips one by one while the step is "running" */
      if (step.matchedTitles && step.matchedTitles.length) {
        const chipsEl = stepEl.querySelector(".kb-plan__chips");
        const slice   = Math.max(120, Math.floor(step.duration / (step.matchedTitles.length + 1)));
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

    /* Plan done — flip the pulse to "done" */
    const pulse = turnEl.querySelector(".kb-pulse");
    if (pulse) pulse.classList.add("is-done");
  }

  /* ── Mount answer + sources scaffolding (empty, to be streamed) ── */
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
    /* Bind citation handling ONCE per answer — see wireCitations.
       Doing it here (rather than per token in streamAnswer) keeps the
       streaming loop cheap. */
    wireCitations(turnEl, answer);

    /* Sources rail (right column) */
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

  /* ── Stream the markdown answer chunk by chunk ───────────────────
   * Tokens still arrive at ~50/sec so the stream feels live, but we
   * throttle the actual innerHTML re-render to once every RENDER_MS.
   * A full markdown-to-HTML re-parse on every token was costing 50ms+
   * each on long answers (frame rate dropped to ~15 fps). Throttling
   * keeps the main thread free and brings streaming back to 60 fps. */
  const RENDER_MS = 60;
  async function streamAnswer(turnEl, markdown) {
    const answerEl = turnEl.querySelector(".kb-answer");
    const tokens   = tokenize(markdown);

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

  /* Lightweight tokenizer — splits on word boundaries to look like an LLM stream */
  function tokenize(s) {
    /* Keep newlines as their own tokens so paragraph re-renders feel natural */
    return s.match(/\s+|\S+/g) || [s];
  }

  /* ── Citation click → highlight + scroll the source card ─────────
   * Event delegation: one click + keydown handler on the answer
   * container catches all .cite interactions, including ones added
   * later when more markdown streams in. Previously we re-scanned and
   * re-bound on every token; that was a noticeable chunk of the
   * streaming cost. */
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

  /* ── Follow-up chips ──────────────────────────────────────────── */
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

  /* ── Utils ─────────────────────────────────────────────────────── */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function jitter(a, b) { return a + Math.random() * (b - a); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  /* ── Event wiring ──────────────────────────────────────────────── */
  /* The agent flow only exists on the homepage. Guard each listener so
     this file is safe to load on the category page too. */
  els.form?.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(els.input.value);
  });

  els.suggestions?.addEventListener("click", (e) => {
    const btn = e.target.closest(".outlearn-hero__tag");
    if (!btn) return;
    /* The chip contains an SVG icon plus a label — strip the SVG before
       reading textContent so we don't pick up whitespace artifacts. */
    const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
    ask(label);
  });

  /* ── FAQ accordion + dot-nav ──────────────────────────────────────
   * One card open at a time. Clicking a dot opens the matching card;
   * clicking a card header opens that card. Active dot/card stay in sync.
   * Ask AI buttons inside cards fire the agent flow via data-ask-ai. */
  (function wireFaq() {
    const faq = document.getElementById("faq");
    if (!faq) return;

    const dots  = [...faq.querySelectorAll(".outlearn-faq__dot-item")];
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

    dots.forEach((d, i)  => d.addEventListener("click", () => setActive(i)));
    cards.forEach((c, i) => {
      const header = c.querySelector(".outlearn-faq-card__header");
      header?.addEventListener("click", () => setActive(i));
    });

    /* Ask AI buttons → run the agent on the question */
    faq.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ask-ai]");
      if (!btn) return;
      e.preventDefault();
      const q = btn.dataset.askAi;
      if (q) ask(q);
    });
  })();

  /* ── Back-to-top button ───────────────────────────────────────────
   * Visible once the user has scrolled past the hero. The ring fills
   * proportionally to how far down the page they are. Click smooths
   * back to the top. */
  (function wireBackToTop() {
    const btn  = document.getElementById("backToTop");
    const ring = document.getElementById("backToTopRing");
    if (!btn || !ring) return;

    const CIRC = 119.381;                 /* 2πr at r=19 */
    ring.style.strokeDasharray = String(CIRC);

    let ticking = false;
    function update() {
      ticking = false;
      const doc    = document.documentElement;
      const max    = (doc.scrollHeight - window.innerHeight) || 1;
      const y      = window.scrollY || doc.scrollTop;
      const pct    = Math.min(1, Math.max(0, y / max));
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

  /* ── Sidebar drawer ──────────────────────────────────────────────
   * Opens from the hamburger; closes via overlay click, close-btn,
   * or Escape. Locks body scroll while open, restores focus to the
   * trigger on close. Filter input live-hides non-matching links and
   * group labels. Group labels collapse/expand their nav lists. */
  (function wireSidebar() {
    const sidebar       = document.getElementById("sidebar");
    const overlay       = document.getElementById("sidebarOverlay");
    const openBtn       = document.getElementById("menuBtn");
    const closeBtn      = document.getElementById("sidebarClose");
    const filterInput   = document.getElementById("sidebarFilter");
    const filterClear   = document.getElementById("sidebarFilterClear");
    const filterEmpty   = document.getElementById("sidebarFilterEmpty");
    const nav           = document.getElementById("sidebarNav");
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
      /* Focus the filter input shortly after the transition starts */
      setTimeout(() => filterInput?.focus(), 80);
    }
    function close() {
      sidebar.classList.remove("is-open");
      overlay.classList.remove("is-open");
      sidebar.setAttribute("aria-hidden", "true");
      openBtn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("is-sidebar-open");
      /* Hide overlay from AT once the fade-out finishes */
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

    /* Auto-close on link click — feels right whether you've navigated
       to an anchor on the same page or you're heading somewhere else. */
    nav?.addEventListener("click", (e) => {
      const link = e.target.closest(".outlearn-nav-link");
      if (link) close();
    });

    /* Group collapse / expand */
    nav?.addEventListener("click", (e) => {
      const label = e.target.closest("[data-group-toggle]");
      if (!label) return;
      const group = label.closest(".outlearn-nav-group");
      if (!group) return;
      const willOpen = !group.classList.contains("is-open");
      group.classList.toggle("is-open", willOpen);
      label.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    /* Live filter */
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
        /* Also match group label itself */
        const labelText = group.querySelector(".outlearn-nav-group__name")?.textContent.trim().toLowerCase() || "";
        if (q && labelText.includes(q)) {
          links.forEach(l => l.classList.remove("is-hidden"));
          groupHasMatch = true;
        }
        group.classList.toggle("is-hidden", !groupHasMatch);
        /* Force-open groups while filtering so matches are visible */
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

    /* Category page: grid ↔ list view toggle. Guarded so it's a no-op
       on pages without the toggle. State persists in localStorage. */
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
          try { localStorage.setItem(VIEW_KEY, btn.dataset.view); } catch (_) {}
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

    /* Desktop collapse handle — toggles the persistent sidebar. The
       handle is the only desktop trigger; the hamburger is mobile-only.
       We persist the collapsed state so it survives reloads. */
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
      try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch (_) {}
    });
  })();

  /* ── Spotlight overlay ──────────────────────────────────────────
   * On inner pages (category, article) the search form lives inside a
   * modal that opens from a header trigger pill. The modal contains the
   * same #hero / #search-form / #search-input / #suggestions /
   * #agent-root nodes as the homepage hero, so the existing ask() flow
   * wires up to them automatically — no other glue needed. */
  let openSpotlight = null;
  let closeSpotlight = null;

  (function wireSpotlight() {
    const spotlight = document.getElementById("spotlight");
    if (!spotlight) return;                /* no spotlight on this page */

    const trigger  = document.getElementById("searchTrigger");
    const closeBtn = document.getElementById("spotlightClose");
    const input    = document.getElementById("search-input");
    let lastFocus  = null;

    openSpotlight = function () {
      if (spotlight.classList.contains("is-open")) return;
      lastFocus = document.activeElement;
      spotlight.hidden = false;
      /* next frame so the transition animates from the hidden state */
      requestAnimationFrame(() => spotlight.classList.add("is-open"));
      document.body.classList.add("is-spotlight-open");
      setTimeout(() => input?.focus(), 80);
    };
    closeSpotlight = function () {
      if (!spotlight.classList.contains("is-open")) return;
      spotlight.classList.remove("is-open");
      document.body.classList.remove("is-spotlight-open");
      /* Cancel any pending debounced search */
      clearTimeout(debounceTimer);
      /* Hide from AT once the fade-out finishes */
      setTimeout(() => { spotlight.hidden = true; }, 220);
      /* Restore focus to whatever triggered the open — but never to an
         input, since the homepage hero input's focus handler would
         immediately reopen the spotlight. */
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

    /* Debounced auto-search: 500ms after the user stops typing, fire
       ask(). Enter still submits immediately via the form handler. If a
       search is already running, defer until it finishes — then if the
       query has changed in the meantime, run the latest. */
    const DEBOUNCE_MS = 500;
    let debounceTimer = null;
    let lastQuery = "";

    async function fire(q) {
      const trimmed = q.trim();
      if (!trimmed || trimmed === lastQuery) return;
      lastQuery = trimmed;
      await ask(trimmed);
      /* If the user kept typing while we were busy, run the latest */
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

  /* ── Hero search → spotlight bridge (homepage) ───────────────────
   * The homepage keeps its visible hero search area, but the area is
   * just a styled trigger: clicking, focusing, submitting, or hitting
   * a suggestion chip opens the spotlight and runs the agent flow in
   * there. The hero never actually receives a value or focus. */
  (function wireHeroTrigger() {
    if (!openSpotlight) return;            /* no spotlight available */
    const heroForm        = document.getElementById("hero-search-form");
    const heroInput       = document.getElementById("hero-search-input");
    const heroSuggestions = document.getElementById("hero-suggestions");
    if (!heroForm) return;                 /* not on the homepage */

    function runInSpotlight(query) {
      openSpotlight();
      const q = (query || "").trim();
      if (!q) return;
      const spotlightInput = document.getElementById("search-input");
      if (spotlightInput) spotlightInput.value = q;
      /* Fire ask() directly — no debounce, the user already chose. */
      ask(q);
    }

    /* Mouse path: prevent focus from settling on the hero input. */
    heroInput?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openSpotlight();
    });
    /* Keyboard path: tab lands focus here, defer to next tick to break
       any same-frame focus loop, then blur + open. */
    heroInput?.addEventListener("focus", () => {
      setTimeout(() => {
        heroInput.blur();
        openSpotlight();
      }, 0);
    });

    /* Enter on the hero form forwards whatever value the user typed. */
    heroForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = heroInput?.value || "";
      runInSpotlight(q);
      if (heroInput) heroInput.value = "";
    });

    /* Suggestion chips run that suggestion in the spotlight. */
    heroSuggestions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".outlearn-hero__tag");
      if (!btn) return;
      const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
      runInSpotlight(label);
    });
  })();

  /* Slash to focus / ⌘K. Open the spotlight if one exists; otherwise
     focus the inline hero input on the homepage. Ignored when typing. */
  document.addEventListener("keydown", (e) => {
    const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (inField || e.target?.isContentEditable) return;
    if (e.key === "/" || (e.metaKey && e.key === "k")) {
      if (!els.input) return;             /* no search on this page */
      e.preventDefault();
      if (openSpotlight) {
        openSpotlight();
      } else {
        els.hero?.classList.remove("is-compact");
        els.input.focus();
      }
    }
  });

  /* ── URL ↔ state sync ──────────────────────────────────────────── */

  /* Back/forward: rewind the transcript to whatever ?q=/?r= says.
     We rebuild from scratch each time — simple, no stale state.        */
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

  /* Initial render: if the URL already has ?q=, replay it on load. On
     inner pages this also opens the spotlight so the result is visible. */
  function hydrateFromUrl() {
    if (!els.form) return;                /* no search on this page */
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
