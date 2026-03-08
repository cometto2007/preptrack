# PrepTrack — Design Brief for Google Stitch

## Global Context (paste before each screen prompt, or at the top if doing all at once)

> **App Name:** PrepTrack
>
> **Purpose:** A personal meal prep management PWA that orchestrates the daily cycle of cooking, freezing, defrosting, and eating. It integrates with Mealie (an existing recipe/meal planning app) to intelligently prompt the user about what to defrost for tomorrow's lunch, what to freeze after tonight's dinner, and how many days of meals they're covered for. The freezer inventory is the core data layer, but the real value is the smart notification-driven workflow that means the user rarely needs to open the app directly.
>
> **Platform:** Mobile-first Progressive Web App (PWA). Must work beautifully on Android phone, iPad, and desktop browser. Designed to be installed to the home screen and run fullscreen (standalone mode). Consider iOS safe areas and notch handling.
>
> **Style Direction:** Clean, modern, utility-focused. Think premium inventory/logistics app, not a marketing site. High information density done tastefully. No unnecessary decoration. Every element earns its place.
>
> **Colour & Theme:** Dark mode primary. Use a dark neutral background (slate/zinc tones) with a vibrant accent colour for primary actions (consider teal, electric blue, or warm amber). Colour-coded status system: green = fresh/well-stocked, amber/yellow = use soon/running low, red = expiring/out of stock. Cards and surfaces should use subtle elevation through lighter dark tones, not shadows.
>
> **Typography:** Clean sans-serif. Large, readable text for the most important information (portion counts, meal names). Secondary info (dates, notes) in smaller muted text. Strong visual hierarchy on every screen.
>
> **Interaction Model:** This app is used with one hand, often while standing at a kitchen counter or freezer. All primary actions must be reachable with a thumb. Tap targets minimum 48px. Swipe gestures for common actions (swipe to confirm, swipe to dismiss). Minimal typing required.
>
> **Tech Stack:** Node.js/Express backend, Tailwind CSS, shadcn/ui-style components, PostgreSQL. Deployed on a home Unraid server behind Traefik reverse proxy with Authelia SSO authentication.
>
> **Users:** 1-2 household members. Already authenticated via SSO — no login screen needed within the app.

---

## Screen 1 — Notification Prompt Card (Most Important Screen)

This is the heart of the app. The user interacts with PrepTrack primarily through notification prompts, not by browsing the app. Design this as both an in-app card AND as a format that would translate well to a push notification expanded view.

> Design a mobile notification/prompt card for PrepTrack. Dark mode. This card appears in two contexts: as a push notification action on the phone, and as a prominent card at the top of the dashboard when the app is opened.
>
> **Lunch prompt (shown ~3-5pm, configurable):**
> The card should show: a clear label "Tomorrow's Lunch", the meal name large and prominent, a small thumbnail or icon for the meal, the current freezer stock for this meal (e.g. "4 portions in freezer"), and three large, thumb-friendly action buttons:
> - "Defrost 1" (primary action, most prominent — teal/blue accent)
> - "Cooking Fresh" (secondary — outlined/ghost button)
> - "Skip" (tertiary — subtle text button)
>
> Below the buttons, show a subtle note: "Reminder: take out of freezer tonight to defrost for tomorrow"
>
> **Dinner prompt (shown ~8-9pm, configurable):**
> The card should show: a clear label "Tonight's Dinner", the meal name, and the question "What happened?" with four action buttons:
> - "Ate Fresh" (nothing to log)
> - "Froze Portions" (opens a quick counter — how many?)
> - "Ate + Froze Rest" (combined flow)
> - "Used from Freezer" (decrements)
>
> **Design requirements:**
> - The card must be completable in 1-2 taps maximum for the common case
> - If multiple prompts are pending (e.g. both lunch and dinner), show them as a vertical stack of cards
> - Include a small "Not today" or dismiss gesture (swipe away)
> - When "Froze Portions" is tapped, an inline counter appears (not a new screen) with +/- buttons and a confirm button
> - The whole design should feel like a smart assistant asking you a question, not a form to fill out

---

## Screen 2 — Dashboard / Home

The dashboard is a read-mostly overview. Most daily interaction happens through notifications, so this screen is for when you want to check what's in the freezer or review your status.

