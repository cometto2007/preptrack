# PrepTrack v2 — Multi-Item Meal Support

## Problem Statement

PrepTrack v1 treats each meal plan entry as an independent item: one prompt card per recipe, one coverage row per recipe. But real meals are composed of multiple items — beans and sausage plus rice, ragù plus pasta plus salad. The user plans multiple recipes per slot in Mealie, and PrepTrack needs to group them into a single meal for prompts, coverage, and (future) calorie tracking.

## How Mealie Structures Multi-Item Meals

Mealie's `/households/mealplans` endpoint returns individual entries, each with a `date`, `entryType` (breakfast, lunch, dinner, side, drink, dessert, snack), and a `recipe` reference. To plan "beans and sausage + rice" for Monday dinner, the user creates two entries on the same date — both could be `dinner`, or one `dinner` and one `side`.

Key fields per meal plan entry:
```json
{
  "id": "...",
  "date": "2026-03-10",
  "entryType": "dinner",
  "recipe": {
    "id": "...",
    "name": "Spicy Pork Ragù",
    "slug": "spicy-pork-ragu"
  }
}
```

**Grouping logic:** All entries on the same `date` that map to the same meal slot should be treated as one composed meal. The mapping is:
- `breakfast` → Breakfast
- `lunch`, `side` (on a lunch day) → Lunch
- `dinner`, `side`, `dessert`, `drink`, `snack` → Dinner

Simplest approach: group by `date` + broad meal type (lunch vs dinner), since PrepTrack only prompts for lunch and dinner.

---

## Changes Required

### 1. Backend — Meal Plan Grouping

**File:** `server/services/mealieSync.js` (or new `server/services/mealPlanGrouper.js`)

When fetching the meal plan from Mealie, transform the flat list of entries into grouped meals:

```
Input (from Mealie):
  - Mon dinner: Pork Ragù
  - Mon side: Rice
  - Mon side: Kimchi
  - Tue lunch: Leftover Ragù

Output (grouped):
  - Mon Dinner: [Pork Ragù, Rice, Kimchi]
  - Tue Lunch: [Leftover Ragù]
```

Each grouped meal should include all recipe references, so downstream features (coverage, prompts, shopping list, future calorie tracking) can iterate over the components.

**File:** `server/routes/mealie.js`

The meal plan endpoint should return grouped meals, not raw entries. New response shape:

```json
{
  "mealPlan": [
    {
      "date": "2026-03-10",
      "mealType": "dinner",
      "recipes": [
        { "slug": "spicy-pork-ragu", "name": "Spicy Pork Ragù", "imageUrl": "..." },
        { "slug": "steamed-rice", "name": "Steamed Rice", "imageUrl": "..." }
      ],
      "coverage": {
        "spicy-pork-ragu": { "status": "in_freezer", "portions": 4 },
        "steamed-rice": { "status": "missing", "portions": 0 }
      }
    }
  ]
}
```

### 2. Backend — Notification Scheduler

**File:** `server/services/scheduler.js`

The scheduler currently creates one reservation per meal plan entry. It needs to:
- Query the grouped meal plan for tomorrow's lunch / today's dinner
- Create reservations for ALL recipes in the grouped meal, not just one
- Generate a single notification that references the full meal: "Tomorrow's lunch: Pork Ragù + Rice + Kimchi"

**File:** `server/routes/notifications.js`

The pending prompts endpoint needs to return prompts grouped by meal, not by individual recipe. Each prompt should contain the list of recipes involved.

### 3. Backend — Prompt Resolution

Currently, resolving a prompt (defrost / ate fresh / froze portions / used from freezer) applies to one meal. With multi-item meals:

**Lunch prompt (defrost):**
- Show all items in the grouped meal
- Each item gets its own defrost count (default 0, tap to set)
- "Defrost All" convenience button sets each to its household default (2 for a household of 2, or 1 per item — configurable)
- Single confirm button resolves all items at once
- Any item set to 0 is skipped (not defrosted)

**Dinner prompt (what happened?):**
- The action (Ate Fresh / Froze / Used Freezer) applies to the meal as a whole
- But quantities are per-item: if you froze portions, the QuickCounter shows each item with its own +/- counter
- "Used from Freezer" decrements each item independently

### 4. Frontend — Plan/Coverage Screen

**File:** `client/src/pages/Plan.jsx`

Currently shows one row per meal plan entry. Needs to show one row per grouped meal, with sub-rows for each recipe component. Duplicate meal plan entries for the same recipe are collapsed into a single row with a quantity.

