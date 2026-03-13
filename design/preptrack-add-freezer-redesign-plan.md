# PrepTrack — Add to Freezer Redesign Plan

## Summary

Replace the dedicated Add Item page with a bottom sheet overlay that can be triggered from any screen. This removes the "Add Item" entry from navigation and replaces it with a reusable sheet component.

## Design Reference

The HTML prototype is at `preptrack-add-freezer-v4.html` (attached to this plan). Open it in a browser to see the exact layout, interactions, and styling. Match it precisely.

## What Changes

### Remove
- **Remove** the Add Item page (`client/src/pages/AddItem.jsx`)
- **Remove** "Add Item" from the desktop sidebar navigation (`client/src/components/layout/Sidebar.jsx`)
- The mobile bottom nav already doesn't have a dedicated Add Item tab (it uses a FAB), so no change needed there

### Create
- **New component:** `client/src/components/shared/AddToFreezerSheet.jsx` — the bottom sheet overlay

### Modify
- **Dashboard.jsx** — FAB triggers the sheet instead of navigating to /add
- **Plan.jsx** — "Add to freezer" buttons on coverage rows trigger the sheet (pre-filled with the meal name)
- **ItemDetail.jsx** — "Add batch" button triggers the sheet (pre-filled with the meal name)
- **App.jsx** — remove /add route
- **Sidebar.jsx** — remove "Add Item" nav entry, nav becomes: Dashboard, Plan, Inventory, Settings
- **api.js** — no changes needed, existing `mealsApi.create()` and `batchesApi.create()` endpoints still work

## Component Spec: AddToFreezerSheet

### Props
```jsx
{
  isOpen: boolean,          // controls visibility
  onClose: () => void,      // called on cancel, overlay tap, or successful submit
  prefillName: string?,     // optional — pre-fill meal name (from Plan or ItemDetail)
  prefillRecipeSlug: string?, // optional — auto-link Mealie recipe
}
```

### State
- `name` — meal name text input
- `portions` — number, default 2
- `shelfMonths` — selected shelf life (1, 2, 3, or 6), default from `default_expiry_days` setting (convert days to nearest month option)
- `isCustomExpiry` — boolean, true when user manually edits expiry date
- `freezeDate` — date, default today
- `expiryDate` — computed from freezeDate + shelfMonths, or manually set
- `notes` — string, hidden by default
- `showNotes` — boolean
- `category` — string, auto-filled from Mealie recipe selection
- `linkedRecipeSlug` — string, set when autocomplete selects a Mealie recipe
- `autocompleteResults` — array from existing meals + Mealie recipe search

### Layout (two rows below the meal name input)

**Row 1 — Shelf life pills:**
```
[1m] [2m] [3m] [6m] [Custom]
```
- 1m/2m/3m/6m are tappable, one is always active (blue highlight)
- "Custom" starts greyed out and disabled (faded text, no pointer events)
- When user manually edits the expiry date via the ✎ on the summary row, "Custom" activates (teal highlight) and the month pills deselect
- When user taps a month pill again, "Custom" goes back to greyed out and expiry recalculates
- Default selected pill should match `default_expiry_days` from settings (90 days → 3m, 180 days → 6m, etc.)

**Row 2 — Summary card (single unified row with 3 equal cells):**
```
┌─────────────┬──────────────┬──────────────┐
│ FROZEN      │ PORTIONS     │ EXPIRES      │
│ Today ✎     │  − 2 +       │ 12 Jun 26 ✎  │
└─────────────┴──────────────┴──────────────┘
```
- All three labels ("Frozen", "Portions", "Expires") at the same height and size
- Frozen: shows "Today" or formatted date. Tappable (✎ hint, hover highlight), opens date picker
- Portions: compact inline − number + buttons. Default 2.
- Expires: computed date. Tappable (✎ hint, hover highlight), opens date picker. Manual edit activates "Custom" pill.
- The whole row is a single card with subtle background and border, cells divided by thin vertical lines

### Autocomplete Behaviour
- On focus: show dropdown with all existing meals + Mealie recipes
- On type: filter by name
- On select from dropdown:
  - Fill meal name
  - Set `linkedRecipeSlug`
  - Set `category` from Mealie's `recipeCategory[0].name`
  - Show category as a small badge below the input
