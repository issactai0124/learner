# Secondary School Knowledge Tester (Edu-Quiz Agent)

A lightweight client + proxy demo that generates short multiple-choice quizzes and teacher-style feedback using an LLM backend. The frontend is a static `index.html` that uses Tailwind and KaTeX for math rendering; the backend is a small proxy that keeps your API key off the client.

## Features

- Generate 5-question multiple-choice quizzes for a specified Form/Grade and topic.
- Session persistence (resume unfinished quizzes).
- Chinese (Traditional) and English UI localization.
- KaTeX rendering for LaTeX math in questions and feedback.
- Server-side proxy for keeping API keys secret.

## Prerequisites

- Node.js 16+ (for the proxy server)
- A Google Generative Language API key (Gemini). The proxy expects the key in the `GENERATIVE_API_KEY` environment variable and will forward requests to Google's Generative Language endpoint. Do NOT commit this key — store it in `.env` or your host's secret manager.

## Project layout (important files)

- `index.html` — main frontend page (static, references `assets/`)
- `assets/js/app.js` — frontend logic and localization
- `assets/css/style.css` — extracted styles
- `server.js` (or similar) — small proxy server that forwards requests to the LLM provider
- `.env.example` — example environment variables (do not store your real key here)

## Setup (local)

1. Copy environment template and add your real key (Google Generative API key):

```cmd
copy .env.example .env
rem Edit .env and set GENERATIVE_API_KEY=your_google_generative_api_key
```

2. Install dependencies in the repo root (if `package.json` exists):

```cmd
npm install
```

3. Start the proxy server (from the repo root):

```cmd
npm start
rem or, if there's no start script
node server.js
```

4. Open the frontend:

- If your server serves the static frontend (e.g., express static), open http://localhost:3000
- Otherwise you can open `index.html` directly in a browser for UI-only testing (API features require the server proxy)

## Usage notes

- Language selection: choose English or 中文 (繁體) on the first page.
- When asking for math questions, the generator expects LaTeX for math expressions (inline `$...$`, display `$$...$$`).
- The frontend posts to `/api/generate` (the proxy). Do not put keys in the frontend.
- Currently the proxy is implemented to call the Google Generative Language API (Gemini model). If you want to use a different LLM provider (e.g., OpenAI), you'll need to modify `server.js` to change the upstream URL, authentication method, and possibly the request/response handling.

## Security

- Add `.env` to `.gitignore` (do not commit secrets). If you have already committed `.env` with a real key, remove it from the repo and rotate the key immediately.
- The proxy expects `GENERATIVE_API_KEY` in the environment. Use your host's secret manager (Render, Vercel, Heroku, etc.) or GitHub Secrets for CI/deploy workflows.
- If you accidentally committed a secret, rotate it immediately and remove it from history using `git filter-repo` or BFG. Note: simply deleting the file does not remove it from Git history.

## Deployment notes

- Frontend-only: GitHub Pages (if no server proxy needed).
- With server proxy: host server on Render/Vercel/Heroku and either:
  - Serve static frontend from the same server (express static), or
  - Host frontend on GitHub Pages and set the proxy server URL in a config (but don't put keys in the client).

## Troubleshooting

- If math doesn't render, check the console for KaTeX/auto-render errors and ensure `renderMathInElement` is available.
- If generation fails, open the Network inspector to see the `/api/generate` request and the server logs for proxied errors.

## License

This project is released under the MIT License — see `LICENSE`.

## Author

Issac Tai ([issactai0124@gmail.com](mailto:issactai0124@gmail.com))
