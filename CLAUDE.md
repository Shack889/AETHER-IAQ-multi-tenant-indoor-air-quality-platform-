```markdown
# AETHER-IAQ Project

## Overview
Indoor Air Quality monitoring system — 9-layer algorithm stack,
React/Next.js frontend, Node.js/Express backend.

## Specification
Read AETHER_CLAUDE_CODE_PROMPT.md for the complete build specification.
Follow it section by section in the order specified (Section 13: Build Order).

## Tech Stack
- Frontend: Next.js 14+, TypeScript, Tailwind CSS, Framer Motion, Recharts
- Backend: Express.js, TypeScript, Prisma, PostgreSQL, Socket.io, mqtt.js
- Auth: NextAuth.js with Google OAuth
- Deployment: Vercel (frontend) + Railway (backend)

## Commands
- `cd apps/web && npm run dev` — Start frontend dev server
- `cd apps/server && npm run dev` — Start backend dev server
- `npm run build` — Build all packages

## Conventions
- TypeScript strict mode, no `any` types
- Framer Motion for all animations (GPU-accelerated only: transform, opacity)
- All algorithms run server-side, frontend is display only
- Dark/light theme toggle using CSS custom properties
```
