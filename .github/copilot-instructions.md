# Frontend Project Instructions

- Read [`README.md`](../README.md) for the overview and [`INSTRUCTIONS.md`](../INSTRUCTIONS.md) for setup, routes, APIs, validation, and testing.
- When a change affects setup, commands, dependencies, environment variables, routes, API contracts, validation rules, security-sensitive behavior, or demo/production boundaries, update both frontend docs in the same change.
- For frontend/backend integration changes, also update `../Backend/TaskGeneration/README.md` and `../Backend/TaskGeneration/INSTRUCTIONS.md`.
- Keep examples accurate, do not document real secrets, and preserve the distinction between demo-only frontend features and backend-persisted behavior.
- For frontend changes, run the focused tests plus `npm run lint` and `npm run build`; run `npm test` when shared form, auth, routing, or app-wide behavior changes.
