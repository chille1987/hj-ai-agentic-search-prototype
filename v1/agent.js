/* ════════════════════════════════════════════════════════════════════════
 *  v1 — Spotlight modal: live KB search (as you type) + Ask AI (on Enter)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  ENTRY POINT
 *    window.initAgent()      — call once per page after the chrome
 *                              partials are injected (see shared/include.js).
 *
 *  BACKEND CONTRACT
 *    window.mockSearch(q, opts)   → Promise<AgentResponse>   (Ask AI)
 *    window.mockKbSearch(q)       → Promise<Article[]>       (live KB search)
 *    Both are defined in mock-data.js; swap their bodies for fetch() calls
 *    against the Rails endpoints to ship.
 *
 *  KEYBOARD CONTRACT (from anywhere on the page)
 *    ⌘K or "/"     open the spotlight
 *    Esc           close the spotlight
 *    ↵ in input    submit → Ask AI (mockSearch)
 *    type in input live KB search (mockKbSearch), debounced 300ms
 *    Tab / S-Tab   cycles focus inside the modal (focus trap)
 *
 *  STRUCTURE OF THIS FILE
 *    [1] Spotlight markup template & module state
 *    [2] Ask AI flow:  ask() → runPlan → mountAnswerSlot → streamAnswer
 *    [3] Citations & follow-ups
 *    [4] Spotlight wiring: open/close, focus trap, live KB search input
 *    [5] Page-level triggers: hero, [data-ask-ai], hotkeys, browser history
 *    [6] initAgent()
 *
 *  ACCESSIBILITY NOTES
 *    - The modal panel is the real dialog (role="dialog", aria-modal="true").
 *    - The streaming answer flips aria-busy true→false so screen readers
 *      announce the final markdown once, not every 60ms render tick.
 *    - prefers-reduced-motion shortens / removes the artificial delays
 *      (plan steps and stream jitter) and the CSS rule at the bottom of
 *      styles.css disables transitions.
 *
 *  PERF NOTES (live-fire incidents this code fixed; don't undo unless
 *  you've checked your replacement keeps these properties)
 *    - innerHTML on the answer is throttled to once per RENDER_MS, not per
 *      streamed token — full rewrite on every token cost ~15fps.
 *    - Citation click/keydown handlers use event delegation on the answer
 *      container (bound once), not per-chip.
 * ════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────────────
   * [1] Markup template + module state
   * ─────────────────────────────────────────────────────────────────── */

  const SPOTLIGHT_HTML = `
    <div class="kb-spotlight" id="spotlight" hidden role="presentation">
      <div class="kb-spotlight__backdrop" data-spotlight-close></div>
      <div class="kb-spotlight__panel" role="dialog" aria-modal="true" aria-label="Search articles or ask AI">
        <button class="kb-spotlight__close" id="spotlightClose" type="button" aria-label="Close search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <section class="kb-spotlight__hero" id="hero">
          <form class="kb-spotlight__form" id="search-form" role="search" autocomplete="off">
            <svg class="kb-spotlight__form-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input id="search-input" name="q" type="search" class="kb-spotlight__input"
              placeholder="Search articles…"
              aria-label="Search articles, or press Enter to ask AI"
              autocomplete="off" spellcheck="false">
            <button class="kb-spotlight__ask-btn" type="submit" aria-label="Ask AI">
              <kbd aria-hidden="true">↵</kbd>
              <span>Ask&nbsp;AI</span>
            </button>
          </form>
          <div class="kb-spotlight__live" id="live-articles" hidden></div>
          <div class="kb-spotlight__suggestions" id="suggestions" role="list" aria-label="Suggested questions">
            <button type="button" class="outlearn-hero__tag" role="listitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              How do I deploy my agent?
            </button>
            <button type="button" class="outlearn-hero__tag" role="listitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              What are knowledge sources?
            </button>
            <button type="button" class="outlearn-hero__tag" role="listitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              How do I get started?
            </button>
          </div>
        </section>
        <section class="kb-spotlight__transcript" id="agent-root" aria-live="polite" aria-label="Agent answers"></section>
      </div>
    </div>
  `;

  const initialTitle = document.title;
  let els = null;
  let openSpotlight = null;
  let closeSpotlight = null;
  let turnCount = 0;
  let isBusy = false;

  /* prefers-reduced-motion is honoured by skipping the artificial sleep
     ticks below; CSS handles transition suppression separately. */
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;


  /* ───────────────────────────────────────────────────────────────────
   * [2] Ask AI flow
   * ─────────────────────────────────────────────────────────────────── */

  async function ask(query, opts = {}) {
    if (isBusy || !query.trim()) return;
    isBusy = true;
    /* Keep the input + live KB results visible while the AI streams
       below them — they're part of the same "what am I looking at"
       context, not a chat input that needs clearing. */
    els.hero.classList.add("is-compact");

    document.title = `${query} — OutlearnTest Knowledge Base`;

    const turnEl = appendTurn(query);
    turnEl.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const response = await window.mockSearch(query, { responseId: opts.responseId });

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
      mountAnswerSlot(turnEl, response);
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
    clearLiveResults();
    els.hero.classList.remove("is-compact");
    turnCount = 0;
    document.title = initialTitle;
  }

  /* Filled in by wireSpotlight() once that closure exists; before init
     this is a no-op so resetToIdle() can be called safely either way. */
  let clearLiveResults = () => {};

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

      await sleep(reduceMotion ? 0 : step.duration);

      stepEl.classList.remove("is-running");
      stepEl.classList.add("is-done");
    }

    turnEl.querySelector(".kb-pulse")?.classList.add("is-done");
  }

  function mountAnswerSlot(turnEl, response) {
    const card = turnEl.querySelector(".kb-card");

    if (response.confident === false) {
      const banner = document.createElement("div");
      banner.className = "kb-confidence";
      banner.textContent = "No confident match in the knowledge base — showing the closest articles.";
      card.appendChild(banner);
    }

    /* Stash the source list on the turn so renderAnswerHTML can map
       a [N] citation to the cited article's URL — no on-page rail
       anymore (the live KB search at the top covers browsing). */
    turnEl._sources = response.sources || [];

    const answer = document.createElement("div");
    answer.className = "kb-answer is-streaming";
    card.appendChild(answer);
  }

  /* Throttled to ~16fps for re-render; tokens still consumed at full
     speed. Re-rendering the whole markdown per token cost ~50ms.
     aria-busy is set while streaming so SR doesn't announce every tick. */
  const RENDER_MS = 60;
  async function streamAnswer(turnEl, markdown) {
    const answerEl = turnEl.querySelector(".kb-answer");
    answerEl.setAttribute("aria-busy", "true");
    const sources = turnEl._sources || [];

    if (reduceMotion) {
      answerEl.innerHTML = renderAnswerHTML(markdown, sources);
    } else {
      const tokens = tokenize(markdown);
      let acc = "";
      let lastRender = 0;
      for (let i = 0; i < tokens.length; i++) {
        acc += tokens[i];
        const now = performance.now();
        const isLast = i === tokens.length - 1;
        if (isLast || now - lastRender >= RENDER_MS) {
          answerEl.innerHTML = renderAnswerHTML(acc, sources);
          lastRender = now;
        }
        await sleep(jitter(14, 30));
      }
    }
    answerEl.classList.remove("is-streaming");
    answerEl.setAttribute("aria-busy", "false");
  }

  function tokenize(s) {
    return s.match(/\s+|\S+/g) || [s];
  }


  /* ───────────────────────────────────────────────────────────────────
   * [3] Citations & follow-ups
   * ─────────────────────────────────────────────────────────────────── */

  /* Rewrite the <sup class="cite" data-cite="N">N</sup> chips that
     window.renderMarkdown produces into inline "view source" links
     with an external-link icon. The href points at the cited article
     so native middle-click / right-click "open in new tab" both work
     — no JS click handler needed. */
  const CITE_RE = /<sup class="cite"[^>]*data-cite="(\d+)"[^>]*>\d+<\/sup>/g;
  const CITE_ICON =
    '<svg class="cite__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
    '<polyline points="15 3 21 3 21 9"/>' +
    '<line x1="10" x2="21" y1="14" y2="3"/>' +
    '</svg>';
  function renderAnswerHTML(md, sources) {
    return window.renderMarkdown(md).replace(CITE_RE, (_, n) => {
      const idx = parseInt(n, 10) - 1;
      const src = sources[idx];
      if (!src) return "";
      const title = escapeHtml(src.title || `Source ${n}`);
      return `<a class="cite cite--inline" href="${src.url}" target="_blank" rel="noopener" aria-label="View source: ${title}">${CITE_ICON}view&nbsp;source</a>`;
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

  /* Return all visible, focusable elements inside `root`, in tab order. */
  function focusables(root) {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
  }


  /* ───────────────────────────────────────────────────────────────────
   * [4] Spotlight: open/close, focus trap, live KB search input
   * ─────────────────────────────────────────────────────────────────── */

  function wireSpotlight() {
    const spotlight = document.getElementById("spotlight");
    if (!spotlight) return;

    const trigger = document.getElementById("searchTrigger");
    const closeBtn = document.getElementById("spotlightClose");
    const input = document.getElementById("search-input");
    let lastFocus = null;

    openSpotlight = function () {
      if (spotlight.classList.contains("is-open")) return;
      lastFocus = document.activeElement;
      spotlight.hidden = false;
      /* Force a layout pass so the browser commits the initial
         (hidden) styles before is-open switches them — without this,
         the very first open occasionally snaps in without animating. */
      void spotlight.offsetWidth;
      spotlight.classList.add("is-open");
      document.body.classList.add("is-spotlight-open");
      setTimeout(() => input?.focus(), 120);
    };
    closeSpotlight = function () {
      if (!spotlight.classList.contains("is-open")) return;
      spotlight.classList.remove("is-open");
      document.body.classList.remove("is-spotlight-open");
      /* Reset content after the fade-out so the user doesn't see the
         transcript vanish mid-animation. Match the .kb-spotlight
         opacity transition (0.24s). */
      setTimeout(() => {
        spotlight.hidden = true;
        resetToIdle();
      }, 260);
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

    /* Focus trap: Tab / Shift+Tab inside the open modal cycles
       between the first and last focusable elements of the panel
       so keyboard focus can't escape behind the backdrop. */
    spotlight.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      if (!spotlight.classList.contains("is-open")) return;
      const panel = spotlight.querySelector(".kb-spotlight__panel");
      const arr = focusables(panel);
      if (!arr.length) return;
      const first = arr[0];
      const last = arr[arr.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    });

    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      ask(els.input.value);
    });

    els.suggestions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".outlearn-hero__tag");
      if (!btn) return;
      const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
      ask(label);
    });

    /* Live KB search: typing (debounced 300ms) calls mockKbSearch and
       renders matches into #live-articles. Enter (form submit, above)
       triggers AI synthesis instead. liveRevision rejects stale
       responses so a slow request can't overwrite a newer one. */
    const LIVE_DEBOUNCE_MS = 300;
    let liveTimer = null;
    let liveRevision = 0;
    input?.addEventListener("input", () => {
      clearTimeout(liveTimer);
      const value = input.value;
      if (!value.trim()) {
        renderLiveArticles("", ++liveRevision);
        return;
      }
      liveTimer = setTimeout(() => renderLiveArticles(value, ++liveRevision), LIVE_DEBOUNCE_MS);
    });

    /* Expose so resetToIdle() (defined outside this closure) can wipe
       the live results without knowing about liveRevision. */
    clearLiveResults = () => renderLiveArticles("", ++liveRevision);

    async function renderLiveArticles(query, rev) {
      if (!els.live) return;
      const q = (query || "").trim();
      if (!q) {
        els.live.hidden = true;
        els.live.innerHTML = "";
        spotlight.classList.remove("is-typing");
        return;
      }
      spotlight.classList.add("is-typing");
      const matches = window.mockKbSearch ? await window.mockKbSearch(q) : [];
      /* Stale response — a newer query has already fired. */
      if (rev !== liveRevision) return;
      els.live.hidden = false;
      if (!matches.length) {
        els.live.innerHTML = `
          <div class="kb-live__header">Search results (0)</div>
          <div class="kb-live__empty">
            No articles match "<strong>${escapeHtml(q)}</strong>". Press <kbd>↵</kbd> to ask AI instead.
          </div>
        `;
        return;
      }
      els.live.innerHTML = `
        <div class="kb-live__header">Search results (${matches.length})</div>
        <ul class="kb-live__list" aria-label="Matching articles">
          ${matches.map(a => `
            <li>
              <a class="kb-live__item" href="${a.url}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" aria-hidden="true" class="kb-live__icon">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span class="kb-live__title">${escapeHtml(a.title)}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" aria-hidden="true" class="kb-live__chev">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </a>
            </li>
          `).join("")}
        </ul>
      `;
    }
  }


  /* ───────────────────────────────────────────────────────────────────
   * [5] Page-level triggers: hero, [data-ask-ai], hotkeys, history
   * ─────────────────────────────────────────────────────────────────── */

  function wireHeroTrigger() {
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

    heroInput?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openSpotlight();
    });
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
  }

  function wireAskAiButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ask-ai]");
      if (!btn) return;
      e.preventDefault();
      const q = btn.dataset.askAi;
      if (!q) return;
      openSpotlight?.();
      const input = document.getElementById("search-input");
      if (input) input.value = q;
      ask(q);
    });
  }

  function wireHotkeys() {
    document.addEventListener("keydown", (e) => {
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (inField || e.target?.isContentEditable) return;
      if (e.key === "/" || (e.metaKey && e.key === "k")) {
        if (!els.input) return;
        e.preventDefault();
        openSpotlight?.();
      }
    });
  }

  function wireHistory() {
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
  }

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

  /* ───────────────────────────────────────────────────────────────────
   * [6] Public entry point
   * ─────────────────────────────────────────────────────────────────── */

  window.initAgent = function () {
    /* Append the spotlight modal once per page. */
    if (!document.getElementById("spotlight")) {
      const host = document.createElement("div");
      host.innerHTML = SPOTLIGHT_HTML.trim();
      document.body.appendChild(host.firstChild);
    }

    els = {
      hero: document.getElementById("hero"),
      form: document.getElementById("search-form"),
      input: document.getElementById("search-input"),
      suggestions: document.getElementById("suggestions"),
      agentRoot: document.getElementById("agent-root"),
      live: document.getElementById("live-articles")
    };

    wireSpotlight();
    wireHeroTrigger();
    wireAskAiButtons();
    wireHotkeys();
    wireHistory();
    hydrateFromUrl();
  };
})();
