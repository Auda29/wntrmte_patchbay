# Patchbay Dashboard

Next.js web dashboard for Patchbay — the central control panel for AI-assisted development workflows.

## Pages

| Route | Description |
|-------|------------|
| `/` | Project overview — stats, goal, tech stack, recent runs, project rules |
| `/tasks` | Kanban board (open / in_progress / blocked / review / done) with dispatch and status controls |
| `/runs` | Run history — expandable logs, summaries, diffs, blockers, suggested next steps |
| `/artifacts` | File browser — context files + diff references with preview pane and auto diff detection |
| `/decisions` | Decision log — searchable, with New Decision modal |

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET | Full project state (project, tasks, runs, decisions) |
| `/api/tasks` | POST | Create a new task |
| `/api/tasks` | PATCH | Update task status |
| `/api/runs` | GET | List runs (optional `?taskId=` filter) |
| `/api/runs` | POST | Save a run |
| `/api/dispatch` | POST | Dispatch a task to a runner |
| `/api/agents` | GET | List available runners |
| `/api/decisions` | POST | Create a decision |
| `/api/artifacts` | GET | List context files and diff references |
| `/api/events` | GET | SSE stream — real-time file change notifications |

## Development

```bash
# From the dashboard package directory
PATCHBAY_REPO_ROOT=/path/to/your/repo npm run dev
# → http://localhost:3000
```

`PATCHBAY_REPO_ROOT` must point to a repo with a `.project-agents/` directory.

## Stack

- Next.js + Tailwind CSS
- SWR for client-side data fetching (2s polling)
- SSE Event Bus (`/api/events`) for push-based live updates via `fs.watch`
