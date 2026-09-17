# Nirmaan — Build-to-Hire Platform

> An AI-driven ecosystem that scans who you are, tells you what you can become, and gives you the tools to build your way into a job.

---

## Table of Contents

- [What is Nirmaan](#what-is-nirmaan)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [External Services Setup](#external-services-setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running Locally](#running-locally)
- [Feature Overview](#feature-overview)
- [API Reference](#api-reference)
- [Key Design Decisions](#key-design-decisions)
- [What's Not Built Yet](#whats-not-built-yet)
- [Common Issues](#common-issues)

---

## What is Nirmaan

Nirmaan is a **Build-to-Hire** platform for students entering tech. It solves the "student clarity crisis" — students who know some coding but don't know what to build, what role to target, or how to get a job.

**The user journey:**
1. **Scan** — Upload GitHub, LinkedIn PDF, or take a manual quiz → get a Skill DNA (role, level, skill scores)
2. **Build** — Pick from 3 AI-suggested projects → build inside a 3-pane Studio (roadmap + Monaco editor + AI copilot)
3. **Deploy** — One-click deploy + GitHub push + LinkedIn post
4. **Apply** — Internship feed auto-matches their stack; job match % updates after every project

---

## Architecture Overview

```
Browser
  │
  ├── Next.js 16 (frontend) — localhost:3000
  │     ├── Supabase JS client (auth, direct DB reads)
  │     └── All other data → FastAPI backend
  │
  └── FastAPI (backend) — localhost:8000
        ├── Supabase Python client (service role — bypasses RLS)
        ├── Groq (Llama 3.3 70B) — AI analysis, copilot, PSI
        ├── MongoDB Atlas — project roadmaps, code files
        └── JSearch via RapidAPI — internship listings
```

**Auth flow:** Supabase handles all auth (email/password + GitHub OAuth). After login, the frontend gets a JWT. Every backend request sends this JWT in the `Authorization: Bearer` header. The backend verifies it using the Supabase service role key.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | Next.js | 16.1.6 |
| Frontend language | TypeScript + React | 19.2.3 |
| Styling | Tailwind CSS | v4 |
| Code editor | Monaco Editor | 4.7.0 |
| State management | Zustand | 5.0.12 |
| Animations | Framer Motion | 12.38.0 |
| Backend framework | FastAPI | latest |
| Backend language | Python | 3.11+ |
| AI model | Groq — Llama 3.3 70B | latest |
| Auth + user DB | Supabase (PostgreSQL) | latest |
| Project/roadmap DB | MongoDB Atlas | latest |
| Job listings | JSearch API (RapidAPI) | latest |
| PDF parsing | PyMuPDF (fitz) | latest |
| GitHub data | GitHub REST API v3 | latest |

---

## Project Structure

```
Nirmaan/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx                          ← Landing page
│       │   ├── (auth)/login/page.tsx             ← Login (email + GitHub OAuth)
│       │   ├── auth/callback/route.ts            ← GitHub OAuth callback handler
│       │   ├── (app)/scanner/page.tsx            ← Scanner (3 input modes)
│       │   ├── (app)/scanner/results/page.tsx    ← Skill DNA + project selection
│       │   ├── (app)/studio/[projectId]/page.tsx ← 3-pane coding workspace
│       │   ├── (app)/dashboard/page.tsx          ← User home dashboard
│       │   └── (app)/internships/page.tsx        ← Matched job listings
│       ├── components/
│       │   ├── scanner/                          ← GithubTab, PdfTab, ManualTab, etc.
│       │   └── studio/                           ← AdaptiveRoadmap, CodeEditor, CopilotPane,
│       │                                            InstructionPanel, PsiModal, DeployModal
│       ├── lib/                                  ← ⚠️ gitignored — create manually (see below)
│       │   ├── api.ts                            ← All fetch calls to FastAPI
│       │   ├── types.ts                          ← All TypeScript interfaces
│       │   ├── supabaseClient.ts                 ← Browser Supabase client
│       │   └── utils.ts                          ← cn() tailwind helper
│       ├── store/studioStore.ts                  ← Zustand store for Studio state
│       └── middleware.ts                         ← Route protection
│
├── backend/
│   ├── main.py                                   ← FastAPI app + CORS
│   ├── routers/
│   │   ├── scanner.py                            ← /scanner/github, /pdf, /manual
│   │   ├── analyzer.py                           ← /analyzer/analyze
│   │   ├── studio.py                             ← /studio/* (init, copilot, PSI, deploy)
│   │   ├── jobs.py                               ← /jobs/search
│   │   └── dashboard.py                          ← /dashboard/summary
│   ├── services/
│   │   ├── groq_service.py                       ← All Groq API calls
│   │   ├── github_extractor.py                   ← GitHub REST API
│   │   ├── pdf_extractor.py                      ← PyMuPDF + Groq
│   │   ├── manual_processor.py                   ← Quiz answers → structured data
│   │   ├── jobs_service.py                       ← JSearch + 6h Supabase cache
│   │   └── supabase_client.py                    ← Supabase reads/writes + JWT verify
│   ├── models/project.py                         ← Pydantic models for MongoDB
│   ├── db/
│   │   ├── mongo_client.py                       ← MongoDB connection
│   │   └── supabase_schema.sql                   ← Full DB schema — run this first
│   └── requirements.txt
```

---

## Prerequisites

Before you start, make sure you have these installed:

- **Python 3.11+** — `python --version`
- **Node.js 18+** — `node --version`
- **npm 9+** — `npm --version`
- **Git** — `git --version`

You also need accounts on these services (all have free tiers):

- [Supabase](https://supabase.com) — auth + PostgreSQL
- [MongoDB Atlas](https://cloud.mongodb.com) — project roadmaps storage
- [Groq](https://console.groq.com) — AI model API
- [RapidAPI / JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) — internship listings

---

## External Services Setup

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** — copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** key → `SUPABASE_SERVICE_KEY` (click "Reveal")
3. Enable GitHub OAuth: **Authentication → Providers → GitHub**
   - You need a GitHub OAuth App (see below)
   - Set the callback URL to: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
4. Run the full schema SQL (see [Database Setup](#database-setup))

### 2. GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. New OAuth App:
   - **Homepage URL**: `http://localhost:3000`
   - **Callback URL**: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
3. Copy **Client ID** and **Client Secret** → paste into Supabase GitHub provider settings

### 3. MongoDB Atlas

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database named `nirmaan`
3. Create a user with read/write access
4. Get the connection string: **Connect → Connect your application → Python**
5. Format: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`
6. Paste into `MONGODB_URI`

### 4. Groq

1. Get an API key at [console.groq.com](https://console.groq.com)
2. Paste into `GROQ_API_KEY`
3. The model used is `llama-3.3-70b-versatile` — free tier is sufficient for development

### 5. JSearch (RapidAPI)

1. Go to [rapidapi.com](https://rapidapi.com) → search "JSearch"
2. Subscribe to the **Basic** plan (500 requests/month free)
3. Copy your `X-RapidAPI-Key` from the API playground → paste into `JSEARCH_API_KEY`
4. Note: The app caches job results for 6 hours in Supabase to conserve your quota

---

## Environment Variables

### backend/.env

Create this file in the `backend/` directory:

```env
# Supabase — use SERVICE ROLE key here (not anon key)
SUPABASE_URL=https://abcdefghijkl.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Groq AI
GROQ_API_KEY=gsk_...

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=nirmaan

# JSearch (RapidAPI) — for internship listings
JSEARCH_API_KEY=your_rapidapi_key_here

# Optional: your personal GitHub token for higher API rate limits (5000 req/hr vs 60)
GITHUB_TOKEN=ghp_...
```

### frontend/.env.local

Create this file in the `frontend/` directory:

```env
# Supabase — use ANON key here (not service role key)
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> ⚠️ **Common mistake:** The frontend uses the **anon** key. The backend uses the **service role** key. Never swap them. The service role key bypasses all row-level security — never expose it to the browser.

---

## Database Setup

### Step 1 — Run the full Supabase schema

Open **Supabase Dashboard → SQL Editor** and run the entire contents of `backend/db/supabase_schema.sql`.

This creates:
- `user_profiles` table with RLS policies
- Auto-trigger to create a profile row when a user signs up
- `increment_xp()` RPC function used when a Studio step is completed
- `jobs_cache` table with unique index on `role`

You only need to run this once. If you've already run an older version, run this to add the `full_name` column:

```sql
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS full_name TEXT;
```

### Step 2 — MongoDB

No manual setup needed. MongoDB collections are created automatically when the first document is inserted. The `projects` collection in the `nirmaan` database is created when a user selects their first project in the Scanner.

---

## The `src/lib/` Directory (gitignored)

The `frontend/src/lib/` folder is in `.gitignore` to prevent accidental exposure of patterns that reference env vars. **Every teammate needs to create these 4 files manually.**

### `frontend/src/lib/supabaseClient.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### `frontend/src/lib/utils.ts`
```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

For `api.ts` and `types.ts`, copy them from the shared team drive / ask the lead — they contain all the API functions and TypeScript interfaces for the full platform.

---

## Running Locally

### Backend

```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# Mac / Linux
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Make sure backend/.env exists with all variables filled in

# 5. Start the server
uvicorn main:app --reload --port 8000
```

The API will be running at `http://localhost:8000`.
Verify it works: open `http://localhost:8000/health` — should return `{"status": "ok"}`.
Interactive API docs: `http://localhost:8000/docs`

### Frontend

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Make sure frontend/.env.local exists with all variables filled in

# 4. Make sure src/lib/ files are created (see section above)

# 5. Start the dev server
npm run dev
```

The app will be running at `http://localhost:3000`.

> ⚠️ **Both servers must be running at the same time.** The frontend calls the backend on every page. If the backend is down, you'll see 401/network errors throughout the app.

---

## Feature Overview

### Scanner (`/scanner`)

Three input modes — the system detects which one to show based on how the user logged in:

| Mode | When shown | What it does |
|---|---|---|
| GitHub (auto) | GitHub OAuth users | Token already saved — fetches repos automatically on page load |
| GitHub URL | Email users | User pastes their GitHub URL, backend uses public API |
| PDF Upload | All users | Accepts LinkedIn or resume PDF up to 10MB, PyMuPDF extracts text, Groq structures it |
| Manual Quiz | All users | 8 questions about skills, experience, domain, goals |

After scanning, data is sent to `/analyzer/analyze` which runs a two-step Groq process:
1. Level detection (Beginner / Intermediate / Advanced) and domain detection
2. Full Skill DNA generation + 3 project suggestions matched to level and domain

Results are saved to `user_profiles` in Supabase.

### Studio (`/studio/[projectId]`)

Three-pane layout:

- **Pane A (left)** — Compact step list (dot indicators) + full instruction panel for the active step. Instructions are generated at project creation time and are level-adaptive (Beginners get numbered sub-tasks + code examples + common mistakes; Advanced users get a feature list only).
- **Pane B (center)** — Monaco Editor (same engine as VS Code). Auto-saves to MongoDB every 2 seconds after the last keystroke. File tabs at the top.
- **Pane C (right)** — Copilot chat. Streaming responses via SSE. When the AI returns a code block, an "Apply Fix" button appears that injects the code directly into the editor using `editor.executeEdits()`.

**Navbar buttons:**
- **PSI** — Sends all current code files to Groq for analysis. Returns a score (0-100), 4 dimension scores, 2-5 improvement items, and 2-3 compliments. Never auto-runs — user initiates.
- **Deploy** — Simulated deployment. Streams 8 build steps via SSE, generates a mock `*.nirmaan.app` URL and GitHub URL.
- **Complete Step** — Marks the current step done in MongoDB, unlocks the next step, awards 50 XP, computes an adaptive message based on how long the step took.

### Dashboard (`/dashboard`)

Home page for users who have completed the scanner. Shows:
- Skill DNA card (role, level, skill bars with real scores)
- Active project card with progress bar
- Top 3 internship matches (read from `jobs_cache` — never calls JSearch directly)
- Next Steps card (2-3 tasks extracted from the active step's markdown instructions)
- Quick links

### Internships (`/internships`)

Fetches real job listings from JSearch based on the user's stored role. Results are cached in the `jobs_cache` Supabase table for 6 hours to preserve API quota. Match percentage is calculated client-side by comparing the job description against the user's `skill_scores`.

---

## API Reference

All endpoints require `Authorization: Bearer <supabase_jwt>` header except `/health`.

```
GET  /health                    Health check

POST /scanner/github            Fetch GitHub profile data
POST /scanner/pdf               Extract data from PDF
POST /scanner/manual            Process manual quiz answers
GET  /scanner/questions         Get the 8 manual quiz questions

POST /analyzer/analyze          Run full AI analysis → Skill DNA + 3 projects

POST /studio/init               Create project + generate 7-step roadmap
GET  /studio/{project_id}       Load full project state
POST /studio/save-code          Autosave a file (debounced, 2s)
POST /studio/complete-step      Mark step done, unlock next, award XP
POST /studio/copilot            Streaming copilot (SSE)
POST /studio/psi                Run PSI code analysis
POST /studio/deploy             Simulated deploy (SSE stream)

GET  /jobs/search               Fetch matched internships (with 6h cache)

GET  /dashboard/summary         Single endpoint for all dashboard data
```

---

## Key Design Decisions

**Why two databases?**
Supabase (PostgreSQL) handles user accounts, auth, and job cache — structured data with strong consistency needs. MongoDB handles project roadmaps and code files — schema-flexible, nested arrays of steps and files that change shape based on project type and work better as documents.

**Why is `src/lib/` gitignored?**
Accidental — should be unignored. Until then, teammates create the files manually using the templates above.

**Why does the backend use the service role key?**
The backend needs to write to `user_profiles` on behalf of users (saving scan results, XP updates) and read from `jobs_cache`. Row-level security would block these writes since the backend doesn't act as the user. The service role key bypasses RLS safely because it's only on the server.

**Why does the Copilot use SSE instead of WebSockets?**
SSE is simpler — one-directional stream, works over standard HTTP, no persistent connection to manage. The Copilot is always user-initiated and response-only, so SSE is the right fit.

**Why is job data cached in Supabase instead of Redis?**
The JSearch free tier allows 500 requests/month. With a 6-hour TTL per role, a team of 10 users with 3 distinct roles uses only 3 × (30 days × 4 refreshes/day) = 360 requests/month — safely within quota. Supabase JSONB is fast enough for this use case and avoids adding another infrastructure dependency.

---

## What's Not Built Yet

These features are planned but not implemented:

| Feature | Status | Notes |
|---|---|---|
| Hackathons page | Not started | Similar to internships — scrape Devfolio/Unstop/MLH |
| Grooming Lab | Not started | Resume builder, mock interview, aptitude prep |
| Tech Radar / Skill Hub | Not started | Visual bubble chart of trending skills |
| PSI history | Not started | Track score changes over time per project |
| Real GitHub push (Deploy) | Not started | Currently simulated — needs GitHub API OAuth integration |
| Real deployment (Deploy) | Not started | Currently simulated — needs Vercel/Netlify API |
| LinkedIn auto-post | Not started | After deploy — pre-fill post draft, user approves |
| Dark mode | Not started | Toggle exists in design, not wired |
| Mobile responsive Studio | Not started | Dashboard is responsive, Studio is desktop-only |

---

## Common Issues

**`net::ERR_NAME_NOT_RESOLVED` for Supabase URLs**
Your `NEXT_PUBLIC_SUPABASE_URL` in `frontend/.env.local` is wrong. Check for trailing slashes, `http://` instead of `https://`, or placeholder text. Restart the Next.js server after fixing.

**401 Unauthorized on all backend requests**
Either the JWT isn't being sent (check `api.ts` auth wrapper), or the backend `SUPABASE_SERVICE_KEY` is the anon key instead of the service role key. The service role key is much longer and starts differently.

**Monaco Editor crashes on startup**
It's being imported with SSR enabled somewhere. It must always be loaded with `dynamic(() => import(...), { ssr: false })`. Never import Monaco components directly in a page or layout.

**Groq returns malformed JSON**
The `call_groq_json` function in `groq_service.py` strips markdown code fences automatically. If it still fails, the model returned a truncated response — increase `max_tokens` or shorten the prompt context.

**`TypeError: val.score is undefined` on Dashboard skill bars**
The `skill_scores` in the user's Supabase profile was saved in the old flat format (`{"backend": 85}`) before the schema change. Either clear the `skill_scores` field in Supabase and re-run the scanner, or the user needs to go through the scanner again.

**JSearch returns empty results**
1. Check `JSEARCH_API_KEY` is set correctly in `backend/.env`
2. Check RapidAPI dashboard — you may have hit the monthly limit
3. The user's `role` field in `user_profiles` might be null — they need to complete the scanner first

**`Module not found: @/lib/api` or `@/lib/types`**
The `src/lib/` directory doesn't exist. Create it and add the 4 files as described in the [The `src/lib/` Directory](#the-srclib-directory-gitignored) section above.

---

## Team Conventions

- **Branch naming**: `feature/your-name-feature-name` or `fix/what-youre-fixing`
- **Never commit** `.env` or `.env.local` files
- **Never commit** `src/lib/` until the gitignore is fixed
- **Backend changes**: always update `requirements.txt` if you add a package (`pip freeze > requirements.txt` or just add the package name manually)
- **New Supabase columns**: update `backend/db/supabase_schema.sql` so teammates know what to run
- **New API endpoints**: add them to `frontend/src/lib/api.ts` — never put raw `fetch()` calls inside components
- **New types**: add to `frontend/src/lib/types.ts` — never define interfaces inline in component files
