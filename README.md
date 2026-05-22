# Helpjuice AI Search — Outlearn Prototype

A static front-end prototype that explores what a "RAG-style" agentic
search would feel like on a Helpjuice knowledge base. Built on top of
the live [outlearntest.helpjuice.com](https://outlearntest.helpjuice.com)
chrome — same colours, logo, sidebar IA — so the experiment looks like
something that could ship inside the existing product without
rebranding.

No build step, no framework, no backend. Just shared chrome partials,
one CSS file, a mock-data module, and a small `agent.js` per version.

## Versions

The root `index.html` is a picker. Each version lives under its own
folder and is a full set of pages (homepage / category / article) that
share the same chrome and the same mock backend:

| URL | What it explores |
|---|---|
| `/v1/` | **Spotlight modal.** Hero / header pill / `⌘K` opens a centered modal. Plan checklist, streamed markdown answer with `[1]` citation chips, source rail, follow-up chips, shareable `?q=…&r=…` URL. |
| `/v2/` | **Inline answer (stub).** No modal — the hero search submits and the answer renders directly on the page beneath it. |

## The agent flow (v1)

From any page:

1. **Hero search bar / header trigger pill / `⌘K` / `/`** opens the
   spotlight modal.
2. Typing into the spotlight (debounced 500ms) or hitting Enter calls
   `window.mockSearch(query)` — the **only** function a real backend
   would need to replace.
3. The response packet (`plan`, `answer`, `sources`, `followups`)
   drives the UI: green-tick checklist animation → tokenised markdown
   stream with `[1]`/`[2]` citation chips → source rail → "Ask a
   follow-up" chip row.
4. Citation chips scroll their matching source card into view and
   highlight it.
5. State is mirrored in the URL (`?q=…&r=…`) so any conversation is
   shareable; the browser back button rewinds turns.

Three canned Q&A packets ship in [`mock-data.js`](mock-data.js); the
query is keyword-matched to pick one (or a low-confidence fallback).

## Stack notes

- **HTML / CSS / vanilla JS** — no dependencies, no build.
- **CSS uses native nesting** (Chrome 112+, Firefox 117+, Safari 16.5+).
- **No backdrop-filter, blur, or saturate** filters anywhere — they
  cost paint time on every scroll frame, especially under software
  rendering. The streaming answer dropped to ~15fps until those were
  removed.
- **Performance-sensitive bits**: `streamAnswer()` in v1 throttles its
  `innerHTML` re-render to once per 60ms; citation click handling uses
  event delegation on the answer container (bound once, not per
  token).

## Running locally

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. The shared chrome is loaded via
`fetch()`, so a static file server is required (not `file://`). Any
static server works.

## Layout

```
.
├── index.html               # version picker
├── styles.css               # all styles (nested-CSS BEM)
├── mock-data.js             # fake backend — three Q&A packets + markdown renderer
├── outlearn-logo.png
├── shared/
│   ├── header.html          # header partial
│   ├── sidebar.html         # sidebar partial (data-nav-group hooks for per-page active state)
│   ├── footer.html          # footer + back-to-top
│   ├── include.js           # ~50-line loader for data-include="…" slots
│   └── plumbing.js          # sidebar drawer, FAQ tabs, TOC dock, back-to-top, category view toggle
├── v1/                      # spotlight-modal version
│   ├── index.html
│   ├── category.html
│   ├── article.html
│   └── agent.js             # ask(), plan, streamAnswer, citations, sources, follow-ups, hotkeys, URL state
└── v2/                      # inline-answer stub
    ├── index.html
    ├── category.html
    ├── article.html
    └── agent.js
```

### How chrome stays in sync

Every per-version page includes the same three partials via
`<div data-include="…">` slots:

```html
<div data-include="../shared/header.html"></div>
<div data-include="../shared/sidebar.html" data-active="getting-started"></div>
<div data-include="../shared/footer.html"></div>
```

`shared/include.js` fetches each partial once, injects it inline, and
post-processes per-slot attributes:

- `data-active="<group-id>"` marks that sidebar nav group as current.
- `data-active-link="<link-id>"` marks a specific link inside it as
  current.
- `data-no-search="1"` removes the header's compact search trigger
  (used on pages that already have a hero search).

After the partials resolve, each page calls `initPlumbing()` and
`initAgent()` in order.

### Adding a new version

```bash
cp -r v1 v3
# edit v3/agent.js to implement the new UX
# add a card linking to /v3/ in the root index.html picker
```

`v3` automatically picks up any future change to `shared/` — header
tweaks, sidebar items, footer copy. The only thing you own per version
is `agent.js` (and any page-level markup that differs, like an inline
answer mount or a different hero).

## Swapping in a real backend

`window.mockSearch(query, { responseId })` is the only contract.
Return a Promise of:

```js
{
  id:        "string",                  // stable id, drives the ?r= permalink
  question:  "...",
  confident: true | false,              // false renders an orange "closest articles" banner
  plan:      [ { label, duration, matchedTitles? } ],
  answer:    "markdown string with [1] [2] citation tokens",
  sources:   [ { id, title, category, excerpt, url } ],
  followups: [ "string", ... ]
}
```

Everything downstream — streaming, citations, source highlighting,
follow-up chips, URL state — stays the same. Every version uses the
same `mockSearch`; only the UI shell varies.
