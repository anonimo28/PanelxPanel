# PanelxPanel — Manga Panel Reader

A manga reader with panel-by-panel (guided view) navigation. Upload CBZ/CBR/PDF or paste a folder path. RTL/LTR, touch swipe, installable PWA.

## Features

- **Panel-by-panel reading** — auto-detects panels via edge-scanners, grid slicer, or manual tuning
- **MangaDex catalog** — browse, search, and download chapters from MangaDex
- **Local library** — save chapters offline with IndexedDB
- **CBZ/ZIP support** — load archive files directly
- **Remote URL loader** — stream CBZ/ZIP archives via proxied fetch
- **CORS-bypass proxy** — built-in `/api/proxy` for fetching remote images

## Run Locally

1. Install dependencies:
   ```
   npm install
   ```
2. Run the dev server:
   ```
   npm run dev
   ```
3. Open `http://localhost:3000`

## Build for Production

```
npm run build
npm start
```
