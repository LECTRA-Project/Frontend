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
| `/workspace` | Chat-first workspace: a new chat in the centre | Signed in |
| `/workspace?chat=<id>&lecture=<id>` | That chat, with that lecture open in the viewer (either part alone works too, and `/workspace/exam?…` keeps them across the Exam view). The link can be copied, reloaded or shared; Back goes to the previous chat or closes the viewer. An id the student doesn't have shows a notice and is dropped. | Signed in |
| `/workspace/exam` | Exam view in place of the chat: the setup step (see *The exam* below) | Signed in |
| `/workspace/exam?exam=<id>` | That exam: its progress while generating, its questions, or its results once submitted (with `chat` / `lecture` kept as above). An exam the student doesn't have shows a notice and the setup. | Signed in |
| `/workspace/home` | Home screen (where signing in and sign-up land) | Signed in |
| `/profile` | Profile and password fields | Signed in |
| `/settings` | Account preferences | Signed in |
| `/statistics` | Sample performance statistics | Signed in |

Unknown routes redirect to sign-in. Reset links remain accessible when a browser already has an authenticated session. The reset token must be present in the emailed URL to bootstrap the flow; after the app captures it, the URL is replaced with `/reset-password` before rendering.

**The chat-first workspace.** Under the header the page is: menu | chat | [notebook] | [material viewer].

- **The chat** is always centred, at most 760 px wide, with the message box the same width under it. A new chat shows *What are we studying today?* and *Upload materials*.
- **The menu** on the left (272 px, collapsible to a 64 px icon rail) has *New chat*, the materials of the open chat, and the chats grouped by their last activity (Today, Yesterday, Previous 7 days, Older). At 760 px and below it is an overlay opened from the header's menu button; when the full menu does not fit beside the chat and the viewer, it collapses to the rail and opens as an overlay. Each chat's ⋯ menu has *Remove*, which asks for confirmation and then deletes the chat and its messages (`DELETE /chat/sessions/{id}`; its materials are kept); removing the open chat leaves an empty new chat.
- **Materials belong to a chat.** A new chat has none. Upload attaches the new lectures to the open chat only (a new chat is created with them), *Add one of your materials* attaches a lecture already uploaded, and × removes it from this chat only. Switching chats switches the materials and closes the viewer.
- **Library management.** Each material's ⋯ menu has *Rename* (`PATCH /lectures/{id}` with `{title}`; the backend stores only the title) and *Delete from library*, which asks for confirmation and then deletes the lecture for good (`DELETE /lectures/{id}`): it leaves every chat that used it, while the chats and their messages are kept. A material whose processing failed has a retry button (`POST /lectures/{id}/reprocess`). With a mouse, ⋯ and × show when the row is hovered or focused.
- **The material viewer** is docked at the right edge. It opens from a material or from a source chip under an answer, at the cited page, slide or cell, which is highlighted (with *Opened from a source in the answer*) until the student moves on. It has page / slide / cell navigation (for PDFs also First / Last page and a *Pages* sidebar of page previews to jump to any page, open by default when the viewer is at least 600 px wide; the current page is highlighted and a cited page is marked), zoom, open in a new tab or download, and close. Until resized it takes 55% of the room beside the menu (at least 560 px); its left edge resizes it (drag, the arrow keys, double-click to reset to that automatic width); the chat always keeps at least 380 px. PDFs show the real file (`GET /lectures/{id}/file`), drawn with **pdf.js** (`pdfjs-dist`, loaded only when a PDF is opened; `src/features/files/PdfPages.jsx`) like Chrome's PDF viewer: all pages in one scrolling column, sharp at any zoom (Fit to the width, or 50–200 % of the real size), with selectable text, and thumbnails in the sidebar. If pdf.js can't open a file, the browser's own PDF viewer shows it in a frame instead. The viewer's *Widen* button widens it as far as the chat allows and *Restore* goes back to the automatic width; slides, notebooks and images show the extracted content (`GET /lectures/{id}/content`); a notebook can also be opened in the runnable notebook.
- **The notebook** is hidden until the header's *Notebook* button is pressed. It floats over the chat (left of the viewer), or is pinned beside the chat when there is room; it can be resized, widened and closed, and keeps its cells and kernel while closed. At phone width the viewer and the notebook open full-screen.
- **The URL** holds the open chat and the material in the viewer (see the routes table), so a reload or a shared link opens the same chat and material.

