# Easy-pdfSign

A simple web app to sign PDF documents quickly. Everything runs locally in your browser — no file is ever sent to a server.

## Features

- **Drag & drop a PDF** to view it directly in the browser
- **Add a signature** by dropping an image (PNG/JPG) on the sidebar or directly on the PDF
- **Automatic placement** of the signature on the detected signing area
- **Move and resize** the signature freely on the document
- **Add date and location** text on the document
- **Export the signed PDF** in one click
- **Remembers** last signature and location (localStorage)
- **EN/FR** language toggle

## Getting started

```bash
npm install
npm run dev
```

The app is available at `http://localhost:5173`.

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- react-pdf (PDF rendering)
- pdf-lib (signed PDF export)
