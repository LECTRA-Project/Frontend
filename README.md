# LECTRA Frontend

LECTRA is a React study-workspace frontend. It provides account flows, a course-materials panel, a notebook and exam workspace, file previews, profile settings, and sample statistics. The frontend is built with React, React Router, Vite, Axios, Formik, and Yup.

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
├── data/                Illustrative materials and statistics
├── features/
│   ├── auth/            Sign-in, registration, reset-password, auth state and schemas
│   ├── files/           Upload dialog and local file previews
│   ├── profile/         Profile and account settings
│   ├── statistics/      Sample performance display
│   └── workspace/       Study workspace, notebook, exam and assistant panel
├── services/            Study-assistant integration boundary
├── styles/              Global styles and design tokens
└── test/                Shared test setup and helpers
```

The app entry point is `src/main.jsx`. Routes and access guards live in `src/app/router.jsx` and `src/features/auth/RouteGuards.jsx`. Forms use Formik with Yup schemas; shared form bindings are in `src/components/ui/FormikTextField.jsx`. New passwords must be 8–14 characters and include uppercase and lowercase letters, a number, and a special character. The password checklist updates as the user types.

The workspace includes demo/sample-only behavior in some areas: picked files are local to the browser session, profile/settings saves are not persisted, statistics are illustrative, and the study assistant is not connected unless its service reports otherwise. The course-materials panel starts collapsed and can be expanded from its menu button; the notebook/PDF center column automatically uses the available space, and uploaded PDFs auto-fit to the viewer width until the user manually changes zoom. Success and action-confirmation messages dismiss after three seconds; validation and error messages remain visible.

## Backend

The API source is in the sibling `Backend/TaskGeneration/backend` project. The frontend uses `/api` as its default base URL and the Vite proxy in `vite.config.js` to forward API traffic. For production or a direct cross-origin setup, configure `VITE_API_BASE_URL` and the backend's `CORS_ORIGINS` appropriately.

The backend's `FRONTEND_URL` must match the address where this frontend is reachable (default `http://localhost:5173`) for email reset links to open the app. The reset token is captured from the emailed link and the query string is immediately removed from the browser address bar. See the [backend instructions](../Backend/TaskGeneration/INSTRUCTIONS.md) for database, email, LLM configuration, and endpoint details.

## Keeping docs current

When a code, API, dependency, configuration, or workflow change affects setup or user-visible behavior, update this README and [`INSTRUCTIONS.md`](INSTRUCTIONS.md) in the same change. The repository Copilot instructions in `.github/copilot-instructions.md` remind coding agents to do this.
