# PrepTrack — Build Plan

## Current Status — March 2026

**All phases complete.** The app is fully built and functional. This document is kept for architectural reference.

### What's done
- ✅ Phase 1 — Foundation (scaffold, DB, app shell, PWA stub)
- ✅ Phase 2 — Core CRUD (meals/batches API, Dashboard, Add Item, Item Detail, Quick Counter)
- ✅ Phase 3 — Mealie Integration (API service, Plan/Coverage screen, recipe autocomplete, recipe image proxy)
- ✅ Phase 3.1 — Category Sync Update (Mealie-sourced categories, dynamic filters, migration 004)
- ✅ Phase 4 — Notifications (cron scheduler, Web Push, lunch/dinner prompt UI, Telegram optional)
- ✅ Phase 5 — Polish (Settings screen, TickTick OAuth + checklist integration, PWA finalisation, Docker)

### Completed integrations
- **Mealie API v2:** `/households/mealplans` endpoint, camelCase field support (`entryType`, `recipeCategory`), recipe image proxy, category sync
- **TickTick OAuth 2.0:** In-app popup flow using `X-Forwarded-Host` header (Vite `xfwd: true`), ingredients sent as `items[]` checklist array
- **Web Push:** VAPID via env vars, `vapidConfigured` flag, SSRF protection on subscribe endpoint
- **PWA:** Cache versioning (`v1`), offline inventory, install banner with localStorage dismiss, SW skips navigate-mode requests (fixes OAuth popup)

### Key architectural decisions made during build
- Categories are NOT hardcoded — they come from `mealie_category_name` on the `meals` table, synced from Mealie's `recipeCategory[0]`
- Single `default_expiry_days` setting (was per-category, simplified in Phase 3.1)
- Mealie API responses cached 5 min in-memory on the server
- TickTick redirect URI uses `X-Forwarded-Host` header set by Vite proxy (`xfwd: true`) so dev and prod both work
- Service worker skips `request.mode === 'navigate'` for `/api/` paths to avoid intercepting OAuth redirects

---

## Project Overview

PrepTrack is a PWA meal prep management app that integrates with Mealie for recipe/meal plan data. It tracks freezer inventory, sends smart notifications about defrosting and freezing, and helps plan weekly meals. Built as a Node.js/Express app with PostgreSQL, deployed on Unraid behind Traefik/Authelia.

## Architecture

```
┌─────────────────────────────────────────────┐
│                   Frontend                   │
│          React SPA (PWA + Tailwind)          │
│     Mobile-first, responsive to desktop      │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────┴──────────────────────────┐
│              Backend (Express)               │
│  Routes │ Services │ Scheduler │ Push/Telegram│
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────┴─────┐        ┌─────┴──────┐
   │ PostgreSQL│        │ Mealie API │
   │ (local)   │        │ (existing) │
   └──────────┘        └────────────┘
```

## Tech Stack

- **Frontend:** React 18 + Tailwind CSS + shadcn/ui components
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (existing Unraid container)
- **Notifications:** Web Push API + Telegram Bot (optional)
- **Build:** Vite
- **Deployment:** Docker container on Unraid

## Database Schema

```sql
-- Core tables
meals           -- id, name, mealie_recipe_slug, mealie_category_name, mealie_category_slug, image_url, notes, created_at
                -- NOTE: no 'category' column — categories come from Mealie, stored as text
batches         -- id, meal_id, portions_remaining, freeze_date, expiry_date, created_at
activity_log    -- id, meal_id, batch_id, action, quantity, source, note, created_at
reservations    -- id, meal_id, batch_id, meal_plan_date, meal_type, status, created_at, resolved_at

-- Config tables
settings        -- key-value store. Active keys:
                --   mealie_url, mealie_api_key
                --   ticktick_client_id, ticktick_client_secret, ticktick_access_token, ticktick_list_id
                --   default_expiry_days (single value, replaces per-category expiry)
                --   defrost_lead_time, lunch_prompt_time, dinner_prompt_time
schedule        -- day_of_week, lunch_enabled, dinner_enabled
schedule_overrides -- week_start, day_of_week, meal_type, override_type
push_subscriptions -- id, endpoint, keys_p256dh, keys_auth, created_at
```

