# Repository Guidelines

## Project Structure

This is a React 19 + TypeScript application built with Vite. Application code is under `src/`:

- `src/App.tsx` — application shell, navigation, persistence, import/export, and shared notifications.
- `src/components/` — UI managers and schedule views, including `SwipeableToast`.
- `src/utils/` — schedule generation, diagnostics, local repair, default data, and export helpers.
- `src/types/` — shared TypeScript domain models.
- `src/index.css` — global styles and print rules.

There is currently no dedicated test directory or test runner. Build output is generated in `dist/` and should not be edited manually.

## Development Commands

Run these from the repository root:

```bash
npm install        # install dependencies
npm run dev        # start Vite development server on port 3000
npm run lint       # type-check with tsc --noEmit
npm run build      # create a production build
npm run preview    # serve the production build locally
npm run clean      # remove generated dist/server.js artifacts
```

Run `npm run lint` and `npm run build` before submitting changes.

## Coding Style & Naming

Use TypeScript and React functional components. Match the existing two-space indentation, semicolons, single quotes, and trailing commas. Name components in PascalCase (`DiagnosticsPanel.tsx`), functions and variables in camelCase, and types/interfaces in PascalCase. Keep domain types in `src/types/`, and keep scheduling logic in `src/utils/` rather than embedding it in UI components. Reuse existing Tailwind utility patterns and shared icons/toasts.

## Testing Guidelines

No automated test framework is configured. For behavior changes, manually exercise the affected screen and verify schedule generation, diagnostics, import/export, and undo behavior as applicable. At minimum, run the type-check and production build commands above.

## Commit & Pull Requests

No Git history is included in this working copy, so no established commit convention can be inferred. Use concise imperative messages, for example `Fix constraint repair toast`. Pull requests should explain the user-visible change, identify affected areas, include validation commands and results, and attach screenshots or a short recording for UI changes. Mention any known scheduling trade-offs or unsatisfiable constraints.

## Configuration & Safety

Keep secrets in `.env.local`; use `.env.example` as the template. Do not commit API keys, generated `dist/` files, `node_modules/`, or local schedule data. Changes to the scheduler must preserve hard constraints, avoid student gaps, and report unsatisfiable cases instead of silently relaxing rules.
