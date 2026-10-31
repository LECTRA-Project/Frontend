# Development Instructions

This guide covers the LECTRA frontend and how to run it with the sibling FastAPI backend. For a concise project overview, see [`README.md`](README.md). Backend-specific setup is also documented in [`../Backend/TaskGeneration/INSTRUCTIONS.md`](../Backend/TaskGeneration/INSTRUCTIONS.md).

Commands below assume your terminal starts in `Projects/`, the directory containing both `Frontend/` and `Backend/`. Adjust the initial directory if your checkout is elsewhere.

## 1. Project layout

The projects are siblings:

```text
Projects/
├── Frontend/                       # this React/Vite project
└── Backend/
    └── TaskGeneration/
        └── backend/                # FastAPI application and Python dependencies
```

Frontend files that are useful starting points:

- `src/main.jsx` mounts the React application.
- `src/app/App.jsx` provides the auth context and router.
- `src/app/router.jsx` defines routes.
- `src/api/client.js` configures Axios, auth tokens, and normalized API errors.
- `src/api/services/auth.js` contains auth-related API calls.
- `src/features/auth/` contains auth pages, route guards, password validation, and session state.
- `src/features/workspace/` contains the main study workspace.
- `src/components/ui/` contains reusable controls, including Formik bindings.

The backend's current router registration is in `Backend/TaskGeneration/backend/main.py`; auth endpoints are in `backend/auth/routes.py`. `task_generator/routes.py` is currently a router scaffold.

## 2. Prerequisites

- Node.js 20.19+ or 22.12+ and npm (required by the current Vite version).
- Python 3.11+ for the backend.
- PostgreSQL running locally for the backend.
- Optional: SMTP account for delivering real password-reset emails.
- Optional: provider API keys for live LLM-backed backend features.

## 3. Configure and run the backend

Open a terminal at the backend Python project directory:

```bash
cd Backend/TaskGeneration/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

On Windows PowerShell, activate the environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

Edit `backend/.env` and set `DATABASE_URL` to a PostgreSQL database. The example uses a database named `lectra`; create it if necessary, for example:

```bash
createdb lectra
```

Set `JWT_SECRET_KEY` to a unique, sufficiently random value. Do not commit `.env`, passwords, API keys, or email credentials. The app creates its SQLAlchemy tables at startup; PostgreSQL itself must already be running.

Start the API from the `backend/` directory, with the virtual environment active:

```bash
uvicorn main:app --reload
```

Useful URLs:

- API base: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

The frontend proxy health check is [http://localhost:5173/api/health](http://localhost:5173/api/health).

### Password-reset email configuration

The backend builds reset links from `FRONTEND_URL`; its default is `http://localhost:5173`. The frontend dev server is pinned to port 5173 to keep the default link valid.

With `SMTP_HOST` empty, the backend logs the reset email content/link instead of delivering email. For real delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_USE_TLS` in the backend `.env`. For Gmail, use an App Password, not your normal account password. Reset tokens expire according to `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` (15 minutes by default) and are single-use.

### Optional LLM configuration

`GROQ_API_KEY`, `GEMINI_API_KEY`, and `LLM_PROVIDERS` configure LLM providers. Leave keys empty for tasks that do not use live providers. Never commit API keys.

## 4. Configure and run the frontend

In another terminal, open the frontend project:

```bash
cd Frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). `vite.config.js` uses `strictPort`, so Vite reports an error if port 5173 is already taken; stop the conflicting app or change the backend's `FRONTEND_URL` and the frontend Vite port together.

The checked-in `.env.example` contains:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | API base used by the browser |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Backend target for the Vite development proxy |
| `VITE_API_TIMEOUT_MS` | `15000` | Axios request timeout |

Vite only exposes variables prefixed with `VITE_` to browser code. Do not put secrets in frontend environment variables. With the default `/api` URL, requests are proxied to the backend without requiring browser CORS. For a direct API connection, set `VITE_API_BASE_URL` to the full backend API URL and include the frontend origin in backend `CORS_ORIGINS`.

## 5. Main frontend routes

