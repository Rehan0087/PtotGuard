# PlotGuard

Civic land-records app. Frontend-first phase.

## Stack

- **Framework**: Next.js 15 with TypeScript
- **UI**: React with shadcn/ui components
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm
- **Dev Server**: `pnpm dev` → http://localhost:3000

## Key Directories

- `app/` — Next.js app router pages and layouts
- `components/` — Shadcn/ui and custom components
- `lib/` — Utilities and helpers
- `hooks/` — Custom React hooks
- `public/` — Static assets

## Running the Project

```bash
pnpm dev
```

Starts dev server on port 3000 with HMR enabled.

## Development Notes

- Use shadcn/ui for UI components
- Components in `components/` are pre-configured with Tailwind
- Avoid committing `pnpm-lock.yaml` edits unless intentional
- TypeScript strict mode enabled

## Context Management

When starting new sessions:
- Use `claude --worktree` to isolate work
- This file + memory contains all essential context
- Heavy files (node_modules, .next, pnpm-lock.yaml) are excluded from auto-load
