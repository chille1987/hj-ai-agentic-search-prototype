/* ════════════════════════════════════════════════════════════════════════
 *  mock-data.js  — Fake request/response transcript for the agent search.
 * ════════════════════════════════════════════════════════════════════════
 *
 *  HOW TO READ THIS FILE
 *  ─────────────────────
 *  Each block below is one **simulated request** to the future backend:
 *
 *      const questionN = "<the user's question>";
 *      const responseN = { ...what the backend should return... };
 *
 *  Think of (questionN, responseN) as a recorded request/response pair.
 *  You can copy any responseN object straight into your real /agent/ask
 *  endpoint and the front-end will render it correctly with no changes.
 *
 *  RESPONSE SHAPE  (this IS the API contract — backend must match it)
 *  ──────────────────────────────────────────────────────────────────
 *      {
 *        id:        string,            // stable response id (e.g. "response-1") — used for permalinks
 *        question:  string,            // echo of the user's question
 *        plan:      PlanStep[],        // planning steps the UI ticks through
 *        answer:    string,            // markdown body. Citations written as [1], [2], [3]
 *        sources:   Source[],          // sources[i-1] is the article behind citation [i]
 *        followups: string[],          // 3 suggested follow-up questions (chips)
 *        confident: boolean            // false => UI renders "couldn't find a confident answer"
 *      }
 *
 *      PlanStep = { label: string, duration: number_ms, matchedTitles?: string[] }
 *      Source   = { id, title, category, excerpt, url }
 *
 *  WIRING UP THE REAL BACKEND
 *  ──────────────────────────
 *  Replace ONLY the body of `window.mockSearch` at the bottom of this file
 *  with a `fetch("/agent/ask", …)` call. The UI doesn't care where the
 *  response comes from — only that it matches the shape above.
 * ════════════════════════════════════════════════════════════════════════ */



/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   FAKE REQUEST/RESPONSE PAIR #1 — "How do I deploy my agent?"         ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

const question1 = "How do I deploy my agent?";

const response1 = {
  id: "response-1",
  question: question1,
  confident: true,

  plan: [
    { label: "Understanding your question",                          duration: 550 },
    { label: 'Searching the knowledge base for "deploy agent"',      duration: 850,
      matchedTitles: ["Deploying Your Agent", "Production Checklist", "Rollback & Versioning"] },
    { label: "Reading 3 articles",                                   duration: 1100 },
    { label: "Synthesizing answer",                                  duration: 1300 }
  ],

  answer:
`Before you ship, make sure your agent is connected to the right knowledge sources and that its **staging** environment behaves the way you want [1].

## Steps

1. Open your agent and click **Promote to Production** in the top-right.
2. Walk through the **production checklist** — model, knowledge sources, actions, and rate limits all get verified for you [2].
3. Confirm the diff between the staging and production versions, then publish.

Once live, your production agent gets its own URL and API key. If something looks wrong after the cut-over, you can **roll back to any previous version** from the agent's history tab — no redeploy needed [3].`,

  sources: [
    { id: "kb-101", title: "Deploying Your Agent",  category: "Deploying Your Agent",
      excerpt: "Step-by-step on promoting an agent from staging to production.",
      url: "https://outlearntest.helpjuice.com/deploying/deploying-your-agent" },
    { id: "kb-102", title: "Production Checklist",  category: "Deploying Your Agent",
      excerpt: "What to verify before flipping the production switch.",
      url: "https://outlearntest.helpjuice.com/deploying/production-checklist" },
    { id: "kb-103", title: "Rollback & Versioning", category: "Deploying Your Agent",
      excerpt: "Roll back a bad deploy and pin to a known-good agent version.",
      url: "https://outlearntest.helpjuice.com/deploying/rollback" }
  ],

  followups: [
    "How do I roll back a bad deployment?",
    "Can I deploy the same agent to multiple environments?",
    "What metrics should I watch right after deploy?"
  ]
};


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   FAKE REQUEST/RESPONSE PAIR #2 — "What are knowledge sources?"       ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

const question2 = "What are knowledge sources?";