- On manual type (not selecting from dropdown):
  - Clear `linkedRecipeSlug` and `category`

### Submit Flow
1. Validate: name is required, portions >= 1
2. Check if meal already exists in DB (by name match)
   - If exists: create a new batch on the existing meal
   - If new: create the meal first, then create the batch
3. Set `freeze_date` and `expiry_date` on the batch
4. If `linkedRecipeSlug` is set and meal is new, save it on the meal record
5. Show success toast: "✓ Added to freezer"
6. Close sheet
7. Refresh the parent's meal list (call the refresh function from useMeals hook)
8. Reset all fields to defaults

### Animation
- Sheet slides up from bottom with `transform: translateY(100%) → translateY(0)` 
- Use cubic-bezier(0.32, 0.72, 0, 1) for the spring-like feel
- Background overlay fades in simultaneously
- Dashboard/content behind dims
- On close: reverse animation
- Transition duration: 350ms

### Styling (match PrepTrack design system exactly)
- Sheet background: `#1a2332`
- Sheet border-radius: 20px top corners
- Handle bar: 36×4px, `rgba(148,163,184,0.25)`, centered
- Input background: `rgba(30,41,59,0.6)`
- Input border: `1px solid rgba(148,163,184,0.15)`
- Input border-radius: 12px
- Active shelf pill: `rgba(43,140,238,0.12)` bg, `rgba(43,140,238,0.4)` border, `#2b8cee` text
- Custom pill active: `rgba(45,212,191,0.1)` bg, `rgba(45,212,191,0.3)` border, `#2dd4bf` text
- Custom pill disabled: `#334155` text, `rgba(148,163,184,0.06)` border, no pointer events
- Summary row background: `rgba(30,41,59,0.35)`
- Summary row border: `1px solid rgba(148,163,184,0.08)`, 12px radius
- Cell dividers: `1px solid rgba(148,163,184,0.08)`
- Submit button: `#2b8cee`, 12px radius, full width, 16px padding
- Submit disabled: `rgba(43,140,238,0.25)` bg, `rgba(255,255,255,0.35)` text
- All tap targets: minimum 48px (buttons are 42-48px height)
- Toast: `#22c55e` background, 12px radius, slides up from bottom

### Keyboard
- Escape: close sheet
- Cmd/Ctrl + Enter: submit (if form is valid)

### Notes Section
- Hidden by default, shown via "+ Add notes" text link
- Toggle between "+ Add notes" and "− Remove notes"
- Textarea: 60px height, same input styling

## Tasks (in order)

### Task 1: Create AddToFreezerSheet component
- Build the full component matching the prototype
- Include all state management, shelf life logic, custom expiry logic
- Include autocomplete using existing Mealie search + existing meals query
- Include submit flow (create meal/batch)
- Use existing `useMeals` hook for meal list refresh
- Use existing `useSettings` hook to read `default_expiry_days`

### Task 2: Wire up to Dashboard
- Import AddToFreezerSheet in Dashboard.jsx
- FAB opens the sheet (`setSheetOpen(true)`)
- On sheet close, refresh meals list

### Task 3: Wire up to Plan/Coverage
- "Add to freezer" buttons on missing/uncovered meal rows open the sheet
- Pre-fill `prefillName` and `prefillRecipeSlug` from the meal plan entry

### Task 4: Wire up to ItemDetail
- "Add batch" button opens the sheet
- Pre-fill `prefillName` with the meal name

### Task 5: Clean up navigation
- Remove /add route from App.jsx
- Remove "Add Item" from Sidebar.jsx
- Desktop nav becomes: Dashboard, Plan, Inventory, Settings
- Verify all links/references to the old Add Item page are removed

### Task 6: Test
- Verify sheet opens from Dashboard FAB
- Verify sheet opens from Plan coverage with pre-filled meal name
- Verify sheet opens from ItemDetail with pre-filled meal name
- Verify autocomplete works (existing meals + Mealie search)
- Verify shelf life pills calculate expiry correctly
- Verify manual expiry edit activates "Custom" pill
- Verify tapping a month pill after custom resets expiry to calculated
- Verify submit creates meal + batch correctly
- Verify toast appears and sheet closes on success
- Verify Escape and overlay tap close the sheet
- Verify mobile layout (full width, proper spacing)
- Verify desktop layout (max-width 480px, centred or aligned to content area)
