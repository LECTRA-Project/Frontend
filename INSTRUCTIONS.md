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
- `src/api/services/auth.js` and `src/api/services/users.js` contain auth and signed-in user API calls.
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

The backend health check is [https://taskgeneration.onrender.com/api/health](https://taskgeneration.onrender.com/api/health).

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
| `VITE_API_PROXY_TARGET` | `https://taskgeneration.onrender.com` | Backend the browser calls directly (`<target>/api/...`); empty = relative `/api` through the Vite proxy to `http://127.0.0.1:8000` |
| `VITE_API_TIMEOUT_MS` | `15000` | Axios request timeout |
| `VITE_PYODIDE_INDEX_URL` | jsDelivr URL for the pinned Pyodide version | Where the notebook downloads Python from (optional; see section 9) |

Vite only exposes variables prefixed with `VITE_` to browser code. Do not put secrets in frontend environment variables. With the default `/api` URL, requests are proxied to the backend without requiring browser CORS. For a direct API connection, set `VITE_API_BASE_URL` to the full backend API URL and include the frontend origin in backend `CORS_ORIGINS`.

## 5. Main frontend routes

| URL | Page | Access |
| --- | --- | --- |
| `/` | Sign in | Guest |
| `/create-account` | Create account | Guest |
| `/forget-password` | Request a reset email | Guest |
| `/reset-password?token=...` | Choose a new password | Public reset link; the page captures the token and immediately removes it from the visible URL |
| `/workspace` | Python notebook workspace | Signed in |
| `/workspace?lecture=<id>` | The workspace with that lecture open (any page of it, e.g. `/workspace/exam?lecture=<id>`); the link can be copied, reloaded or shared. An id not in the student's materials shows a notice and is dropped. | Signed in |
| `/workspace/exam` | Exam workspace | Signed in |
| `/workspace/home` | Home screen (where signing in and sign-up land) | Signed in |
| `/profile` | Profile and password fields | Signed in |
| `/settings` | Account preferences | Signed in |
| `/statistics` | Sample performance statistics | Signed in |

Unknown routes redirect to sign-in. Reset links remain accessible when a browser already has an authenticated session. The reset token must be present in the emailed URL to bootstrap the flow; after the app captures it, the URL is replaced with `/reset-password` before rendering.

The course-materials panel starts collapsed and lists the signed-in student's lectures from the backend (`GET/POST/PATCH/DELETE /api/student_profile/...lecture...`), grouped into Lecture notes, Slides, PDFs and Notebook, with a "No course materials yet" empty state and a filter box. Each lecture can be opened, edited and deleted (with confirmation). PDFs open in the inline PDF viewer, `.ipynb` files open in the runnable notebook, and slides offer a download (browsers cannot render PowerPoint).

On load the app checks which backend it talks to (`GET /api/student_profile/lectures/<zero-uuid>`: 404 = AI-enabled backend, 405 = backend without AI processing):

- **Backend without AI processing** (the current Render deployment): uploads accept PDF, PPTX and IPYNB; editing renames only; files open from the lecture's S3 URL. The study assistant uses the Lecture Chat API when the server has it (see below); otherwise it shows "not available". Opening a notebook downloads it from S3 in the browser, so the bucket's CORS rule must allow the frontend's origin (it allows `http://localhost:5173`); otherwise the app offers a download instead.
- **AI-enabled backend**: additionally `.ppt` and `.md` uploads with an optional course, processing status with retry, editing course/description and replacing the file, extracted slide/notebook/notes text, and the RAG study assistant with clickable page/slide/cell sources.

The course-materials panel starts collapsed. Its menu button expands or hides the materials list; on desktop the notebook/PDF viewer column resizes to use the available width, and on smaller screens the panel stacks above the workspace content. Uploaded PDFs automatically fit their viewer width when the panel resizes; manual zoom overrides auto-fit.

Opening a PDF from the notebook (or from Home) shows it beside the notebook: by default the workspace is PDF | Notebook | Study assistant, side by side. The divider between two columns can be dragged (or focused and moved with the left / right arrow keys) to resize them: the Study assistant gets a width in px (200–640), the PDF and notebook share the remaining space (each at least 240 px). Sections can still be dragged by their grip (or moved from its Move menu) anywhere, e.g. the Study assistant into the middle; if the PDF and notebook are stacked in one column, a horizontal divider sizes them (arrow keys, Home and End). The notebook stays mounted throughout, so opening, switching or closing PDFs never resets it. Arrangements are saved per user (`lectra:workspace-layout:v2:<user>`); column widths are not saved.

**Saved lecture chats (Lecture Chat API).** A second probe, `GET /api/student_profile/chat/sessions?page_size=1`, detects the chat API (200 = available). When it is available, the Study assistant works in chat sessions, each about exactly one lecture: the chat is about the lecture open in the viewer (to chat about another one, the student opens it from Course materials; sending then starts a new chat about it), and the first question creates the session (`POST /chat/sessions`) and then asks it (`POST /chat/sessions/{id}/messages`); the backend names the chat after that first question. Follow-ups stay in the same chat. *Recent chats* lists earlier chats (`GET /chat/sessions`, most recent first); opening one loads its messages (`GET /chat/sessions/{id}/messages`) and opens its lecture in the viewer, and each can be renamed (`PATCH`) or deleted (`DELETE`, with confirmation). Answers render as Markdown and list the pages they cite; clicking one opens the lecture there. A dropped course material becomes the lecture to ask about (if the open chat is about another lecture, sending starts a new chat); only one material per message is allowed. In the message box, Enter sends and Shift+Enter adds a new line. Dropped notebook cells are appended to the question, and the whole message must stay within the backend's 2000-character limit. If answering fails (e.g. 503), nothing is saved and the question stays visible with the error; a chat whose lecture was deleted can still be read but not continued. See `src/api/services/chat.js`, `src/features/workspace/useLectureChat.js` and `components/LectureChat.jsx`.

**Course materials as Study Assistant context.** Drag a material from the Course materials panel onto the Study assistant (with a mouse, drag the row itself; on touch or pen, drag the grip ⠿ that appears in the row's actions). The assistant panel is highlighted while you drag, and the material is added to the message as a removable chip showing its file name and type (PDF, PPTX, MD, IPYNB). Several materials can be added to one message; dropping one that is already there doesn't duplicate it. With the keyboard, focus the row's grip and press Enter to add the material and move to the message box. Dragging never opens, selects, moves or changes the material, and nothing is sent until you press Send. On Send the added materials are passed to `sendStudyMessage()` as the `lectureIds` to answer from (instead of the *Search in* choice), so the backend answers from those files' processed content; no file is re-uploaded, because the ask endpoint takes lecture ids, not uploads. Only materials whose processing is **Completed** can be added — one that is still processing, failed, or not a supported type (images) is refused with a message saying why. When the server has no AI assistant, materials can still be added to and removed from a draft, but Send stays disabled. See `src/features/workspace/materialContext.js`.

**Rearranging the workspace.** Course materials, the PDF viewer, the notebook and the Study assistant can each be moved by the grip (⠿) in their header. Drag the grip (mouse, touch or pen) and drop it on the highlighted edge of another section: left or right places it in a new column beside that section, top or bottom stacks it above or below. Dropping anywhere else, or pressing Escape, leaves everything where it was. Clicking the grip (or pressing Enter/Space on it) opens a *Move* menu with Move left / right / up / down and Reset layout; each move is announced to screen readers. Only the grip starts a section drag, so panel buttons, editors, text selection and notebook-cell grips behave as before. Sections are never re-created when they move (they keep their DOM node and only change CSS grid position), so the open PDF page and zoom, notebook cells, outputs and kernel, the selected material and upload list, and the assistant's messages and draft are all kept. The arrangement is saved per signed-in user in this browser's local storage (`lectra:workspace-layout:v1:<user>`); missing or invalid data falls back to the default layout. At most four columns and three sections per column are allowed; if the chosen arrangement doesn't fit the window (and always at 880px and below), the sections stack in one column in layout order and the page scrolls. The logic is in `src/features/workspace/sectionLayout.js`.

After signing in or creating an account, the student lands on the Home screen (`/workspace/home`), unless they were sent to sign-in from another page. With no uploads, Home shows the greeting (Good morning / afternoon / evening and the first name), a short introduction and *Upload materials*, centred, and no recent-uploads card. Once there are uploads, it shows the greeting and *Recent uploads* (with *Upload materials* on the right of its title): the student's real lectures, newest first, under *Today*, *Yesterday* or the date. Home has no Study assistant and no Exam button; opening a material goes to the workspace (`/workspace`). In the workspace, the menu button left of the LECTRA logo opens the Course materials menu as a drawer over the page, with the rest dimmed; clicking outside it, Escape, its close button or opening a material closes it. It is not one of the arranged sections. Home has no menu; the logo goes back to Home.

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
| `POST` | `/api/auth/forgot-password` | Request a reset email with `email` |
| `POST` | `/api/auth/reset-password` | Reset using `token` and `new_password` |

Signed-in user endpoints (all require the bearer token):

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/users/me` | Load the current profile |
| `PATCH` | `/api/users/me` | Update `full_name` and/or `email` |
| `PUT` | `/api/users/me/password` | Change password using `current_password` and `new_password` |

Changing the password from the profile page signs the user out and returns them to sign-in. The Axios client stores the access token in browser local storage and attaches it to authenticated requests. API failures are normalized to an `ApiError` with a user-facing message and any field errors.

## 8. Test, lint, and build

Run these commands from `Frontend/`:

```bash
npm test
npm run lint
npm run build
```

Vitest uses jsdom and mocked HTTP requests for normal tests. Test files are under `src/` and use `src/test/helpers.jsx` for API mocks and route rendering. jsdom has no Web Workers or WebAssembly, so `npm test` covers the notebook's kernel protocol (with a fake worker), reducer, .ipynb conversion, storage and Markdown sanitising; actually running Python must be checked in a real browser. A live auth test is optional:

```bash
npm run test:live
```

It requires the backend to be running at `http://127.0.0.1:8000` and creates a uniquely named test user. It is not part of the default `npm test` run.

Backend tests are run from `Backend/TaskGeneration/` with the backend virtual environment active:

```bash
pytest
```

The default pytest configuration excludes live provider tests. To opt in to provider-dependent tests, configure the required keys and run `pytest -m live`.

## 9. Python notebook

The centre panel at `/workspace` is a Jupyter-style notebook that runs real Python.

### How it works

- **Engine:** [Pyodide](https://pyodide.org) 314.0.7 (CPython 3.14 compiled to WebAssembly) runs in a Web Worker (`src/services/python/pyodideWorker.js`), so long-running code never freezes the page. Student code is never run with JavaScript `eval()` and never runs on the LECTRA backend.
- **Kernel:** `PythonKernel` (`src/services/python/pythonKernel.js`) owns the worker. All cells share one Python namespace until **Restart**, which replaces the worker. The kernel lives in `WorkspaceLayout`, so variables and outputs survive switching to the Exam view and back; leaving the workspace shuts it down.
- **Runtime:** `kernelRuntime.py` runs each cell, captures `print` output as it happens, shows the value of the last expression (`Out[n]`), supports `display()`, renders pandas tables as HTML and matplotlib figures as PNG (`plt.show()` or automatically at the end of the cell), and formats exceptions as Python tracebacks.
- **Packages:** see [Installing and importing packages](#installing-and-importing-packages) below.
- **Loading:** Python (~10 MB) is downloaded from `cdn.jsdelivr.net` the first time the notebook opens and then cached by the browser. If loading fails (offline, blocked CDN), the kernel shows **Unavailable** with the reason and a **Retry** button. To self-host, serve a Pyodide `full` distribution and set `VITE_PYODIDE_INDEX_URL`.

### Installing and importing packages

The notebook has no operating-system shell and no desktop `pip`: Python runs in the browser on Pyodide. Package loading goes through Pyodide's own loaders (`src/services/python/packageInstaller.js`, called from the worker), using the configured `VITE_PYODIDE_INDEX_URL` / pinned Pyodide version.

- **Imports load automatically.** Before a cell runs, packages it imports that are part of the Pyodide 314.0.7 distribution (about 350, including NumPy, pandas, SciPy, scikit-learn, matplotlib, SymPy, networkx) are downloaded with `pyodide.loadPackage`, with progress shown in the running cell. If a download fails, the cell is not run and shows a `PackageLoadError` naming the package and the reason; run the cell again to retry.
- **Installing other packages.** These LECTRA notebook commands are recognised in code cells (`src/services/python/cellCommands.js`):

  | Command | Meaning |
  | --- | --- |
  | `%pip install name …` | Install packages (preferred spelling) |
  | `!pip install name …`, `!pip3 …`, `%pip3 …`, `!python -m pip install …` | The same |
  | Options `-q`/`--quiet`, `-U`/`--upgrade`, `--pre`, `--no-deps` | Quiet output, reinstall, allow pre-releases, skip dependencies |
  | `%matplotlib inline` | Accepted and ignored (figures are always inline) |

  Names may carry versions and extras (`"pandas>=2"`, `requests[socks]`) or be an `https://….whl` URL. A plain name of a Pyodide package loads that build; anything else is installed from PyPI with `micropip`, which can only install **pure-Python wheels or wheels built for this Pyodide version**. The line runs in order with the rest of the cell, shows `Successfully installed …` (or `Requirement already satisfied: …`) only after the install really finished, and the package can be imported in that cell or any later one.
- **Not supported:** other shell commands (`!ls`, `!python …`), other magics, `pip uninstall`/`list`, requirements files (`-r`), custom indexes and shell syntax (`;`, `&&`, `|`, `$var`). These stop the cell with a `UsageError` explaining what is supported. Nothing is ever passed to a shell, to JavaScript `eval()` or to the backend.
- **Errors are specific** (`PackageInstallError`): no browser build exists (e.g. `torch`, which is not in the Pyodide distribution and has no pure-Python wheel — the message suggests packages that do run here or a native Python environment), the name is not on PyPI, PyPI/the CDN could not be reached (retry by running the cell again), or another failure, always with the underlying error under *Details*.
- **Missing imports:** importing a module that is not installed gives a `ModuleNotFoundError` that names the module and explains how to install it with `%pip install` if it is compatible.
- **Restart** clears installed packages along with variables; run the `%pip install` cell again afterwards. Packages bundled with Pyodide load again automatically on import.

### Features

- Code cells (CodeMirror 6: Python highlighting, line numbers, auto-indent, bracket matching, keyword/name autocomplete) and Markdown cells (headings, emphasis, lists, links, tables, `$math$` via KaTeX). Raw cells from imported files are kept.
- Per cell: Run, move up/down, delete, and a menu with insert above/below, duplicate, convert code↔Markdown and clear output.
- **Cells as Study Assistant context:** drag a cell by the grip (⠿) at the left of its header and drop it anywhere on the Study Assistant panel; the panel and message box are highlighted while you drag. Touch and pen drags work on the grip too, and with the keyboard, focus the grip and press Enter or Space to add the cell and move to the message box. There is no menu action or dialog for this. The cell — code, Markdown or raw — appears above the message box as a removable card labelled by type and position (e.g. *Python cell 3*), with its complete source; each added cell is a separate item. Adding a cell never runs or changes it and never sends anything — the message is only sent when you press Send. On send, the cells are passed to `sendStudyMessage()` as structured `notebookCells` (see `src/services/studyAssistant.js`); because the backend's ask endpoint has no field for them, they are appended to the question as a marked "Notebook context" block with their full source. They are cleared from the draft once the answer arrives and kept if sending fails. When the server has no AI assistant, cells can still be added to a draft, but sending is disabled and nothing is answered.
- Toolbar: editable title, save state, kernel status (Loading / Idle / Busy / Error / Unavailable), add code/Markdown cell, Run all, Stop, Restart (with confirmation), Clear outputs, **Download .ipynb** (disabled while the notebook is empty), and File → New notebook / Import .ipynb. There is no Save button: saving is automatic (Ctrl/⌘ + S saves immediately).
- **Run all** runs code cells in order on the same kernel and stops at the first error, like Jupyter.
- Opening a `.ipynb` (File → Import, or a notebook added through *Upload materials* and selected in the materials list) replaces the current notebook after confirmation and starts a fresh kernel. Import/export follow nbformat 4 (exported as 4.5), preserving cell order, types, ids, metadata and outputs.
- Markdown and HTML outputs are sanitised with DOMPurify (no scripts, event handlers or `<style>`), and links open in a new tab.

| Shortcut | Action |
| --- | --- |
| Shift + Enter | Run the cell (or render Markdown) and move to the next cell, creating one at the end |
| Ctrl/⌘ + Enter | Run the cell in place |
| Ctrl/⌘ + S | Save the notebook |
| Escape | Leave the editor (command mode); closes autocomplete first if it is open |
| Enter (command mode) | Edit the selected cell |
| ↑ / ↓ (command mode) | Select the previous / next cell |
| Delete (command mode) | Delete the selected cell (asks first unless the cell is empty) |

### Saving

The notebook is saved automatically one second after each change (code or Markdown edits, adding, deleting or moving cells, renaming), and immediately on Ctrl/⌘ + S, to the browser's **local storage**, keyed by the signed-in user's id (`lectra:notebook:v1:<user id>`). It is **not sent to the backend**: it is not available on other devices or browsers and is lost if site data is cleared. Download the `.ipynb` to keep a copy. If storage is full (large image outputs), the toolbar shows the error rather than claiming the notebook was saved.

### Limits and safety

- Each cell may run for at most 2 minutes (`EXECUTION_TIMEOUT_MS`); then it is stopped with a `TimeoutError`.
- **Stop / timeouts:** a real `KeyboardInterrupt` that keeps variables requires the page to be cross-origin isolated (COOP/COEP headers, enabling `SharedArrayBuffer`). The dev server does not send these headers, because they would also restrict the Google Fonts stylesheet and embedded PDF previews; so by default Stop terminates the worker and restarts Python, which clears variables. The cell's output says so.
- `input()` is not supported (cells have no interactive console); it raises a `RuntimeError` explaining this.
- Printed output is capped at 500,000 characters per cell run; the cell keeps running and the output notes the truncation.
- The worker cannot read the page, its DOM, local storage or the sign-in token. Python can make network requests from the browser (e.g. `pyodide.http`), like any web page; it cannot access the backend with the student's credentials.
- Browser-based Python covers teaching use well but is slower than native Python, and packages with native code are limited to those built for Pyodide (see *Installing and importing packages*). Package installs count towards a cell's 2-minute limit.

## 10. Demo behavior and current boundaries

- Statistics are illustrative data. There are no sample course materials.
- Course materials are stored by the backend. The study assistant and AI processing need the AI-enabled backend (see the course-materials section).
- Notebooks are saved in browser local storage only (see section 9), not on the backend.
- Profile details and password changes persist through the user API; a successful password change signs the user out. Account preferences are local-only because no preferences endpoint is currently implemented.
- The study assistant UI is present, but its service may report that it is not connected.
- The task-generator router is currently scaffolded without endpoint implementations.

Check the relevant service and feature before assuming a UI is backed by a persistent API.

## 11. Change and documentation workflow

1. Make changes in the relevant feature or service; keep cross-cutting API behavior in the shared client/service layer.
2. Add or update tests alongside behavior changes.
3. Run the relevant tests, then `npm run lint` and `npm run build` for frontend changes; run `pytest` for backend changes.
4. If a change affects setup, commands, environment variables, routes, APIs, validation rules, dependencies, security-sensitive behavior, or demo/production boundaries, update the corresponding README and INSTRUCTIONS guide in the same change.
5. If a cross-project change affects how the frontend and backend work together, update both projects' docs.
6. Never add real secrets to examples or documentation.

Project Copilot instructions in `.github/copilot-instructions.md` reinforce this documentation-maintenance rule for future coding-agent changes.

## Deploying on Vercel

This is a single-page app: `vercel.json` rewrites every path to `index.html` (real files such as `/assets/*` are still served first), so links like `/workspace?lecture=<id>` work when pasted into a new tab or reloaded instead of returning Vercel's 404.
