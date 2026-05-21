# Helpjuice AI Search — Outlearn Prototype

A static front-end prototype that explores what a "RAG-style" agentic
search would feel like on a Helpjuice knowledge base. Built on top of
the live [outlearntest.helpjuice.com](https://outlearntest.helpjuice.com)
chrome — same colours, logo, sidebar IA — so the experiment looks like
something that could ship inside the existing product without rebranding.

No build step, no framework, no backend. Just three HTML files, one CSS
file, one JS controller, and a mock-data module.

## What's in it

| Page | What it shows |
|---|---|
| `index.html` | Homepage with hero search, category grid, FAQ accordion. |
| `category.html` | Category detail (Getting Started) — breadcrumb, progress bar, grid/list article toggle. |
| `article.html` | Single article (What is Outlearn?) — title, byline, action buttons, table of contents, prose, in-article Ask AI panel. |

All three share a header, sidebar, footer, and the spotlight search
modal. The sidebar is a persistent sticky panel on desktop (≥1024px)
and a slide-in drawer on mobile.

## The agent flow

The interesting part. From any page:

1. **Hero search bar / header trigger pill / `⌘K` / `/`** opens a
   centered modal (the "spotlight").
2. Typing into the spotlight (debounced 500ms) or hitting Enter calls
   `window.mockSearch(query)` — the **only** function a real backend
   would need to replace.
3. The response is a packet (`plan`, `answer`, `sources`, `followups`)
   that drives the UI: green-tick checklist animation → tokenised
   markdown stream with `[1]`/`[2]` citation chips → source rail →
   "Ask a follow-up" chip row.
4. Citation chips scroll their matching source card into view and
   highlight it.
5. State is mirrored in the URL (`?q=...&r=...`) so any conversation
   is shareable; the browser back button rewinds turns.

Three canned Q&A packets ship in [`mock-data.js`](mock-data.js); the
query is keyword-matched to pick one (or a low-confidence fallback).

## Stack notes

- **HTML / CSS / vanilla JS** — no dependencies, no build.
- **CSS uses native nesting** (Chrome 112+, Firefox 117+, Safari 16.5+).
- **No backdrop-filter, blur, or saturate** filters anywhere — they
  cost paint time on every scroll frame, especially under software
  rendering. The streaming answer dropped to ~15fps until those were
  removed.
- **Performance-sensitive bits**: `streamAnswer()` throttles its
  `innerHTML` re-render to once per 60ms; citation click handling uses
  event delegation on the answer container (bound once, not per
  token). See the comments in [`app.js`](app.js) for the rationale.

## Running locally

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. Anything else that serves a static
directory works too — the files are framework-free.

## Layout

```
.
├── index.html        # Homepage
├── category.html     # Category listing
├── article.html      # Article detail
├── styles.css        # All styles (nested-CSS BEM)
├── app.js            # UI controller — agent flow, sidebar, spotlight, TOC dock
├── mock-data.js      # Fake backend — three Q&A packets + markdown renderer
└── outlearn-logo.png
```

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
follow-up chips, URL state — stays the same.
