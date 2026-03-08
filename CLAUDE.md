# PrepTrack — Claude Code Instructions

## Project Overview

PrepTrack is a mobile-first PWA for meal prep management. It integrates with Mealie (an existing self-hosted recipe/meal planning app) to track freezer inventory, send smart notifications about defrosting and freezing, and show meal plan coverage. Deployed as a Docker container on Unraid behind Traefik/Authelia.

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui components
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (existing Unraid container, `pg` library)
- **Notifications:** Web Push API + optional Telegram Bot
- **Deployment:** Docker (multi-stage build) on Unraid

## File Structure

```
preptrack/
├── CLAUDE.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── server/
│   ├── index.js               # Express entry point
│   ├── db/
│   │   ├── connection.js      # PostgreSQL pool
│   │   └── migrations/        # SQL migration files (001–004)
│   ├── routes/
│   │   ├── meals.js           # CRUD + increment/decrement, ?category= filter
│   │   ├── batches.js
│   │   ├── settings.js
│   │   ├── notifications.js   # Pending prompts, resolve actions, push subscribe
│   │   ├── mealie.js          # Recipe search, meal-plan, sync, image proxy
│   │   ├── categories.js      # GET /api/categories — dynamic from meals table
│   │   └── ticktick.js        # OAuth flow + shopping list task creation
│   ├── services/
│   │   ├── mealieSync.js      # Mealie API wrapper + 5-min in-memory cache
│   │   ├── scheduler.js       # Cron notification jobs (lunch + dinner)
│   │   ├── pushService.js     # Web Push sending, vapidConfigured flag
│   │   ├── telegramBot.js     # Telegram integration (optional)
│   │   └── ticktick.js        # TickTick API wrapper (createTask with items[])
│   └── middleware/
│       └── auth.js            # Authelia header parsing
└── client/
    ├── index.html
    ├── public/
    │   ├── manifest.json
    │   ├── sw.js              # Service worker (cache versioning, offline, OAuth nav fix)
    │   └── icons/
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── components/
        │   ├── layout/
        │   │   ├── AppShell.jsx      # Responsive shell + PWA install banner
        │   │   ├── BottomNav.jsx     # Mobile bottom tab bar
        │   │   └── Sidebar.jsx       # Desktop left sidebar
        │   ├── shared/
        │   │   ├── MealCard.jsx
        │   │   ├── QuickCounter.jsx  # Bottom sheet overlay (add/remove modes)
        │   │   ├── StatusBadge.jsx
        │   │   └── FilterChips.jsx
        │   └── prompts/
        │       ├── LunchPrompt.jsx   # Defrost / Cooking Fresh / Skip
        │       └── DinnerPrompt.jsx  # Ate Fresh / Froze / Ate+Froze / Used Freezer
        ├── pages/
        │   ├── Dashboard.jsx  # Dynamic category filters, inventory list, prompts
        │   ├── Plan.jsx       # Meal plan coverage + recipe photos
        │   ├── AddItem.jsx    # Mealie recipe autocomplete, category badge
        │   ├── ItemDetail.jsx
        │   └── Settings.jsx   # Schedule, Mealie, TickTick, Push, Freezer defaults
        ├── hooks/
        │   ├── useMeals.js
        │   ├── useMealPlan.js
        │   ├── useSettings.js
        │   ├── useInstallPrompt.js   # PWA install prompt with localStorage dismiss
        │   └── useNotifications.js
        ├── services/
        │   └── api.js         # Frontend API client (mealsApi, categoriesApi, ticktickApi, etc.)
        └── utils/
            ├── dates.js
            └── expiry.js      # buildExpiryMap (returns number), calcExpiry(date, days)
```

## Database Schema

```sql
meals              -- id, name, mealie_recipe_slug, mealie_category_name, mealie_category_slug, image_url, notes, created_at
batches            -- id, meal_id, portions_remaining, freeze_date, expiry_date, created_at
activity_log       -- id, meal_id, batch_id, action, quantity, source, note, created_at
reservations       -- id, meal_id, batch_id, meal_plan_date, meal_type, status, created_at, resolved_at
settings           -- key-value app config
schedule           -- day_of_week, lunch_enabled, dinner_enabled
schedule_overrides -- week_start, day_of_week, meal_type, override_type
push_subscriptions -- id, endpoint, keys_p256dh, keys_auth, created_at
```

## Design System (locked in)

- **Branding:** "PrepTrack" / subtitle "Meal Prep Manager"
- **Theme:** Dark mode primary
- **Colors:**
  - Background: `#101922`
  - Cards: `slate-800/50`
  - Accent (primary actions): `#2b8cee` (blue)
  - Freezer actions: teal
  - Status: Green = fresh/stocked | Amber = low/expiring | Red = missing/expired | Blue = reserved