```
Mon Dinner
  ├─ Pork Ragù    ×2    ● In Freezer (4)
  ├─ Steamed Rice  ×2    ✕ Missing
  └─ Kimchi        ×1    ● In Freezer (2)
  Overall: Partially Covered (amber)
  [Add missing to shopping list]

Tue Lunch
  └─ Leftover Ragù ×1   ● In Freezer (3)
  Overall: Covered (green)
```

Coverage states per grouped meal:
- **Covered (green):** ALL components have enough portions in freezer
- **Partially covered (amber):** SOME components available, shown as "not covered" in the summary percentage
- **Not covered (red):** NO components available

The "Add to shopping list" button opens a selection overlay:

```
┌─ Add to Shopping List ──────────────────┐
│                                          │
│ ☑ Pork Ragù       [10] portions  (−)(+) │
│ ☑ Steamed Rice     [4]  portions  (−)(+) │
│ ☐ Kimchi           [6]  portions  (−)(+) │
│                                          │
│ Defaults to full recipe yield.           │
│ Adjust if cooking a partial/double batch.│
│                                          │
│ [Add Selected to TickTick]               │
└─────────────────────────────────────────┘
```

Missing items are pre-checked. In-stock items are unchecked but selectable (in case you want to cook a fresh batch). **Portions default to the full recipe yield** (`recipeServings`) because the typical use case is batch cooking the entire recipe and freezing the rest — not cooking a scaled-down portion. The +/- buttons let you adjust if doing a double batch or a half batch.

### 5. Frontend — Prompt Cards

**File:** `client/src/components/prompts/LunchPrompt.jsx`

Currently shows one card per recipe. Redesign to show one card per grouped meal:

```
┌─────────────────────────────────────┐
│  Tomorrow's Lunch                    │
│                                      │
│  Pork Ragù    ×2   [0] [−] [+]     │
│  Steamed Rice ×2   [0] [−] [+]     │
│  Kimchi       ×1   [0] [−] [+]     │
│                                      │
│  [Defrost All]           [Skip]     │
│  [Cooking Fresh]                     │
└─────────────────────────────────────┘
```

Each recipe row shows its quantity from the meal plan (collapsed duplicates). Counter defaults to 0. "Defrost All" sets each counter to the plan quantity (2, 2, 1 in this example). User can adjust individual items before confirming.

**File:** `client/src/components/prompts/DinnerPrompt.jsx`

```
┌─────────────────────────────────────┐
│  Tonight's Dinner                    │
│  Pork Ragù + Rice + Kimchi          │
│                                      │
│  What happened?                      │
│                                      │
│  [Ate Fresh]  [Froze Portions]      │
│  [Used Freezer]  [Ate + Froze Rest] │
└─────────────────────────────────────┘
```

When "Froze Portions" is tapped, the QuickCounter overlay shows all items with individual counters:

```
┌─────────────────────────────────────┐
│  Froze Portions                      │
│                                      │
│  Pork Ragù          [0] [−] [+]    │
│  Steamed Rice        [0] [−] [+]    │
│  Kimchi              [0] [−] [+]    │
│                                      │
│  [Confirm]                           │
└─────────────────────────────────────┘
```

### 6. Frontend — Dashboard

**File:** `client/src/pages/Dashboard.jsx`

The dashboard inventory list doesn't need to change — it shows individual freezer items, not grouped meals. But the pending prompt cards at the top should use the new grouped format.

### 7. Database — Reservations

The `reservations` table already supports multiple reservations per date (one per meal_id + meal_plan_date + meal_type). No schema change needed — the scheduler just creates multiple reservations for a grouped meal.

Consider adding a `meal_group_id` column (or a composite key of `meal_plan_date + meal_type`) to make it easy to query all reservations for a grouped meal. This would also support the future calorie tracking feature where you need to know "what was in this meal" after the fact.

### 8. QuickCounter Overlay Refactor

**File:** `client/src/components/shared/QuickCounter.jsx`

Currently handles a single item with one +/- counter. Needs a new mode for multi-item:

- Accept an array of items, each with `name`, `currentCount` (default 0), and optional `maxCount`
- Render a row per item with independent +/- counters
- "Set All" convenience action
- Single Confirm returns an array of `{ mealId, count }` objects
- The bottom sheet height adjusts to fit the number of items (cap at ~60% screen height, scroll if more)

The single-item mode should still work for manual adjustments from the Dashboard.

---

## Migration Plan

This is a frontend-heavy change with moderate backend work. No database migration needed (unless adding `meal_group_id` to reservations).

