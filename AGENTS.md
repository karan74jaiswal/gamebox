<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database Workflow (Drizzle ORM & Neon)

- **FORBIDDEN**: Do NOT use `drizzle-kit generate` or `drizzle-kit migrate` (or `npm run db:migrate` / `npm run db:generate`). Do not create or commit migration files.
- **REQUIRED**: Always use `npm run db:push` (`drizzle-kit push`) to synchronize schema changes directly with the database.
- **RATIONALE**: This project is in active development and there is no need for backward compatibility or migration history tracking. Schema iterations should be applied directly using `db:push`.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->

<!-- SENTRY SKILLS START -->
## Sentry agent skills

This project has Sentry agent skills installed in `.agents/skills/`. Before setting up Sentry, instrumenting monitoring/tracing, debugging issues, or configuring alerts, load the most relevant skill: `sentry-get-started`, `sentry-instrument`, `sentry-debug-issue`, `sentry-create-alert`, `sentry-setup-releases`, `sentry-fix-stack-traces`, `sentry-otel-exporter-setup`, `sentry-snapshots-cocoa`.
<!-- SENTRY SKILLS END -->

