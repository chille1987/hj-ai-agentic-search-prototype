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

  const $ = (sel, root = document) => root.querySelector(sel);

  const els = {
    hero:        $("#hero"),
    form:        $("#search-form"),
    input:       $("#search-input"),
    suggestions: $("#suggestions"),
    agentRoot:   $("#agent-root")
  };

  let turnCount = 0;
  let isBusy    = false;

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
    document.title = "OutlearnTest Knowledge Base — Ask AI";
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

  /* ── Stream the markdown answer chunk by chunk ─────────────────── */
  async function streamAnswer(turnEl, markdown) {
    const answerEl = turnEl.querySelector(".kb-answer");
    const tokens   = tokenize(markdown);

    let acc = "";
    for (const t of tokens) {
      acc += t;
      answerEl.innerHTML = window.renderMarkdown(acc);
      /* Re-attach citation handlers on each re-render */
      wireCitations(turnEl, answerEl);
      await sleep(jitter(14, 30));
    }
    answerEl.classList.remove("is-streaming");
  }

  /* Lightweight tokenizer — splits on word boundaries to look like an LLM stream */
  function tokenize(s) {
    /* Keep newlines as their own tokens so paragraph re-renders feel natural */
    return s.match(/\s+|\S+/g) || [s];
  }

  /* ── Citation click → highlight + scroll the source card ───────── */
  function wireCitations(turnEl, root) {
    root.querySelectorAll(".cite").forEach(c => {
      if (c.dataset.bound) return;
      c.dataset.bound = "1";
      c.addEventListener("click", (e) => {
        e.preventDefault();
        const n = c.dataset.cite;
        const target = turnEl.querySelector(`.kb-source[data-source-num="${n}"]`);
        if (!target) return;
        target.classList.add("is-highlighted");
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => target.classList.remove("is-highlighted"), 1600);
      });
      c.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); }
      });
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
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(els.input.value);
  });

  els.suggestions.addEventListener("click", (e) => {
    const btn = e.target.closest(".outlearn-hero__tag");
    if (!btn) return;
    /* The chip contains an SVG icon plus a label — strip the SVG before
       reading textContent so we don't pick up whitespace artifacts. */
    const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
    ask(label);
  });

  document.querySelectorAll("[data-focus-search]").forEach(b => {
    b.addEventListener("click", () => {
      els.hero.classList.remove("is-compact");
      els.hero.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => els.input.focus(), 250);
    });
  });

  /* ── FAQ accordion + dot-nav ──────────────────────────────────────
   * One card open at a time. Clicking a dot opens the matching card;
   * clicking a card header opens that card. Active dot/card stay in sync.
   * Ask AI buttons inside cards fire the agent flow via data-ask-ai. */
  (function wireFaq() {
    const faq = $("#faq");
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

  /* Slash to focus, like Helpjuice. Ignore when typing in any input. */
  document.addEventListener("keydown", (e) => {
    const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (inField || e.target?.isContentEditable) return;
    if (e.key === "/" || (e.metaKey && e.key === "k")) {
      e.preventDefault();
      els.hero.classList.remove("is-compact");
      els.input.focus();
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
    if (q) ask(q, { fromHistory: true, responseId: r || undefined });
  });

  /* Initial render: if the URL already has ?q=, replay it on load.     */
  function hydrateFromUrl() {
    const params = new URL(window.location.href).searchParams;
    const q = params.get("q");
    const r = params.get("r");
    if (q) ask(q, { fromHistory: true, responseId: r || undefined });
  }

  hydrateFromUrl();
})();