**Phase order:**
1. Backend: Meal plan grouping logic + updated API response shape
2. Frontend: Plan/Coverage screen (most visual impact, validates the grouping)
3. Frontend: Prompt cards redesign (LunchPrompt + DinnerPrompt)
4. Frontend: QuickCounter multi-item mode
5. Backend: Scheduler updates for grouped notifications
6. Integration: TickTick shopping list for grouped meals (may already work if the TickTick aggregation rework lands first)

**Testing priorities:**
- Verify Mealie meal plans with 1, 2, and 3+ items per slot all group correctly
- Verify mixed entry types (dinner + side + dessert) group into one meal
- Verify single-item meals still work identically to v1 (no regression)
- Verify prompt resolution correctly updates all items in a grouped meal

---

## Future: Calorie Tracking (FatSecret Integration)

Once multi-item meals work, the calorie tracking integration becomes clean:

1. Each Mealie recipe maps to a FatSecret "saved meal" (one-time setup)
2. When resolving a dinner prompt, user sets servings per item (default 0)
3. PrepTrack calls FatSecret's API to log each item into the user's diary for that date/meal
4. Only the user's portions are logged — partner handles their own tracking

The multi-item prompt UI (per-item serving counters) is exactly what the calorie integration needs, so building it now sets up that feature cleanly.

---

## Design Decisions (Confirmed)

1. **Grouping rule:** Same date + broad meal type (lunch/dinner). `side`/`dessert`/`snack`/`drink` entries attach to the nearest lunch or dinner on the same date. Lunch and dinner are always separate grouped meals, each with their own prompt card.

2. **Duplicate entries = quantity:** Mealie doesn't support quantities per meal plan entry, so adding the same recipe twice means "2 portions." PrepTrack should collapse duplicate recipes within a grouped meal into a single line with a quantity counter (e.g. "Pork Ragù ×2"). This keeps the UI clean and maps directly to how the user thinks about portions.

3. **Default counter value:** 0 for all prompt counters (defrost, froze, servings eaten). Forces deliberate input, avoids accidental logging.

4. **"Defrost All" default:** 1 per item per plan entry (respects the quantity from duplicates). So if the plan has Ragù ×2 and Rice ×2, "Defrost All" sets both to 2. User can adjust before confirming.

5. **Coverage definition:** Partial coverage is a distinct visual state (e.g. amber indicator) shown next to the grouped meal, but counts as "not covered" in the overall coverage percentage. Individual item status visible in the breakdown inside the meal card.

6. **Shopping list (TickTick) — per-recipe selection with full-recipe default:**
   - User gets a checkbox list of recipes in the grouped meal
   - Each row shows: recipe name, adjustable portion count with +/−, recipe yield label
   - **Default is the full recipe yield** (`recipeServings`) because typical use is batch cooking the whole recipe and freezing the rest
   - Ingredient quantities scaled proportionally: `(portions_selected / recipeServings) × ingredient quantity`
   - At default (full recipe), scale factor = 1.0 — no scaling, raw ingredient list
   - User can adjust up (double batch) or down (half batch) with +/− buttons
   - Selected recipes' ingredients are aggregated by `food.id`, scaled quantities summed, then sent to TickTick

---

## Scaling Logic for Shopping List

Mealie provides `recipeServings` on every recipe (e.g. Pork Ragù = 10, Prawn Rice Bowl = 4, Courgette Fritters = 2). When adding to the shopping list:

**Default: full recipe yield (no scaling).** The typical workflow is batch cooking — you make the whole ragù (10 servings), eat 2, freeze 8. So the shopping list should contain ingredients for the full recipe by default.

```
scale_factor = portions_selected / recipeServings
```

- Default `portions_selected` = `recipeServings` → scale_factor = 1.0 (no scaling)
- User doubles the recipe: portions_selected = 20 for a 10-serving recipe → scale_factor = 2.0
- User halves it: portions_selected = 5 → scale_factor = 0.5

```
scaled_quantity = ingredient.quantity × scale_factor
```

For each selected recipe, scale all ingredients, then aggregate across recipes by `food.id` (summing quantities where units match, keeping separate lines where they don't).

Example: Monday dinner — user selects Ragù (full 10 portions) and Rice (full 4 portions).
- Ragù at ×1.0: "2500g pork shanks" stays "2500g pork shanks"
- Rice at ×1.0: "200g brown rice" stays "200g brown rice"
- Both use soy sauce: Ragù contributes 60g, Rice contributes 4 tbsp — different units, kept as separate line items with recipe attribution