Uploads accept exactly the file types the backend accepts: PDF, PPTX, IPYNB and images (PNG, JPG, JPEG, GIF, WEBP), up to 100 MB each. Markdown and `.ppt` files are refused in the dialog, because the backend answers `422` for them. Each file becomes a lecture titled after its file name; there is no course or description, since the backend does not store them.

On load the app checks which backend it talks to (`GET /api/student_profile/lectures/<zero-uuid>`: 404 = AI-enabled backend, 405 = backend without AI processing):

- **Backend without AI processing** (the current Render deployment): files open from the lecture's S3 URL. PowerPoint slides open in Microsoft's Office Online viewer (`view.officeapps.live.com`), which loads the file's public S3 URL on Microsoft's side; this needs the S3 objects to stay publicly readable, and the file URL is shared with Microsoft for rendering. Download stays available. Opening a notebook downloads it from S3 in the browser, so the bucket's CORS rule must allow the frontend's origin; otherwise the app offers a download instead.
- **AI-enabled backend**: additionally processing status with retry, extracted slide / notebook text in the viewer, and answers with clickable page / slide / cell sources.

**Chats (Lecture Chat API).** A second probe, `GET /api/student_profile/chat/sessions?page_size=1`, detects the chat API (200 = available). Without it the chat says it is not available and nothing can be sent. A chat is a session with any number of lectures (`lectures` in the session payload): the first question or the first material creates it (`POST /chat/sessions` with `lecture_ids`, possibly empty), `POST /chat/sessions/{id}/lectures` and `DELETE /chat/sessions/{id}/lectures/{lecture_id}` attach and detach materials, and `POST /chat/sessions/{id}/messages` asks. The backend names the chat after its first question; the chat's ⋯ menu renames (`PATCH`) or deletes it (`DELETE`, with confirmation; its materials are kept). Answers render as Markdown. Sources (`[{lecture_id, lecture_title, page_number, source_type, location}]`) become chips such as "p. 12 · KI 02", "Slide 3" or "Cell 16", showing the lecture's current title; an answer without sources is general knowledge and is marked *Not from your materials*. In the message box, Enter sends and Shift+Enter adds a new line. Dropped notebook cells are appended to the question as a marked "Notebook context" block, and the whole message must stay within the backend's 2000-character limit. If answering fails, nothing is saved and the question stays visible with the error; a question that times out is looked up again, since the backend may still save the answer. See `src/api/services/chat.js`, `src/features/workspace/useLectureChat.js`, `pages/ChatPage.jsx` and `components/ChatSidebar.jsx`. The panel widths are worked out in `src/features/workspace/chatLayout.js`.

### The exam

The header's *Exam* (not on Home) replaces the chat with the Exam view. Its code is in `src/features/exam/` (`ExamSetup`, `ExamGenerating`, `ExamQuestions`, `ExamReview`, `ExamSubmitDialog`, `ExamGrading`, `ExamResults`, the `useExam` and `useUnfinishedExams` hooks), `src/features/workspace/pages/ExamPage.jsx` (the steps and the URL), `src/api/services/exams.js` and `src/services/exam/examStorage.js`.

