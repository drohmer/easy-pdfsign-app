# Easy-pdfSign

A simple, free and open source web app to sign PDF documents. Everything runs locally in your browser — no file is ever sent to a server.

**[Try it online](https://easy-pdfsign.webredirect.org)** · **[Website](https://graphicscomputing.fr/soft/easy-pdfsign/)**

## Features

- **Drag & drop** your PDF and signature image
- **Automatic signature placement** — the app analyzes your document and suggests the best spot
- **100% local & private** — no server upload, no account, no tracking
- **Draw on the PDF** — annotate or initial directly on the document
- **Add text fields** — date, name, location, free text, checkboxes
- **Font size & color** adjustable per element
- **Move, resize, edit** any element freely
- **One-click export** of the signed PDF in high quality
- **Multi-page** support
- **Keyboard shortcuts** — Delete, Escape, Ctrl+wheel zoom
- **Signature remembered** locally between sessions
- **EN/FR** bilingual interface

## Getting started

```bash
npm install
npm run dev
```

The app is available at `http://localhost:5173`.

## Deployment

```bash
# Generic deploy (set your own server)
DEPLOY_SERVER=user@host ./scripts/deploy.sh

# Install nginx config on a fresh server
ssh root@<server> 'bash -s' < scripts/install.sh
```

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- react-pdf (PDF rendering)
- pdf-lib (signed PDF export)

## License

Open source — [MIT](LICENSE)
