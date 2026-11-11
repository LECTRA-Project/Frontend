# LECTRA Frontend

LECTRA is a React study-workspace frontend. It provides account flows, a course-materials panel, a Jupyter-style Python notebook and exam workspace, file previews, profile settings, and sample statistics. The frontend is built with React, React Router, Vite, Axios, Formik, and Yup; the notebook uses CodeMirror 6, Pyodide (Python in WebAssembly, run in a Web Worker), marked, DOMPurify and KaTeX.

## Quick start

Requirements: Node.js 20.19+ or 22.12+, npm, and (for API-backed features) the LECTRA backend and PostgreSQL.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite uses the fixed port `5173` because password-reset emails link to that address by default; it exits with an error if the port is occupied instead of choosing another port.

The development server forwards `/api/*` to `http://127.0.0.1:8000`. Start the backend separately; setup instructions are in [`../Backend/TaskGeneration/INSTRUCTIONS.md`](../Backend/TaskGeneration/INSTRUCTIONS.md). The full local development, environment, test, and troubleshooting guide is in [`INSTRUCTIONS.md`](INSTRUCTIONS.md).

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server on port 5173 |
| `npm run build` | Create the production bundle in `dist/` |
| `npm run preview` | Preview the production bundle locally |
| `npm run lint` | Run Oxlint |
| `npm test` | Run the frontend test suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:live` | Run opt-in auth tests against `http://127.0.0.1:8000/api` |

## Project map

```text
src/
├── api/                 Axios client, error handling, and API services
├── app/                 App shell and React Router routes
├── components/          Shared layout and UI components
├── data/                Illustrative statistics
├── features/
│   ├── auth/            Sign-in, registration, reset-password, auth state and schemas
│   ├── files/           Upload dialog, uploaded-materials state and the PDF / notes / slides viewers
│   ├── notebook/        Notebook cells, editor, outputs, toolbar, notebook state and kernel hooks
│   ├── profile/         Profile and account settings
│   ├── statistics/      Sample performance display
│   └── workspace/       Study workspace, notebook, exam and assistant panel
├── services/
│   ├── materials/       Supported material types and browser storage (IndexedDB) for uploads
│   ├── notebook/        .ipynb import/export, browser storage, Markdown rendering
│   ├── python/          Python kernel: Pyodide Web Worker and its main-thread client
│   └── studyAssistant.js  Study-assistant integration boundary
├── styles/              Global styles and design tokens
└── test/                Shared test setup and helpers
```

The app entry point is `src/main.jsx`. Routes and access guards live in `src/app/router.jsx` and `src/features/auth/RouteGuards.jsx`. Forms use Formik with Yup schemas; shared form bindings are in `src/components/ui/FormikTextField.jsx`. New passwords must be 8–14 characters and include uppercase and lowercase letters, a number, and a special character. The password checklist updates as the user types.

The notebook in the centre panel runs real Python 3.14 in the browser through Pyodide, inside a Web Worker, with one shared namespace per kernel (variables persist across cells until Restart). It supports code and Markdown cells, Run / Run all / Stop / Restart, rich outputs (text, errors with tracebacks, pandas tables, matplotlib figures), and .ipynb import and download. Python is downloaded from the jsDelivr CDN the first time the notebook opens, so it needs internet access (or a self-hosted copy via `VITE_PYODIDE_INDEX_URL`). **Notebooks are saved in the browser's local storage only, per signed-in user — not on the server.** See [`INSTRUCTIONS.md`](INSTRUCTIONS.md#9-python-notebook) for details and limitations.

The Course Materials panel lists only files the student uploads (PDF, PPTX, IPYNB, MD), grouped by type, with filtering, download and removal; it starts empty. Uploaded materials are saved per signed-in user in this browser's IndexedDB, **not on the server**. PDFs and Markdown notes open in the centre panel, notebooks open in the notebook, and PPTX files (which browsers cannot render) can be downloaded.

The workspace includes demo/sample-only behavior in some areas: files attached to an assistant message are local to the browser tab, account preferences are local-only because the backend has no preferences endpoint, statistics are illustrative, and the study assistant is not connected unless its service reports otherwise. Profile details and password changes use the backend user endpoints; changing a password signs the user out and returns them to sign-in. The course-materials panel starts collapsed and can be expanded from its menu button; the notebook/PDF center column automatically uses the available space, and uploaded PDFs auto-fit to the viewer width until the user manually changes zoom. Success and action-confirmation messages dismiss after three seconds; validation and error messages remain visible.

## Backend

The API source is in the sibling `Backend/TaskGeneration/backend` project. The frontend uses `/api` as its default base URL and the Vite proxy in `vite.config.js` to forward API traffic. For production or a direct cross-origin setup, configure `VITE_API_BASE_URL` and the backend's `CORS_ORIGINS` appropriately.

The backend's `FRONTEND_URL` must match the address where this frontend is reachable (default `http://localhost:5173`) for email reset links to open the app. The reset token is captured from the emailed link and the query string is immediately removed from the browser address bar. See the [backend instructions](../Backend/TaskGeneration/INSTRUCTIONS.md) for database, email, LLM configuration, and endpoint details.

## Keeping docs current

When a code, API, dependency, configuration, or workflow change affects setup or user-visible behavior, update this README and [`INSTRUCTIONS.md`](INSTRUCTIONS.md) in the same change. The repository Copilot instructions in `.github/copilot-instructions.md` remind coding agents to do this.