const response2 = {
  id: "response-2",
  question: question2,
  confident: true,

  plan: [
    { label: "Understanding your question",                              duration: 500 },
    { label: 'Searching the knowledge base for "knowledge sources"',     duration: 800,
      matchedTitles: ["What is a Knowledge Source?", "Connecting URLs", "Uploading Files"] },
    { label: "Reading 3 articles",                                       duration: 1000 },
    { label: "Synthesizing answer",                                      duration: 1200 }
  ],

  answer:
`A **knowledge source** is anything your agent is allowed to read from when answering a question [1]. Sources are the agent's grounding — without them, you're just talking to a base model.

OutlearnTest supports three flavors:

- **URLs** — point the agent at a website and we'll crawl it on a schedule [2].
- **Files** — upload PDFs, Markdown, Word docs, or plain text [3].
- **Live integrations** — Notion, Confluence, Google Drive, and Zendesk via the Marketplace.

Each source is versioned, so when you update a doc the agent picks it up on the next sync and old answers are re-evaluated.`,

  sources: [
    { id: "kb-201", title: "What is a Knowledge Source?", category: "Knowledge Sources",
      excerpt: "The data your agent reads from — docs, URLs, and files.",
      url: "https://outlearntest.helpjuice.com/knowledge-sources/overview" },
    { id: "kb-202", title: "Connecting URLs",             category: "Knowledge Sources",
      excerpt: "Crawl a website and keep it in sync with your KB.",
      url: "https://outlearntest.helpjuice.com/knowledge-sources/urls" },
    { id: "kb-203", title: "Uploading Files",             category: "Knowledge Sources",
      excerpt: "Bring PDFs, Markdown, and Word docs into your agent.",
      url: "https://outlearntest.helpjuice.com/knowledge-sources/files" }
  ],

  followups: [
    "How do I connect a website as a source?",
    "What file formats are supported?",
    "How often are knowledge sources re-indexed?"
  ]
};


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   FAKE REQUEST/RESPONSE PAIR #3 — "Getting started with agents"       ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

const question3 = "How do I get started with Helpjuice agents?";

const response3 = {
  id: "response-3",
  question: question3,
  confident: true,

  plan: [
    { label: "Understanding your question",                              duration: 500 },
    { label: 'Searching the knowledge base for "getting started"',       duration: 800,
      matchedTitles: ["Your First Agent", "Agent Concepts", "What is a Knowledge Source?"] },
    { label: "Reading 3 articles",                                       duration: 1000 },
    { label: "Synthesizing answer",                                      duration: 1250 }
  ],

  answer:
`Spinning up your first agent takes about five minutes [1].

## The 4-step quick start

1. **Create an agent.** Give it a name, pick a base model, and write a one-line description of what it should help with.
2. **Add a knowledge source.** Paste a URL or upload a PDF — your agent immediately has something real to read [3].
3. **Try it out.** Use the sandbox on the right side of the editor to ask a few questions and watch the agent reason.
4. **Ship it.** When you're happy, click **Promote to Production**.

If anything in the editor looks unfamiliar, the **Agent Concepts** doc explains models, sources, actions, and policies in one place [2].`,

  sources: [
    { id: "kb-301", title: "Your First Agent",            category: "Getting Started",
      excerpt: "Create, name, and ship an agent in under five minutes.",
      url: "https://outlearntest.helpjuice.com/getting-started/first-agent" },
    { id: "kb-302", title: "Agent Concepts",              category: "Getting Started",
      excerpt: "Models, knowledge sources, actions, and policies.",
      url: "https://outlearntest.helpjuice.com/getting-started/concepts" },
    { id: "kb-201", title: "What is a Knowledge Source?", category: "Knowledge Sources",
      excerpt: "The data your agent reads from — docs, URLs, and files.",
      url: "https://outlearntest.helpjuice.com/knowledge-sources/overview" }
  ],

  followups: [
    "What models can I choose from?",
    "How do I add a knowledge source?",
    "How is pricing calculated for agents?"
  ]
};


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   FAKE REQUEST/RESPONSE PAIR #4 — "What actions can my agent do?"     ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

const question4 = "What actions can my agent perform?";

