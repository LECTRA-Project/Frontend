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
│   ├── exam/            Exam setup, generating progress, questions, review, submitting and results
│   ├── files/           Upload dialog and the PDF / notes viewers
│   ├── notebook/        Notebook cells, editor, outputs, toolbar, notebook state and kernel hooks
│   ├── profile/         Profile and account settings
│   ├── statistics/      Sample performance display
│   └── workspace/       Chat-first workspace: chats, materials menu, viewer and notebook panels, exam
├── services/
│   ├── exam/            Exam answers kept on the device (localStorage)
│   ├── materials/       Supported material types (one list for the whole app)
│   ├── notebook/        .ipynb import/export, browser storage, Markdown rendering
│   └── python/          Python kernel: Pyodide Web Worker and its main-thread client
├── styles/              Global styles and design tokens
└── test/                Shared test setup and helpers
```

The app entry point is `src/main.jsx`. Routes and access guards live in `src/app/router.jsx` and `src/features/auth/RouteGuards.jsx`. Forms use Formik with Yup schemas; shared form bindings are in `src/components/ui/FormikTextField.jsx`. New passwords must be 8–14 characters and include uppercase and lowercase letters, a number, and a special character. The password checklist updates as the user types.

The notebook (an optional panel, opened with the header's Notebook button) runs real Python 3.14 in the browser through Pyodide, inside a Web Worker, with one shared namespace per kernel (variables persist across cells until Restart). It supports code and Markdown cells, Run / Run all / Stop / Restart, rich outputs (text, errors with tracebacks, pandas tables, matplotlib figures), and .ipynb import and download. Packages from the Pyodide distribution load automatically on import, and `%pip install name` (or `!pip install name`) installs compatible packages — this is a LECTRA convenience backed by Pyodide/micropip, not a system shell, and packages that need native code without a Pyodide build (such as `torch`) are reported as unavailable. Cells can be dragged by their grip into the chat as context for the next question; this never runs them. Python is downloaded from the jsDelivr CDN the first time the notebook opens, so it needs internet access (or a self-hosted copy via `VITE_PYODIDE_INDEX_URL`). **Notebooks are saved in the browser's local storage only, per signed-in user — not on the server.** See [`INSTRUCTIONS.md`](INSTRUCTIONS.md#9-python-notebook) for details and limitations.

The workspace is chat-first: the chat is always in the centre, the left menu lists the chats and the materials of the open chat, and a material opens in a viewer docked at the right edge. Every chat has its own materials (`/student_profile/chat/sessions` with several lectures each); answers cite them as page / slide / cell chips, and answers from general knowledge are marked "Not from your materials". Lectures are uploaded as PDF, PPTX, IPYNB or an image (PNG, JPG, JPEG, GIF, WEBP) — exactly the types the backend accepts. Each material's ⋯ menu renames it (only the title is stored) or deletes it from the library. The open chat and material are in the URL (`/workspace?chat=<id>&lecture=<id>`), so links can be shared and survive a reload. When the backend runs AI lecture processing, materials also show their processing status (with retry), and slides and notebooks show their extracted text; against a backend without it (e.g. the current Render deployment) PDFs open from S3 and slides open in the Office Online viewer.

The header's *Exam* opens an exam generated from the student's own materials (`/workspace/exam`, Exams API). The setup step preselects the open chat's materials (or offers the library when the chat has none), and takes the number of questions (3, 5, 7 or 10) and the question types; it also lists unfinished exams to continue or discard. While the questions are written the page shows "2 of 5 questions ready" (polling `GET /api/exams/{id}` every 2 s). Multiple-choice questions take any number of choices; short answers up to 4000 characters. The exam id is in the URL (`?exam=<id>`, next to `?chat=` / `?lecture=`). **Answers are kept in the browser's local storage, per user and exam, until the exam is submitted.** *Finish* opens a review; *Submit and check* asks first (naming the unanswered questions, which get 0 points), shows "Checking your answers…" while the backend grades, and then the results: the score, and per question the verdict, points, the student's answer next to the correct one, the feedback, the points per criterion, any lecturer correction and the pages it came from (each opens beside the exam). Answers the backend couldn't grade yet can be graded again, and *New exam on the same materials* opens the setup with that exam's materials and settings. See [`INSTRUCTIONS.md`](INSTRUCTIONS.md#the-exam).

The workspace includes demo/sample-only behavior in some areas: account preferences are local-only because the backend has no preferences endpoint, statistics are illustrative, and the study assistant only works when the backend provides it (see above). Profile details and password changes use the backend user endpoints; changing a password signs the user out and returns them to sign-in. Uploaded PDFs fit the viewer's width until the user changes the zoom. Success and action-confirmation messages dismiss after three seconds; validation and error messages remain visible.

## Backend

The backend is deployed at https://taskgeneration.onrender.com. The browser calls it directly at `VITE_API_PROXY_TARGET` + `VITE_API_BASE_URL` (e.g. `https://taskgeneration.onrender.com/api`), so the backend's `CORS_ORIGINS` must include the site's origin. With `VITE_API_PROXY_TARGET` empty, requests stay relative (`/api`) and the Vite proxy in `vite.config.js` forwards them to `http://127.0.0.1:8000`.

The backend's `FRONTEND_URL` must match the address where this frontend is reachable (default `http://localhost:5173`) for email reset links to open the app. The reset token is captured from the emailed link and the query string is immediately removed from the browser address bar. See the [backend instructions](../Backend/TaskGeneration/INSTRUCTIONS.md) for database, email, LLM configuration, and endpoint details.

## Keeping docs current

When a code, API, dependency, configuration, or workflow change affects setup or user-visible behavior, update this README and [`INSTRUCTIONS.md`](INSTRUCTIONS.md) in the same change. The repository Copilot instructions in `.github/copilot-instructions.md` remind coding agents to do this.