| URL | Page | Access |
| --- | --- | --- |
| `/` | Sign in | Guest |
| `/create-account` | Create account | Guest |
| `/forget-password` | Request a reset email | Guest |
| `/reset-password?token=...` | Choose a new password | Public reset link; the page captures the token and immediately removes it from the visible URL |
| `/workspace` | Notebook workspace | Signed in |
| `/workspace/exam` | Exam workspace | Signed in |
| `/profile` | Profile and password fields | Signed in |
| `/settings` | Account preferences | Signed in |
| `/statistics` | Sample performance statistics | Signed in |

Unknown routes redirect to sign-in. Reset links remain accessible when a browser already has an authenticated session. The reset token must be present in the emailed URL to bootstrap the flow; after the app captures it, the URL is replaced with `/reset-password` before rendering.

## 6. Password and form behavior

Formik manages form values and submission state; Yup schemas are defined in `src/features/auth/validationSchemas.js`. `FormikTextField` connects shared text inputs to Formik, and `PasswordRequirements` presents the same live policy used by Yup.

For account creation, reset, and profile new-password fields, the frontend requires a password of 8–14 characters containing:

- At least one uppercase letter.
- At least one lowercase letter.
- At least one number.
- At least one special character.

The checklist appears only after password entry begins. Unmet conditions display red with an ×; satisfied conditions display green with a check. Sign-in and current-password fields accept existing passwords without applying the new-password policy.

This validation is currently implemented in the frontend. Any API that creates or changes a password should enforce the same policy server-side as well; client validation alone is not a security boundary.

Success and action-confirmation messages use the shared `TransientStatus` component and dismiss after three seconds. Keep validation errors and API errors persistent so users can read and act on them.

## 7. API overview

The backend uses JSON responses in the `{ "status": true, "message": "...", "data": ... }` shape. The current auth endpoints are:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register with `email`, `password`, and `full_name` |
| `POST` | `/api/auth/login` | Sign in and receive `data.token` |
| `GET` | `/api/auth/user` | Load the signed-in user; requires the bearer token |
| `POST` | `/api/auth/forgot-password` | Request a reset email with `email` |
| `POST` | `/api/auth/reset-password` | Reset using `token` and `new_password` |

The Axios client stores the access token in browser local storage and attaches it to authenticated requests. API failures are normalized to an `ApiError` with a user-facing message and any field errors.

## 8. Test, lint, and build

Run these commands from `Frontend/`:

```bash
npm test
npm run lint
npm run build
```

Vitest uses jsdom and mocked HTTP requests for normal tests. Test files are under `src/` and use `src/test/helpers.jsx` for API mocks and route rendering. A live auth test is optional:

```bash
npm run test:live
```

It requires the backend to be running at `http://127.0.0.1:8000` and creates a uniquely named test user. It is not part of the default `npm test` run.

Backend tests are run from `Backend/TaskGeneration/` with the backend virtual environment active:

```bash
pytest
```

The default pytest configuration excludes live provider tests. To opt in to provider-dependent tests, configure the required keys and run `pytest -m live`.

## 9. Demo behavior and current boundaries

- Sample materials and statistics are illustrative data.
- Picked files are kept in the browser session and are not uploaded to the backend.
- Profile and settings forms currently show demo/local behavior and do not persist changes.
- The study assistant UI is present, but its service may report that it is not connected.
- The task-generator router is currently scaffolded without endpoint implementations.

Check the relevant service and feature before assuming a UI is backed by a persistent API.

## 10. Change and documentation workflow

1. Make changes in the relevant feature or service; keep cross-cutting API behavior in the shared client/service layer.
2. Add or update tests alongside behavior changes.
3. Run the relevant tests, then `npm run lint` and `npm run build` for frontend changes; run `pytest` for backend changes.
4. If a change affects setup, commands, environment variables, routes, APIs, validation rules, dependencies, security-sensitive behavior, or demo/production boundaries, update the corresponding README and INSTRUCTIONS guide in the same change.
5. If a cross-project change affects how the frontend and backend work together, update both projects' docs.
6. Never add real secrets to examples or documentation.

Project Copilot instructions in `.github/copilot-instructions.md` reinforce this documentation-maintenance rule for future coding-agent changes.