const response4 = {
  id: "response-4",
  question: question4,
  confident: true,

  plan: [
    { label: "Understanding your question",                          duration: 500 },
    { label: 'Searching the knowledge base for "actions"',           duration: 800,
      matchedTitles: ["What Are Actions?", "Built-in Actions", "Custom Actions via HTTP"] },
    { label: "Reading 3 articles",                                   duration: 1100 },
    { label: "Synthesizing answer",                                  duration: 1200 }
  ],

  answer:
`Actions are what turn your agent from a chatbot into something that actually *does* work [1].

## Built-in actions

Out of the box, your agent can send Slack messages, draft Gmail replies, file Linear issues, create Zendesk tickets, and write into HubSpot — no code required [2].

## Custom actions

Anything else, you wire up yourself: expose an internal HTTP endpoint, describe its inputs/outputs in JSON Schema, and the agent learns to call it just like a built-in [3]. You can also gate actions behind approval policies so the agent has to ask a human before doing something destructive.`,

  sources: [
    { id: "kb-401", title: "What Are Actions?",          category: "Actions",
      excerpt: "Let your agent send emails, create tickets, and call APIs.",
      url: "https://outlearntest.helpjuice.com/actions/overview" },
    { id: "kb-402", title: "Built-in Actions",           category: "Actions",
      excerpt: "Slack, Gmail, Linear, Zendesk, and HubSpot out of the box.",
      url: "https://outlearntest.helpjuice.com/actions/built-in" },
    { id: "kb-403", title: "Custom Actions via HTTP",    category: "Actions",
      excerpt: "Expose any internal endpoint as an action.",
      url: "https://outlearntest.helpjuice.com/actions/custom" }
  ],

  followups: [
    "How do I add a custom action?",
    "Can I require approval before an action runs?",
    "Which integrations are available by default?"
  ]
};


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   FAKE REQUEST/RESPONSE PAIR #5 — "Make my agent more accurate"       ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

const question5 = "How do I make my agent more accurate?";

const response5 = {
  id: "response-5",
  question: question5,
  confident: true,

  plan: [
    { label: "Understanding your question",                          duration: 550 },
    { label: 'Searching the knowledge base for "agent accuracy"',    duration: 900,
      matchedTitles: ["Improving Agent Accuracy", "Evaluations & Feedback", "What is a Knowledge Source?"] },
    { label: "Reading 3 articles",                                   duration: 1100 },
    { label: "Synthesizing answer",                                  duration: 1350 }
  ],

  answer:
`Accuracy in OutlearnTest is mostly a question of **grounding** and **iteration**, not picking a bigger model [1].

## What actually moves the needle

- **Tighten your knowledge sources.** Remove stale docs, split very long pages, and add a 1-line summary at the top of each article. Source quality dominates model quality [3].
- **Build an eval set.** Save 20–30 real questions from production into an evaluation, run it every time you change the agent, and watch the regression rate [2].
- **Use thumbs-down feedback.** Every downvoted answer is automatically eligible to land in your eval set with one click.

If you've done all three and you're still missing answers, *then* try a stronger model — but in our data this is rarely the bottleneck.`,

  sources: [
    { id: "kb-501", title: "Improving Agent Accuracy",   category: "Your Agents",
      excerpt: "Use feedback, evals, and reranking to make answers sharper.",
      url: "https://outlearntest.helpjuice.com/agents/accuracy" },
    { id: "kb-502", title: "Evaluations & Feedback",     category: "Your Agents",
      excerpt: "Build a regression set from real user questions.",
      url: "https://outlearntest.helpjuice.com/agents/evals" },
    { id: "kb-201", title: "What is a Knowledge Source?",category: "Knowledge Sources",
      excerpt: "The data your agent reads from — docs, URLs, and files.",
      url: "https://outlearntest.helpjuice.com/knowledge-sources/overview" }
  ],

  followups: [
    "How do I build an evaluation set?",
    "What's the best way to split long documents?",
    "Should I use a larger model?"
  ]
};


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   FALLBACK — used when the user's question doesn't match any pair.    ║
   ║   The backend's real /agent/ask endpoint should return something      ║
   ║   in this same shape, with `confident: false`, when retrieval scores  ║
   ║   are below threshold.                                                ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

/* Tiny article library used ONLY by the fallback's keyword scoring.
   The seeded responses above don't depend on this. */
const FALLBACK_ARTICLES = [
  response1.sources[0], response1.sources[1], response1.sources[2],
  response2.sources[0], response2.sources[1], response2.sources[2],
  response3.sources[0], response3.sources[1],
  response4.sources[0], response4.sources[1], response4.sources[2],
  response5.sources[0], response5.sources[1]
];