### Migrations
- `001_initial_schema.sql` — all core tables
- `002_activity_source_batch_delete.sql` — activity log source/delete tracking
- `003_activity_source_notification_actions.sql` — notification action sources
- `004_mealie_categories_and_default_expiry.sql` — adds `mealie_category_name/slug` to meals, drops `category` column + CHECK constraint, adds `default_expiry_days` setting, removes per-category expiry settings

## Screen Inventory (from Stitch mockups)

| Screen | Mobile Mockup | Desktop Mockup | Notes |
|--------|--------------|----------------|-------|
| Dashboard/Home | dashboard_consistent_nav | preptrack_desktop_dashboard_clean | Pending actions + inventory list |
| Notification Prompts | notification_prompts_fixed_nav | (inline on dashboard desktop) | Lunch defrost + dinner logging |
| Add Item Form | add_item_form_standardized_nav | add_item_desktop_view | Manual entry (10% use case) |
| Quick Counter | quick_counter_overlay_fixed | (same, it's an overlay) | Bottom sheet for portion count |
| Plan/Coverage | meal_plan_coverage_view_30_day_option | plan_desktop_view_standardized | Day-grouped meal plan + status |
| Item Detail | item_detail_history | (same layout, wider) | Batch info + activity log |
| Settings | settings_updated_schedule_icons | settings_desktop_view_standardized | Schedule, notifications, defaults |

## Design Decisions (locked in)

- **Branding:** "PrepTrack" everywhere, subtitle "Meal Prep Manager"
- **Navigation (mobile):** Bottom tab bar — Home, Plan, Recipes, Settings
- **Navigation (desktop):** Left sidebar — Dashboard, Plan, Inventory, Add Item, Settings
- **Categories:** Dynamically sourced from Mealie (`recipeCategory[0].name`), stored on the `meals` table as `mealie_category_name`. `Uncategorised` bucket for meals with no Mealie category. No hardcoded list.
- **Portions default:** 2 (household of 2)
- **Batch model:** One entry per meal name, multiple batches underneath, FIFO for removals
- **Defrost default:** "Defrost 2" as primary prompt action
- **Colour palette:** Dark mode primary. Background #101922, cards slate-800/50, accent #2b8cee (blue), secondary teal for freezer actions
- **Status colours:** Green = in freezer/fresh, Amber = low stock/expiring soon, Red = missing/expired, Blue = reserved
- **No QR codes in v1**
- **No Stock Trends / Quick Insights / Freezer Capacity in v1**

---

## Build Phases

### PHASE 1 — Foundation ✅ COMPLETE
**Goal:** Runnable app skeleton with database, API structure, and app shell.

**Task 1.1 — Project scaffolding** → Sonnet
- Initialise Vite + React + Tailwind project
- Set up Express backend with folder structure (routes/, services/, middleware/, db/)
- Configure PostgreSQL connection (pg library)
- Create Dockerfile and docker-compose.yml for Unraid deployment
- Set up environment variables template (.env.example)

**Task 1.2 — Database setup** → Sonnet
- Write SQL migration files for all tables listed above
- Create a simple migration runner script
- Seed script with sample data for development

**Task 1.3 — Shared layout & navigation** → Sonnet
- Build the app shell: responsive layout with mobile bottom nav + desktop sidebar
- Use the Stitch mockups as reference for the nav structure
- Implement React Router with routes for each screen
- Dark theme setup with Tailwind config matching Stitch colours
- PWA manifest.json and service worker stub

**Deliverable:** App runs locally, navigates between empty screen shells, connects to PostgreSQL.

---

### PHASE 2 — Core CRUD ✅ COMPLETE

**Goal:** Freezer inventory management works end-to-end.

**Task 2.1 — Backend API: Meals & Batches** → Sonnet
- CRUD endpoints for meals (GET /api/meals, POST, PUT, DELETE)
- CRUD endpoints for batches (nested under meals)
- GET /api/meals — returns meals with aggregated portion counts, earliest expiry
- GET /api/meals/:id — returns meal with all batches and activity log
- POST /api/meals/:id/decrement — FIFO logic, creates activity log entry
- POST /api/meals/:id/increment — creates new batch, activity log entry

**Task 2.2 — Dashboard screen (frontend)** → Sonnet
- Implement the dashboard matching the mobile mockup
- Summary stats bar (total items, expiring soon, expired)
- Search + filter chips
- Meal cards with inline minus button
- FAB for add item
- Connect to API, loading states, empty states
- Reference: dashboard_consistent_nav mockup

**Task 2.3 — Add Item form (frontend)** → Sonnet
- Implement add item screen matching mockup
- Meal name input with autocomplete (from existing meals + Mealie recipes)
- Portion counter, category chips, date pickers
- Link Mealie Recipe toggle
- Collapsible notes
- Reference: add_item_form_standardized_nav mockup

**Task 2.4 — Item Detail screen (frontend)** → Sonnet
- Meal header with portion count and +/- buttons
- Batch breakdown section (collapsible)
- Mealie recipe link card
- Activity log timeline
- Edit and delete actions
- Reference: item_detail_history mockup

**Task 2.5 — Quick Counter overlay** → Haiku
- Bottom sheet component with +/- and confirm
- Reusable across multiple screens (defrost prompt, freeze prompt, manual adjust)
- Reference: quick_counter_overlay_fixed mockup

**Deliverable:** Full freezer inventory CRUD working. Can add meals, adjust portions, view history.

---

### PHASE 3 — Mealie Integration ✅ COMPLETE

**Goal:** PrepTrack pulls recipes and meal plans from Mealie.

**Task 3.1 — Mealie API service** → Sonnet
- Service class that wraps Mealie's REST API
- Methods: getRecipes(), getRecipe(slug), getMealPlan(startDate, endDate), searchRecipes(query)
- Authentication handling (API key stored in settings)
- Caching layer (don't hammer Mealie on every request)
- Scheduled sync job (configurable: manual / 6h / daily)

**Task 3.2 — Plan/Coverage screen** → Sonnet
- Implement the combined plan + coverage view
- Pulls meal plan from Mealie, cross-references with freezer inventory
- Day-grouped layout with lunch/dinner rows
- Status badges: In Freezer, Low Stock, Reserved, Missing
- Date range toggle (7/14/30 days)
- Coverage summary with progress indicator
- "Eating out" collapsed rows for schedule-off days
- Individual "Add to shopping list" buttons on missing rows
- Reference: meal_plan_coverage_view_30_day_option mockup

**Task 3.3 — Recipe autocomplete** → Haiku
- When adding a new freezer item, autocomplete searches both existing meals AND Mealie recipes
- When a Mealie recipe is selected, auto-fill category and link the recipe

**Deliverable:** Plan screen shows this week's meals with freezer coverage status.

---

### PHASE 3.1 — Category Sync Update ✅ COMPLETE

Removed hardcoded 6-category system. Meals now inherit `mealie_category_name` and `mealie_category_slug` from Mealie's `recipeCategory[0]`. Dynamic `/api/categories` endpoint counts stocked meals per category. Dashboard filter chips built from API response. Single `default_expiry_days` setting replaces per-category expiry config.

---

### PHASE 4 — Notification System ✅ COMPLETE

**Goal:** Smart prompts drive daily interaction.

**Task 4.1 — Notification scheduler** → Sonnet
- Cron-based scheduler that runs twice daily at configurable times
- Afternoon job: checks tomorrow's lunch plan → creates reservation if freezer stock exists → triggers notification
- Evening job: checks today's dinner plan → triggers "what happened?" notification
- Respects weekly schedule (skips disabled days)
- Respects weekly overrides
- Logic for combining prompts (if both lunch and dinner need attention)

**Task 4.2 — Web Push notifications** → Sonnet
- Service worker push event handling
- Push subscription management (subscribe/unsubscribe)
- Backend: web-push npm package for sending notifications
- Notification actions (Defrost / Skip / Cooking Fresh) handled via the app

**Task 4.3 — Notification prompt UI** → Sonnet
- In-app prompt cards on dashboard (for when push was missed)
- Lunch prompt: meal name, freezer stock, "Defrost 2" primary action, "Cooking Fresh", "Skip"
- Dinner prompt: "What happened?" with Ate Fresh / Froze Portions / Ate + Froze Rest / Used from Freezer
- "Froze Portions" triggers the quick counter overlay
- Pending prompts persist until resolved
- Reference: notification_prompts_fixed_nav mockup

**Task 4.4 — Telegram bot (optional, lower priority)** → Sonnet
- Telegram bot as alternative notification channel
- Inline keyboard buttons for prompt responses
- Two-way: user responds in Telegram, app updates accordingly

**Deliverable:** Daily prompts work via push notifications and in-app cards.

---

### PHASE 5 — Settings & Polish ✅ COMPLETE

**Goal:** App is configurable and deployment-ready.

**Task 5.1 — Settings screen** → Sonnet
- Notification preferences (push / Telegram / both, prompt times)
- Weekly schedule grid with lunch/dinner toggles per day
- This week's overrides section
- Freezer defaults (expiry per category, defrost lead time)
- Mealie integration (URL, sync frequency, sync now button)
- Data management (export JSON, clear inventory)
- Reference: settings_updated_schedule_icons mockup

**Task 5.2 — TickTick integration** → Haiku
- Settings section for TickTick connection (OAuth)
- When "Add to shopping list" is tapped on coverage screen:
  - Pull recipe ingredients from Mealie
  - Create one TickTick task with recipe name + ingredients in note body
  - Group multiple recipes into single task if adding several

**Task 5.3 — PWA finalisation** → Haiku
- Complete service worker with caching strategy
- Offline support (cached inventory browsable offline)
- Install prompt banner for first-time visitors
- App icons and splash screens

**Task 5.4 — Docker & deployment** → Haiku
- Finalise Dockerfile (multi-stage: build frontend, serve with Express)
- docker-compose.yml with PostgreSQL dependency
- Environment variable documentation
- Traefik labels for reverse proxy
- Health check endpoint

**Deliverable:** Complete, deployable PrepTrack app.

---

## Model Assignment Summary

| Model | Role | Tasks | Why |
|-------|------|-------|-----|
| **Opus** | Architect & reviewer | Plan creation, complex logic design (notification scheduler rules, FIFO batch logic, Mealie sync strategy), code review of critical paths | Best at system design and catching edge cases |
| **Sonnet** | Primary builder | ~70% of tasks — all screens, API routes, services, database, integrations | Best cost/quality ratio for substantial code generation |
| **Haiku** | Repetitive/simple tasks | Quick counter component, recipe autocomplete wiring, PWA boilerplate, Docker config, TickTick integration | Fast and cheap for well-defined, bounded tasks |

## Execution Tips for Claude Code CLI

1. **Work in phases** — don't try to build everything at once. Complete Phase 1 before starting Phase 2.
2. **Give Sonnet the Stitch HTML files as reference** — copy the relevant mockup's code.html into the prompt so it can match the design closely.
3. **Give Sonnet the screenshots** — it can read them for visual reference.
4. **One task per session** — each task above is sized for roughly one Claude Code session. Don't cram multiple tasks.
5. **Test between tasks** — run the app after each task to catch issues early. Don't let debt accumulate.
6. **Use Opus sparingly** — only for planning, reviewing critical logic, and debugging hard problems. Don't use Opus for writing boilerplate.
7. **Haiku for small, well-defined jobs** — give it clear inputs and expected outputs. Don't ask it to make design decisions.

## File Structure (as built)

```
preptrack/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
│
├── server/
│   ├── index.js              # Express app entry
│   ├── db/
│   │   ├── connection.js     # PostgreSQL pool
│   │   └── migrations/       # 001–004 SQL migration files
│   ├── routes/
│   │   ├── meals.js          # CRUD + increment/decrement, ?category= filter
│   │   ├── batches.js
│   │   ├── settings.js
│   │   ├── notifications.js  # Pending prompts, resolve, push subscribe/unsubscribe
│   │   ├── mealie.js         # Recipe search, meal-plan, sync, image proxy, recipe/:slug
│   │   ├── categories.js     # GET /api/categories — dynamic from meals table
│   │   └── ticktick.js       # OAuth /auth + /callback, shopping-list task creation
│   ├── services/
│   │   ├── mealieSync.js     # Mealie API wrapper + 5-min in-memory cache
│   │   ├── scheduler.js      # Cron lunch + dinner notification jobs
│   │   ├── pushService.js    # Web Push (vapidConfigured flag exported)
│   │   ├── telegramBot.js    # Telegram integration (optional)
│   │   └── ticktick.js       # TickTick API: createTask(token, listId, title, content, items[])
│   └── middleware/
│       └── auth.js           # Authelia header parsing
│
├── client/
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js             # Service worker (cache v1, offline, OAuth navigate fix)
│   │   └── icons/
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.jsx      # Shell + PWA install banner (dismiss persisted)
│       │   │   ├── BottomNav.jsx     # Mobile nav
│       │   │   └── Sidebar.jsx       # Desktop nav
│       │   ├── shared/
│       │   │   ├── MealCard.jsx
│       │   │   ├── QuickCounter.jsx  # Bottom sheet (add/remove modes, expiryDays as number)
│       │   │   ├── StatusBadge.jsx
│       │   │   └── FilterChips.jsx
│       │   └── prompts/
│       │       ├── LunchPrompt.jsx   # Defrost / Cooking Fresh / Skip
│       │       └── DinnerPrompt.jsx  # Ate Fresh / Froze / Ate+Froze / Used Freezer
│       ├── pages/
│       │   ├── Dashboard.jsx  # Dynamic category chips, inventory, prompt cards
│       │   ├── Plan.jsx       # Meal plan coverage with recipe photos
│       │   ├── AddItem.jsx    # Mealie autocomplete, category badge from Mealie
│       │   ├── ItemDetail.jsx
│       │   └── Settings.jsx   # Schedule grid, Mealie, TickTick OAuth, Push, Freezer defaults
│       ├── hooks/
│       │   ├── useMeals.js
│       │   ├── useMealPlan.js
│       │   ├── useSettings.js
│       │   ├── useInstallPrompt.js   # PWA install + localStorage dismiss
│       │   └── useNotifications.js
│       ├── services/
│       │   └── api.js         # mealsApi, batchesApi, settingsApi, mealieApi, categoriesApi, ticktickApi, notificationsApi
│       └── utils/
│           ├── dates.js
│           └── expiry.js      # buildExpiryMap(settings) → number, calcExpiry(date, days)
│
└── design/                   # Stitch mockups for reference
    ├── mobile/
    └── desktop/
```

## Prompt Templates for Claude Code

### Starting a new task
```
I'm building PrepTrack, a meal prep management PWA. Here's the full build plan: [attach this document]

I'm on Phase X, Task X.X: [task name]

Here's the current project state: [describe what's been built so far]
Here's the Stitch mockup for reference: [attach relevant code.html and/or screenshot]

Please implement [specific task description].
```

### Handing off between phases
```
Phase X is complete. Here's what was built: [summary]
Here's the current file structure and any issues found during testing.
Starting Phase X+1, Task X.1: [task name]
```