- **Navigation (mobile):** Bottom tab bar — Home, Plan, Recipes, Settings
- **Navigation (desktop):** Left sidebar — Dashboard, Plan, Inventory, Add Item, Settings
- **Categories:** Sourced from Mealie (`recipeCategory[0]`), with `Uncategorised` for meals without a Mealie category
- **Portions default:** 2 (household of 2)
- **Batch model:** One meal entry, multiple batches underneath, FIFO removals
- **Inventory visibility:** Dashboard/category counts show in-stock meals only (`total_portions > 0`); zero-stock meals stay in DB for history/reuse and are fetched only when explicitly requested
- **Defrost default:** "Defrost 2" as primary prompt action
- **NOT in v1:** QR codes, Stock Trends, Quick Insights, Freezer Capacity

## Design Mockups

The `design/` directory contains Stitch-generated HTML mockups for all screens. When implementing a screen, read the corresponding `code.html` and `screen.png` as visual reference.

| Screen | Mockup folder(s) |
|--------|-----------------|
| Dashboard | `dashboard_consistent_nav`, `preptrack_desktop_dashboard_clean` |
| Notification Prompts | `notification_prompts_fixed_nav` |
| Add Item | `add_item_form_standardized_nav`, `add_item_desktop_view` |
| Quick Counter overlay | `quick_counter_overlay_fixed` |
| Plan/Coverage | `meal_plan_coverage_view_30_day_option`, `plan_desktop_view_standardized` |
| Item Detail | `item_detail_history` |
| Settings | `settings_updated_schedule_icons`, `settings_desktop_view_standardized` |

## Current Status

All phases complete as of March 2026. The app is fully functional and ready for Docker deployment.

### What's built and working
- Full freezer inventory CRUD with FIFO batch model
- Mealie integration: recipe search/autocomplete, meal plan coverage screen with recipe photos
- Dynamic categories sourced from Mealie (no hardcoded categories)
- Web Push notifications: cron scheduler, lunch/dinner prompts, in-app prompt cards
- TickTick OAuth 2.0 integration: sends recipe ingredients as checklist tasks
- Settings screen: schedule grid, Mealie config, TickTick connect, push subscription, data export
- PWA: service worker with cache versioning, offline inventory browsing, install banner
- Authelia SSO middleware for production

### Key integrations
- **Mealie:** URL + API key stored in DB settings. Sync (`POST /api/mealie/sync`) links PrepTrack meals to Mealie recipes by name and pulls `mealie_category_name/slug`. Meal plan fetched from `/households/mealplans` (Mealie v2 endpoint). Recipe images proxied server-side.
- **TickTick:** OAuth 2.0 via in-app popup flow. Ingredients sent as checklist `items[]` array (not plain text). Client ID/secret stored in DB settings.
- **Web Push:** VAPID keys via env vars. `vapidConfigured` flag checks all 3 vars. Subscribe endpoint blocks private/loopback IPs (SSRF prevention).

## Build Phases

Work one task at a time. Complete and test before moving on.

- **Phase 1 — Foundation:** ✅ Scaffold (Vite+React+Tailwind+Express), DB migrations, app shell + nav, PWA stub
- **Phase 2 — Core CRUD:** ✅ Meals/batches API, Dashboard, Add Item form, Item Detail, Quick Counter
- **Phase 3 — Mealie Integration:** ✅ Mealie API service, Plan/Coverage screen with recipe photos, recipe autocomplete
- **Phase 3.1 — Category Sync Update:** ✅ Removed hardcoded categories, store Mealie category name/slug on meals, dynamic category filters via `/api/categories`
- **Phase 4 — Notifications:** ✅ Cron scheduler, Web Push, prompt UI, Telegram bot (optional, wired but not tested)
- **Phase 5 — Polish:** ✅ Settings screen, TickTick OAuth + checklist integration, PWA finalisation, Docker deployment

## Key Rules

- Always reference the relevant mockup HTML/screenshot when building a screen
- FIFO logic for batch removal — always decrement the oldest batch first
- No login screen — users arrive pre-authenticated via Authelia SSO (read headers in `auth.js` middleware)
- Skeleton loaders, not spinners, for loading states
- All primary tap targets must be >= 48px (one-handed kitchen use)
- After each phase, run the app and verify before starting the next phase

## Release + Unraid Rollout

- Commit all tested changes to `main` and push to GitHub before deployment
- Create an annotated tag for the rollout snapshot (example: `v0.3.0`) and push the tag
- Deploy Unraid from the release tag, not an unpinned moving branch
- Use a dedicated production Postgres database/user for PrepTrack
- Required env vars: `DATABASE_URL`, `NODE_ENV=production`, `PORT=3001`, `CORS_ORIGIN`
- Configure Mealie integration in-app (`mealie_url`, `mealie_api_key`) after first boot
- Optional push env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Validate post-deploy with smoke checks:
  - `/api/health` returns OK
  - dashboard loads inventory
  - Mealie recipe search and link flow works
  - category inheritance and filters behave as expected
