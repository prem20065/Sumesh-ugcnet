# Paper Cleaner

Turn a messy question paper PDF into a clean, editable mock exam. Everything runs in the browser: your PDFs never leave the tab.

1. **Load paper**: choose a question paper PDF and, optionally, an answer key PDF (or paste text).
2. **Clean & check**: headers, footers and page numbers are removed, text is split into numbered questions with options, and "Match LIST-I with LIST-II" tables are rebuilt. Every question is editable, and you can apply or change the answer key.
3. **Mock exam**: timed exam with a question palette, mark-for-review, negative marking and a full result review.

**NTA question papers** (the ones with `Question Number : 1 Question Id : …` labels) keep each question as a picture. These are detected automatically: each question is cropped out of the PDF and shown as an image, with the answer key (including NTA's 4-column table, `1 | 1 | 26 | 4`) applied by question number. Tick "Remove Hindi text and keep the English" to keep only the English printing of a bilingual paper.

Scanned PDFs have no text layer and are not supported (no OCR). Paste the text instead.

## Tech stack

TypeScript · Vite · [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) · plain CSS (light/dark) · Vitest · ESLint · Prettier · GitHub Pages.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parsing logic
npm run lint
npm run build    # type-check and build to dist/
```

## Project layout

```
index.html
src/
  main.ts            wiring
  state.ts           shared question list
  dom.ts             tiny DOM helpers
  pdf/               layout.ts (lines, tables, headers/footers), read.ts (pdf.js)
  parse/             clean.ts (questions, options), key.ts (answer key)
  ui/                nav, step1, editor, exam, render
  styles/            tokens.css (colors, fonts), app.css
tests/               Vitest specs for parsing and layout
.github/workflows/   deploy.yml (GitHub Pages)
```

## Selling access

Sign-in with one active device per account is built in. See [docs/ACCESS.md](docs/ACCESS.md) for the one-time Firebase setup and how to add or remove buyers.

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site is served at `https://<user>.github.io/<repo>/` (the workflow sets Vite's `base` automatically).
