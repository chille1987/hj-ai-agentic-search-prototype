/* v2 agent UX stub: no spotlight modal — the hero search submits and
   streams the answer inline, on the same page. Header search trigger
   scrolls back to the hero (or navigates to the homepage when there
   isn't one). This is intentionally minimal; the real v2 UX is the
   next experiment. */
(function () {
  "use strict";

  let isBusy = false;

  async function ask(query) {
    if (isBusy || !query.trim()) return;
    const mount = document.getElementById("agent-inline");
    if (!mount) return;
    isBusy = true;

    const turn = document.createElement("article");
    turn.className = "kb-turn";
    turn.innerHTML = `
      <header class="kb-turn__question">
        <div class="kb-turn__qicon" aria-hidden="true">Q</div>
        <h2 class="kb-turn__qtext"></h2>
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
          <div class="kb-answer is-streaming"></div>
        </section>
      </div>
    `;
    turn.querySelector(".kb-turn__qtext").textContent = query;
    mount.prepend(turn);
    turn.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const response = await window.mockSearch(query);
      const answerEl = turn.querySelector(".kb-answer");
      answerEl.innerHTML = window.renderMarkdown(response.answer);
      answerEl.classList.remove("is-streaming");
      turn.querySelector(".kb-pulse")?.classList.add("is-done");
    } catch (err) {
      console.error(err);
      turn.querySelector(".kb-card").innerHTML =
        `<p style="color:#b91c1c">Something went wrong: ${err.message}</p>`;
    } finally {
      isBusy = false;
    }
  }

  function wireHero() {
    const form = document.getElementById("hero-search-form");
    const input = document.getElementById("hero-search-input");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      ask((input?.value || "").trim());
      if (input) input.value = "";
    });

    const tags = document.getElementById("hero-suggestions");
    tags?.addEventListener("click", (e) => {
      const btn = e.target.closest(".outlearn-hero__tag");
      if (!btn) return;
      const label = (btn.innerText || btn.textContent).replace(/\s+/g, " ").trim();
      ask(label);
    });
  }

  function wireHeaderTrigger() {
    const trigger = document.getElementById("searchTrigger");
    if (!trigger) return;
    trigger.addEventListener("click", () => {
      const heroInput = document.getElementById("hero-search-input");
      if (heroInput) {
        heroInput.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => heroInput.focus(), 350);
      } else {
        /* No hero on this page — bounce back to the homepage. */
        window.location.href = "index.html";
      }
    });
  }

  function wireAskAiButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ask-ai]");
      if (!btn) return;
      e.preventDefault();
      const q = btn.dataset.askAi;
      if (!q) return;
      const heroInput = document.getElementById("hero-search-input");
      if (heroInput) {
        heroInput.scrollIntoView({ behavior: "smooth", block: "start" });
        ask(q);
      } else {
        window.location.href = `index.html?q=${encodeURIComponent(q)}`;
      }
    });
  }

  function hydrateFromUrl() {
    const params = new URL(window.location.href).searchParams;
    const q = params.get("q");
    if (q) ask(q);
  }

  window.initAgent = function () {
    wireHero();
    wireHeaderTrigger();
    wireAskAiButtons();
    hydrateFromUrl();
  };
})();