- **Setup.** The open chat's materials are listed as checkboxes, all preselected; a chat without materials offers the student's library with nothing preselected. Materials still processing, failed or without readable text (images) can't be picked. The student chooses 3, 5, 7 or 10 questions and the types (multiple choice, short answer; at least one), then *Generate exam* (`POST /api/exams`). A `409` (another exam is still being generated) offers *Open that exam*; a `422` shows the backend's message, which names the material without text.
- **Continue an exam.** Above the setup, the exams being generated or ready to answer (`GET /api/exams`) can be continued or discarded (`DELETE /api/exams/{id}`, after a confirmation; the answers saved on the device are removed too).
- **Generating.** "2 of 5 questions ready", from `GET /api/exams/{id}` every 2 s while `status` is `generating`; the questions show as soon as the exam is ready. A `failed` exam shows its `error` with *Retry* (a new exam with the same settings; the failed one is discarded) and *Back*.
- **Questions.** One at a time, with Previous / Next, a question map (answered or not; click to jump) and "3 of 5 answered". Multiple choice is graded per choice, so any number of choices can be selected (*Select every correct answer*); a short answer is at most 4000 characters. On the last question *Finish* opens a review of every question, answered or not, where a click jumps back to it.
- **Submit.** The review's *Submit and check* asks first. The confirmation names the questions without an answer ("Questions 2 and 4 are not answered yet and will get 0 points") and *Answer them first* / *Answer question N* goes back to the first of them. Submitting (`POST /api/exams/{id}/submit`, only non-empty answers are sent) shows "Checking your answers…" until the backend has graded every answer (a few seconds per short answer; the request may take minutes). On success the answers saved on the device are removed (the start settings stay, for the next point) and the results are read (`GET /api/exams/{id}`). A `409` or `422` shows the backend's message in the review; when a `409`, a timeout or a network error turns out to belong to an exam that is submitted anyway, its results are shown.
- **Results** (Step 3 of 3). A score ring with the percentage and "6 of 9 points", and how many answers are correct, partly correct and wrong. If `questions_ungraded > 0` the total is unknown: the page says some answers are still waiting to be graded and offers *Grade again* (`POST /api/exams/{id}/regrade`, then the exam is read again; a `409` "nothing left to grade" just refreshes). One card per question: the verdict (or *Not answered* / *Waiting to be graded*), points out of the maximum, *Your answer* next to *Correct answer* (the chosen choices, each marked right or wrong, vs. `correct_choice_ids`; or the text vs. `reference_solution`), the feedback (Markdown), *Points per criterion* (description, points / max, justification), and a lecturer's correction with its comment. Under it, the pages the question came from, per lecture: each opens that page / slide / cell in the viewer beside the exam ("Opened from a source in the exam results: page 12"); a page of a deleted lecture (`lecture_id: null`) is plain text. A submitted exam opened by `?exam=<id>` shows its results.
- **New exam on the same materials.** Opens the setup with that exam's lectures chosen, and its number of questions and types (from the settings saved on this device, else from the exam). If a lecture isn't in the open chat the library is offered instead; deleted lectures are left out with a note.
- **Saved on the device.** The answers and the question on screen are kept in local storage per signed-in user and exam (`lectra:exam:v1:<user id>:<exam id>`), with the settings the exam was started with (for *Retry* and *New exam on the same materials*), so a reload or leaving the page doesn't lose them. They are not on the server until the exam is submitted, and are not available on another device. If storage is unavailable or full, the page says so and works on without it.
- **URL.** `?exam=<id>` sits next to `?chat=` / `?lecture=`; *Back to chat* returns to the same chat, and opening a material beside the exam keeps the exam.

After signing in or creating an account, the student lands on the Home screen (`/workspace/home`), unless they were sent to sign-in from another page. With no uploads, Home shows the greeting (Good morning / afternoon / evening and the first name), a short introduction and *Upload materials*, centred, and no recent-uploads card. Once there are uploads, it shows the greeting and *Recent uploads* (with *Upload materials* on the right of its title): the student's real lectures, newest first, under *Today*, *Yesterday* or the date. A file uploaded from Home shows under *Today* with its progress and then *Processing…* until the server answers; a failed upload shows its error and can be dismissed. Materials still processing or failed say so. Home has no chat and no Exam button; opening a material goes to the open chat (`/workspace?chat=…&lecture=…`) with the material in the viewer. The logo goes back to Home.

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
- **Cells as chat context:** drag a cell by the grip (⠿) at the left of its header and drop it anywhere on the chat; the chat and message box are highlighted while you drag. Touch and pen drags work on the grip too, and with the keyboard, focus the grip and press Enter or Space to add the cell and move to the message box. The cell — code, Markdown or raw — appears above the message box as a removable card labelled by type and position (e.g. *Python cell 3*), with its complete source. Adding a cell never runs or changes it and never sends anything. On send, the chat API takes plain text only, so the cells are appended to the question as a marked "Notebook context" block with their full source (`withNotebookContext` in `src/services/notebook/cellContext.js`). They are cleared from the draft once the answer arrives and kept if sending fails. In the chat, the question shows each added cell as a code card (label, notebook, line count and full source; cells longer than 12 lines start folded); a reopened chat shows its saved cells the same way (`parseNotebookContext`). The backend names a chat after the full question, so the notebook block is left out of displayed chat titles (`displayChatTitle`).
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
- Lecture materials are stored by the backend. Processing status, extracted content and sourced answers need the AI-enabled backend (see section 5).
- Notebooks are saved in browser local storage only (see section 9), not on the backend.
- Exam answers are kept in browser local storage until the exam is submitted; after that the answers and results come from the backend. A submitted exam stays in the history and can't be deleted.
- Profile details and password changes persist through the user API; a successful password change signs the user out. Account preferences are local-only because no preferences endpoint is currently implemented.
- The chat needs the backend's chat API; without it the chat says it is not available.
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

This is a single-page app: `vercel.json` rewrites every path to `index.html` (real files such as `/assets/*` are still served first), so links like `/workspace?chat=<id>&lecture=<id>` work when pasted into a new tab or reloaded instead of returning Vercel's 404.
