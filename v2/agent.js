/* v2 agent UX: spotlight modal with two tabs — "Search" (live
   keyword search against window.mockKbSearch) and "Ask AI" (the v1
   agentic flow). Tabs share the input. The active tab persists in
   sessionStorage so reloads remember the user's last mode. */
(function () {
  "use strict";

  const TAB_KEY = "outlearn-v2-tab";
  const DEFAULT_TAB = "ask";

  const SPOTLIGHT_HTML = `
    <div class="kb-spotlight" id="spotlight" data-active-tab="${DEFAULT_TAB}" hidden role="presentation">
      <div class="kb-spotlight__backdrop" data-spotlight-close></div>
      <div class="kb-spotlight__panel" role="dialog" aria-modal="true" aria-label="Search the knowledge base">
        <button class="kb-spotlight__close" id="spotlightClose" type="button" aria-label="Close search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <section class="kb-spotlight__hero" id="hero">
          <div class="kb-spotlight__tabs" role="tablist" aria-label="Search mode">
            <button class="kb-spotlight__tab" type="button" role="tab" data-tab="search" aria-selected="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              Search
            </button>
            <button class="kb-spotlight__tab" type="button" role="tab" data-tab="ask" aria-selected="true">
              <svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
                <g fill="currentColor">
                  <path d="M5.658,2.99l-1.263-.421-.421-1.263c-.137-.408-.812-.408-.949,0l-.421,1.263-1.263,.421c-.204,.068-.342,.259-.342,.474s.138,.406,.342,.474l1.263,.421,.421,1.263c.068,.204,.26,.342,.475,.342s.406-.138,.475-.342l.421-1.263,1.263-.421c.204-.068,.342-.259.342-.474s-.138-.406-.342-.474Z"/>
                  <polygon points="9.5 2.75 11.412 7.587 16.25 9.5 11.412 11.413 9.5 16.25 7.587 11.413 2.75 9.5 7.587 7.587 9.5 2.75"
                    fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
                </g>
              </svg>
              Ask AI
            </button>
          </div>
          <form class="kb-spotlight__form" id="search-form" role="search" autocomplete="off">
            <svg class="kb-spotlight__form-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input id="search-input" name="q" type="search" class="kb-spotlight__input"
              placeholder="Ask anything about Outlearn…" aria-label="Search the knowledge base"
              autocomplete="off" spellcheck="false">
          </form>
          <div class="kb-spotlight__suggestions" id="suggestions" data-mode="ask" role="list" aria-label="Suggested questions">
            <button type="button" class="outlearn-hero__tag" role="listitem">How do I deploy my agent?</button>
            <button type="button" class="outlearn-hero__tag" role="listitem">What are knowledge sources?</button>
            <button type="button" class="outlearn-hero__tag" role="listitem">How do I get started?</button>
          </div>
        </section>
        <section class="kb-spotlight__transcript" id="agent-root" data-mode="ask" aria-live="polite" aria-label="Agent answers"></section>
        <section class="kb-spotlight__results" id="kb-results" data-mode="search" aria-live="polite" aria-label="Search results"></section>
      </div>
    </div>
  `;

  const initialTitle = document.title;
  let els = null;
  let openSpotlight = null;
  let closeSpotlight = null;
  let activeTab = DEFAULT_TAB;
  let turnCount = 0;
  let isBusy = false;

  /* ── Ask AI flow (mirrors v1) ──────────────────────────────────── */

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
    els.results.innerHTML = "";
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

  function tokenize(s) { return s.match(/\s+|\S+/g) || [s]; }

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

  /* ── Keyword search flow (Search tab) ──────────────────────────── */

  function renderSearchResults(query) {
    const matches = window.mockKbSearch(query);
    if (!query.trim()) {
      els.results.innerHTML = "";
      return;
    }
    if (!matches.length) {
      els.results.innerHTML = `
        <div class="kb-results__empty">
          <p>No articles match "${escapeHtml(query)}".</p>
          <p>Try the <button type="button" class="kb-results__switch" data-go-ask>Ask AI</button> tab — it can synthesize an answer when keywords don't find anything.</p>
        </div>
      `;
      return;
    }
    els.results.innerHTML = `
      <div class="kb-results__meta">${matches.length} article${matches.length === 1 ? "" : "s"} matching <strong>"${escapeHtml(query)}"</strong></div>
      <div class="kb-results__list">
        ${matches.map(s => `
          <a class="kb-source" href="${s.url}">
            <div class="kb-source__row">
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

  /* ── Tab management ────────────────────────────────────────────── */

  function setActiveTab(tab) {
    if (tab !== "search" && tab !== "ask") return;
    activeTab = tab;
    const spotlight = document.getElementById("spotlight");
    spotlight.dataset.activeTab = tab;
    spotlight.querySelectorAll(".kb-spotlight__tab").forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (els.input) {
      els.input.placeholder = tab === "search"
        ? "Search articles…"
        : "Ask anything about Outlearn…";
    }
    try { sessionStorage.setItem(TAB_KEY, tab); } catch (_) {}
    /* If we have a value already, re-render for the new tab. */
    if (tab === "search" && els.input?.value.trim()) {
      renderSearchResults(els.input.value);
    }
  }

  function wireTabs() {
    const spotlight = document.getElementById("spotlight");
    spotlight.querySelectorAll(".kb-spotlight__tab").forEach(btn => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
    /* Empty-state button inside Search can hop to Ask AI. */
    els.results.addEventListener("click", (e) => {
      if (e.target.closest("[data-go-ask]")) {
        setActiveTab("ask");
        if (els.input?.value.trim()) ask(els.input.value);
      }
    });
  }

  /* ── Spotlight open/close ──────────────────────────────────────── */

  function wireSpotlight() {
    const spotlight = document.getElementById("spotlight");
    if (!spotlight) return;

    const trigger = document.getElementById("searchTrigger");
    const closeBtn = document.getElementById("spotlightClose");
    const input = document.getElementById("search-input");
    let lastFocus = null;
    let searchTimer = null;
    const SEARCH_DEBOUNCE_MS = 220;

    openSpotlight = function () {
      if (spotlight.classList.contains("is-open")) return;
      lastFocus = document.activeElement;
      spotlight.hidden = false;
      void spotlight.offsetWidth;
      spotlight.classList.add("is-open");
      document.body.classList.add("is-spotlight-open");
      setTimeout(() => input?.focus(), 120);
    };
    closeSpotlight = function () {
      if (!spotlight.classList.contains("is-open")) return;
      spotlight.classList.remove("is-open");
      document.body.classList.remove("is-spotlight-open");
      clearTimeout(searchTimer);
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

    /* Submit (Enter): in Ask AI tab, run the agent. In Search tab,
       Enter is a no-op — results update live as the user types. */
    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (activeTab === "ask") ask(els.input.value);
    });

    /* Debounced input — only takes effect in Search tab. */
    input?.addEventListener("input", () => {
      if (activeTab !== "search") return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSearchResults(input.value), SEARCH_DEBOUNCE_MS);
    });

    /* Suggestion chips always trigger Ask AI — they're example questions,
       so we flip the tab if needed and ask. */
    els.suggestions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".outlearn-hero__tag");
      if (!btn) return;
      const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
      setActiveTab("ask");
      ask(label);
    });
  }

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
      if (activeTab === "search") renderSearchResults(q);
      else ask(q);
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
      setActiveTab("ask");
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
        setActiveTab("ask");
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
      setActiveTab("ask");
      ask(q, { fromHistory: true, responseId: r || undefined });
    }
  }

  window.initAgent = function () {
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
      results: document.getElementById("kb-results")
    };

    /* Restore last-used tab. */
    let saved = DEFAULT_TAB;
    try { saved = sessionStorage.getItem(TAB_KEY) || DEFAULT_TAB; } catch (_) {}
    setActiveTab(saved);

    wireTabs();
    wireSpotlight();
    wireHeroTrigger();
    wireAskAiButtons();
    wireHotkeys();
    wireHistory();
    hydrateFromUrl();
  };
})();
