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
│   │   └── migrations/        # SQL migration files
│   ├── routes/
│   │   ├── meals.js
│   │   ├── batches.js
│   │   ├── settings.js
│   │   ├── notifications.js
│   │   └── mealie.js
│   ├── services/
│   │   ├── mealieSync.js      # Mealie API wrapper + cache
│   │   ├── scheduler.js       # Cron notification jobs
│   │   ├── pushService.js     # Web Push sending
│   │   ├── telegramBot.js     # Telegram integration
│   │   └── ticktick.js        # TickTick API wrapper
│   └── middleware/
│       └── auth.js            # Authelia header parsing
└── client/
    ├── index.html
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── components/
        │   ├── layout/
        │   │   ├── AppShell.jsx      # Responsive shell
        │   │   ├── BottomNav.jsx     # Mobile bottom tab bar
        │   │   └── Sidebar.jsx       # Desktop left sidebar
        │   ├── shared/
        │   │   ├── MealCard.jsx
        │   │   ├── QuickCounter.jsx  # Bottom sheet overlay
        │   │   ├── StatusBadge.jsx
        │   │   └── FilterChips.jsx
        │   └── prompts/
        │       ├── LunchPrompt.jsx
        │       └── DinnerPrompt.jsx
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Plan.jsx
        │   ├── AddItem.jsx
        │   ├── ItemDetail.jsx
        │   └── Settings.jsx
        ├── hooks/
        │   ├── useMeals.js
        │   ├── useMealPlan.js
        │   └── useNotifications.js
        └── services/
            └── api.js           # Frontend API client
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

## Build Phases

Work one task at a time. Complete and test before moving on.

- **Phase 1 — Foundation:** Scaffold (Vite+React+Tailwind+Express), DB migrations, app shell + nav, PWA stub
- **Phase 2 — Core CRUD:** Meals/batches API, Dashboard, Add Item form, Item Detail, Quick Counter
- **Phase 3 — Mealie Integration:** Mealie API service, Plan/Coverage screen, recipe autocomplete
- **Phase 3.1 — Category Sync Update:** Remove hardcoded categories, store Mealie category name/slug on meals, dynamic category filters via `/api/categories`
- **Phase 4 — Notifications:** Cron scheduler, Web Push, prompt UI, Telegram bot (optional)
- **Phase 5 — Polish:** Settings screen, TickTick integration, PWA finalisation, Docker deployment

## Key Rules

- Always reference the relevant mockup HTML/screenshot when building a screen
- FIFO logic for batch removal — always decrement the oldest batch first
- No login screen — users arrive pre-authenticated via Authelia SSO (read headers in `auth.js` middleware)
- Skeleton loaders, not spinners, for loading states
- All primary tap targets must be >= 48px (one-handed kitchen use)
- After each phase, run the app and verify before starting the next phase