> Design a mobile-first dashboard for PrepTrack. Dark mode.
>
> **Top section — Pending Actions:**
> If there are unresolved notification prompts (user hasn't responded yet), show them as compact cards at the top with a badge count: "2 actions pending". These are the same prompt cards from Screen 1 but in a condensed format.
>
> **Summary strip:**
> A horizontal row of key stats: total items in freezer, portions expiring soon (amber), expired (red), meals covered this week (e.g. "8/10 meals covered" with a small progress arc or bar).
>
> **Main content — Freezer inventory list:**
> A searchable, filterable list of frozen meals displayed as cards. Each card shows:
> - Meal name (large, primary text)
> - Portion count (large number, prominently displayed)
> - Freeze date and days until expiry (with colour-coded badge: green/amber/red)
> - A category tag (Meals, Soups, Sauces, Baked Goods, Ingredients, Other)
> - Inline quick actions: a minus (-) button directly on the card for fast decrement without drilling in
>
> **Filter chips:** All | Expiring Soon | Recently Added | by Category
>
> **Floating action button (+):** Bottom right, for manual add (the 10% use case)
>
> **Bottom navigation bar:** Home | Prompts (with badge for pending) | Add Item | Coverage | Settings
>
> **Design notes:**
> - Cards should be compact enough to see 4-5 on a phone screen without scrolling
> - The minus button on each card is the key interaction — make it obvious but not accidentally tappable
> - Empty state: if freezer is empty, show an encouraging illustration and "Add your first meal" prompt
> - Pull-to-refresh to re-sync with Mealie

---

## Screen 3 — Quick Counter Overlay

When the user taps "Froze Portions" from a notification prompt or needs to adjust a count, this overlay appears. It should NOT be a full new screen — it slides up as a bottom sheet over the current view.

> Design a bottom sheet / overlay for PrepTrack. Dark mode. This appears when the user needs to specify a portion count (e.g. after tapping "Froze Portions" on a dinner prompt).
>
> Show:
> - The meal name at the top of the sheet
> - A large, central number (the count) — starts at 0 for adding, or the current count for adjusting
> - Big, circular minus (-) and plus (+) buttons flanking the number — at least 64px tap targets
> - A "Confirm" button at the bottom (full width, accent colour)
> - A subtle "Cancel" text link or swipe-down to dismiss
>
> The sheet should be short — only taking up ~40% of the screen height. The interaction is: tap plus a few times, tap confirm. Done in under 3 seconds.
>
> If this is a "Froze Portions" flow, also show a small line below the counter: "Freeze date: Today" (auto-set, tappable to change if needed) and "Expires: [auto-calculated date]"

---

## Screen 4 — Add Item Form (Manual Entry)

For the ~10% of cases where the user batch-cooks something unplanned or needs to manually add items. Keep it minimal.

> Design a mobile form screen for manually adding a new frozen meal to PrepTrack. Dark mode.
>
> Fields (in order):
> - **Meal name:** Text input with autocomplete from existing Mealie recipes and previously frozen meals. This is the most important field — make it prominent with a large input area.
> - **Portions:** Counter widget (same +/- style as the quick counter), default 1
> - **Category:** Horizontal scrollable chips (Meals, Soups, Sauces, Baked Goods, Ingredients, Other) — tap to select, not a dropdown
> - **Freeze date:** Defaults to today, shown as a tappable date pill that opens a date picker only if needed
> - **Expiry date:** Auto-calculated (configurable default per category, e.g. 3 months for meals, 6 months for soups), shown as a tappable date pill
> - **Link to Mealie recipe:** Optional toggle — when enabled, shows a search field to find and link a Mealie recipe
> - **Notes:** Collapsible text area, hidden by default (tap "Add notes" to expand)
>
> **Bottom:** A large "Add to Freezer" button (full width, accent colour)
>
> **Design notes:**
> - The form should feel fast. The minimum viable entry is: type meal name → tap confirm. Everything else has smart defaults.
> - Group fields logically but don't use section headers — the form is short enough not to need them
> - After successful add, show a brief success toast and return to the previous screen

---

## Screen 5 — Meal Coverage View

The intelligence layer. This answers "are we covered for the week?"

> Design a meal coverage screen for PrepTrack. Dark mode. This shows how well the household's upcoming meal plan is covered by freezer stock.
>
> **Top section — Summary:**
> A prominent stat: "Covered for 8 of 12 meals this week" with a visual indicator (progress ring, bar, or similar). Use green if >80% covered, amber if 50-80%, red if <50%.
>
> **Date range selector:** Pill-style toggle: "7 days" | "14 days" | "30 days"
>
> **Main list — Meal-by-meal breakdown:**
> Each row shows:
> - Day and meal type (e.g. "Mon Lunch", "Tue Dinner")
> - Meal name from Mealie plan
> - Status badge:
>   - Green: "In freezer (3 portions)" — covered
>   - Amber: "Low stock (1 left)" — covered but running out
>   - Red: "Not in freezer" — need to cook fresh or buy
>   - Blue: "Reserved" — portion already set aside (pending confirmation from a prompt)
> - Days that are toggled off in the schedule (e.g. weekends eating out) should appear greyed out with a label like "Eating out" or simply be hidden, with a toggle to show/hide them
>
> **Bottom action:** If any meals are uncovered, show a subtle suggestion: "3 meals uncovered — add to shopping list?" that could push items to Mealie's shopping list
>
> **Design notes:**
> - This is an information-dense screen — use a tight but readable layout
> - The visual distinction between covered/low/uncovered/reserved must be immediately scannable
> - Consider a timeline or calendar-strip view at the top showing the week with colour-coded dots per day

---

## Screen 6 — Item Detail & History

Shown when tapping into a specific freezer item from the dashboard.

> Design a detail screen for a single freezer item in PrepTrack. Dark mode.
>
> **Header area:**
> - Meal name (large)
> - Category tag
> - Current portion count (very large, prominent number)
> - Freeze date and expiry countdown (e.g. "Frozen 12 days ago · Expires in 78 days") with colour-coded status
>
> **Linked recipe section (if connected to Mealie):**
> - A compact card showing the recipe name with a "View in Mealie" button that opens the recipe in Mealie
>
> **Activity log / History:**
> - A vertical timeline showing all events: "Added 6 portions — Mar 2", "Removed 1 (lunch) — Mar 5", "Removed 1 (dinner) — Mar 8"
> - Each entry shows the action, count change, date, and which meal plan entry triggered it (if applicable)
> - Keep it compact — this is secondary information
>
> **Actions:**
> - "Edit" button (opens the add form pre-filled for editing)
> - "Delete" button (with confirmation — "Remove from inventory?")
> - Quick +/- buttons for adjusting the count inline
>
> **Design notes:**
> - This screen is visited occasionally for review, not daily. Prioritise clarity over speed.
> - The history log is valuable for understanding consumption patterns

---

## Screen 7 — Settings

> Design a settings screen for PrepTrack. Dark mode.
>
> **Sections:**
>
> **Notification Preferences:**
> - Notification channel: Push Notifications | Telegram | Both (selectable pills)
> - Lunch prompt time: time picker, default 3:00 PM
> - Dinner prompt time: time picker, default 8:00 PM
> - If Telegram is selected, show a "Connect Telegram Bot" setup flow link
>
> **Weekly Schedule:**
> - A 7-day grid (Mon–Sun), each day has two toggles: Lunch and Dinner
> - Active days shown in accent colour, inactive days greyed out
> - Label: "Which meals do you manage at home?"
> - Below the grid: "This week's overrides" section showing any temporary changes for the current week, with the ability to toggle individual days on/off without changing the default
>
> **Freezer Defaults:**
> - Default expiry periods per category (editable):
>   - Meals: 3 months
>   - Soups: 6 months
>   - Sauces: 6 months
>   - Baked Goods: 3 months
>   - Ingredients: 6 months
>   - Other: 3 months
> - Default defrost lead time: "Prompt to defrost ___ day(s) before" (default 1)
>
> **Mealie Integration:**
> - Connection status indicator (Connected / Disconnected)
> - Mealie instance URL
> - Sync frequency (e.g. every 6 hours, daily)
> - "Sync Now" button
>
> **Data Management:**
> - Export data (JSON)
> - Clear all inventory
> - App version
>
> **Design notes:**
> - Group settings with clear section headers
> - The weekly schedule grid is the most visually interesting element — make it clean and intuitive
> - Use toggle switches, not checkboxes
> - Keep it functional, no decorative elements needed

---

## Screen 8 — Weekly Overview / Prompts Tab

The "Prompts" tab in the bottom navigation. Shows a week-at-a-glance of what's coming up and what needs attention.

> Design a weekly overview screen for PrepTrack. Dark mode. This is the "Prompts" tab that gives a proactive view of the upcoming week.
>
> **Layout:**
> A vertical day-by-day list for the next 7 days. Each day shows:
> - Day name and date as a section header (e.g. "Monday, March 9")
> - If the day is toggled off (eating out), show it greyed/collapsed with "Eating out" label
> - For active days, show lunch and dinner as sub-rows:
>   - Meal name from Mealie plan (or "No meal planned" in muted text)
>   - Freezer status icon/badge (in freezer / not in freezer / reserved)
>   - If a prompt is pending for this meal, highlight the row with a subtle accent border or glow
>
> **Today should be visually distinct** — highlighted header, any pending prompts shown as the full prompt card (from Screen 1) inline
>
> **Quick actions per row:**
> - Tap a future meal to pre-reserve a freezer portion ("Reserve for Thursday's lunch?")
> - Tap "No meal planned" to open Mealie or suggest something from what's in the freezer
>
> **Top summary:** "This week: 3 prompts pending · 2 meals uncovered"
>
> **Design notes:**
> - This is the planning view — users check it once or twice a week to see the big picture
> - The distinction between today, upcoming, and past days should be clear
> - Past days (already handled) can be collapsed or shown in a muted state
> - This screen bridges the gap between the notification-driven workflow and manual planning

---

## PWA-Specific Design Notes

> For all screens, account for:
> - **Standalone PWA mode:** No browser URL bar. The app fills the full screen. Include a status bar safe area at the top (especially for iOS with notch/dynamic island).
> - **Install prompt:** Design a subtle, one-time banner for first-time web visitors: "Install PrepTrack for notifications and quick access" with an "Install" button and dismiss option. Show this on the dashboard, not as a blocking modal.
> - **Offline state:** If the device is offline, show a subtle banner "Offline — showing cached data" and disable actions that require syncing (like Mealie search). The inventory should still be browsable from cache.
> - **Loading states:** Skeleton screens for cards and lists while data loads, not spinners.
> - **Transitions:** Smooth slide transitions between screens. Bottom sheet slides up for overlays. Cards animate in on the dashboard.