function buildFallbackResponse(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const ranked = FALLBACK_ARTICLES
    .map(a => {
      const hay = (a.title + " " + a.excerpt + " " + a.category).toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { a, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map(r => r.a);

  return {
    id: "response-fallback",
    question: query,
    confident: false,
    plan: [
      { label: "Understanding your question",                                duration: 550 },
      { label: `Searching the knowledge base for "${query.slice(0, 40)}"`,   duration: 850,
        matchedTitles: ranked.map(a => a.title) },
      { label: "Reading related articles",                                   duration: 1000 },
      { label: "Checking confidence",                                        duration: 900 }
    ],
    answer:
`I couldn't find a confident answer for **"${query}"** in the knowledge base.

Here are the closest related articles — one of them may help [1]:

- **${ranked[0]?.title || "—"}** [1]
- **${ranked[1]?.title || "—"}** [2]
- **${ranked[2]?.title || "—"}** [3]

If none of these look right, try rephrasing — for example, ask about a specific feature ("knowledge sources", "deploying", "actions") rather than a general workflow.`,
    sources: ranked,
    followups: [
      "How do I get started with agents?",
      "What are knowledge sources?",
      "How do I deploy my agent?"
    ]
  };
}


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   REGISTRY — all pairs in one place, for the lookup below.            ║
   ║   Adding a new pair: define questionN/responseN above, then push      ║
   ║   { question: questionN, response: responseN } into this array.       ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

window.MOCK_PAIRS = [
  { question: question1, response: response1 },
  { question: question2, response: response2 },
  { question: question3, response: response3 },
  { question: question4, response: response4 },
  { question: question5, response: response5 }
];


/* ╔══════════════════════════════════════════════════════════════════════╗
   ║   window.mockSearch — the function the UI calls.                      ║
   ║                                                                       ║
   ║   Backend team: replace this body with a `fetch("/agent/ask", …)`     ║
   ║   that returns the same response shape. Nothing else changes.         ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

window.mockSearch = async function (query, opts = {}) {
  /* Permalink path: if the caller knows the response id (from the URL),
     look it up directly so the user gets the exact same answer they
     originally got, even if seeded questions are reordered later. */
  if (opts.responseId) {
    const pinned = window.MOCK_PAIRS.find(p => p.response.id === opts.responseId);
    if (pinned) return { ...pinned.response, question: query || pinned.question };
    /* Unknown id — fall through to fuzzy lookup by query */
  }

  const q = (query || "").trim().toLowerCase();
  if (!q) throw new Error("empty query");

  /* 1. Exact match against a registered question */
  let pair = window.MOCK_PAIRS.find(p => p.question.toLowerCase() === q);

  /* 2. Loose contains match */
  if (!pair) {
    pair = window.MOCK_PAIRS.find(p => {
      const a = p.question.toLowerCase();
      return a.includes(q) || q.includes(a.replace(/\?$/, ""));
    });
  }

  /* 3. Keyword overlap >= 2 words */
  if (!pair) {
    const qTerms = q.split(/\s+/).filter(t => t.length > 3);
    pair = window.MOCK_PAIRS.find(p => {
      const hay = p.question.toLowerCase();
      return qTerms.filter(t => hay.includes(t)).length >= 2;
    });
  }

  if (pair) return { ...pair.response, question: query };

  /* 4. No match — synthesize a low-confidence response */
  return buildFallbackResponse(query);
};


/* ════════════════════════════════════════════════════════════════════════
 *  Tiny markdown renderer — kept here so we don't pull in a dependency.
 *  Supports: # / ## / ### headings, **bold**, *italic*, `code`,
 *  ordered/unordered lists, paragraphs, and [n] citations
 *  (rendered as <sup class="cite" data-cite="n">n</sup>).
 * ════════════════════════════════════════════════════════════════════════ */

window.renderMarkdown = function (md) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = esc(md).split(/\n{2,}/);

  const inline = s => s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(\d+)\]/g, '<sup class="cite" data-cite="$1" tabindex="0" role="button" aria-label="View source $1">$1</sup>');

  return blocks.map(block => {
    const lines = block.split("\n");

    const h = block.match(/^(#{1,3})\s+(.*)$/);
    if (h && lines.length === 1) {
      const level = h[1].length;
      return `<h${level}>${inline(h[2])}</h${level}>`;
    }

    if (lines.every(l => /^\d+\.\s+/.test(l))) {
      return "<ol>" + lines.map(l => `<li>${inline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("") + "</ol>";
    }

    if (lines.every(l => /^[-*]\s+/.test(l))) {
      return "<ul>" + lines.map(l => `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("") + "</ul>";
    }

    return `<p>${inline(lines.join("<br>"))}</p>`;
  }).join("\n");
};
