# Meal Prep 5.2: app guide

How the app is laid out and what each button does, tab by tab. Written for version 5.2 (`Meal Prep App Mobile v5.dc.html`, deployed as `index.html`).

## How the app works

- **Three parts.** `catalog.json` holds items, prices, item numbers and recipes, built from the master spreadsheet. Your own data (kitchen, menu, receipts, settings) lives only on the phone. `index.html` is the app.
- **A trip** runs from one Aldi visit to the next. It moves through four steps: **Menu** (pick meals), **Groceries** (buy them), **Receipt** (log what you paid, which stocks the kitchen) and **Cook** (eat day by day).
- **Budget.** Each trip gets weekly budget × days ÷ 7, plus or minus what was left over or overspent on the last trip (capped at one week's budget). A trip with no receipts carries nothing over. You can override the budget for one trip. Always-stocked items share it.
- **Undo and redo.** The curved arrows at the top left of every screen undo and redo. Press and hold undo to open History, where **Undo back to here** steps back several changes at once. Short confirmations appear under the header.
- **Dark theme** follows the phone's setting.

Five tabs run along the bottom: **Days**, **Menu**, **Groceries**, **Kitchen** and **Settings**. A number on Kitchen counts food due within 2 days.

---

## 1. Days: what do I eat now?

- **Title:** "This trip until [date]", with meals left and the number of people.
- **Next button** (before cooking starts): **Next: start a trip**, **Next: pick meals, then shop** or **Next: log your receipt**. **?** beside it opens "How does a trip work?".
- **Next trip chip** (after a receipt): "Next trip: [date]" with **Change** and **×**.
- **One notice at a time**, in this order: trip ended (**Move the date** / **Start a new trip**), meals that won't fit (**Change trip date** / **Edit menu**), eat soon (chips that open the recipe or Kitchen), you could make now (**Plan next trip**). **N more** shows the rest.
- **Today and tomorrow** as full cards:
  - **"Normal day · 2 people ⌄"** opens **Busy / Normal / Have time** and **− people +** for that day only.
  - **Each meal:** the recipe name opens the recipe sheet, with the reasons for the pick below it. **Cooked it** opens the *Cooked it* sheet. Leftovers have **− servings +** and **I ate it**. **Other** shows **Change**, **Not tonight** and **Ate out**. An empty meal has **Choose a meal** or **Ate out**. A done meal shows what happened, with **Undo**.
- **Later this trip:** one row per day. Tap one to open its full card; **Fold** closes it.
- **Snacks and extras** (below the days, only when always-stocked items are on): low-stock lines open Kitchen › Always stocked, and **Had some [item]** chips open the *Had some* sheet.

---

## 2. Menu: where you choose

- **Pinned line:** the step strip (**Menu / Shop / Receipt / Cook** and **?**), then "$X of $Y · N of M meals" with a thin bar. **Budget ›** opens the budget sheet, which shows how the trip's share is worked out.
- **Suggested / Browse all / My menu** switches the view.

### Suggested
- **Fill my trip for me** keeps your picks and fills every open slot under budget.
- **Cook double when it keeps:** switch. Recipes that keep 2 days or more start at 2x, for leftovers.
- Suggestions are grouped by open slot (Breakfasts, Lunches, Dinners), 3 each, with **Show more**. Recipes you can make now come first, then ones that use expiring food, then the cheapest.

### Browse all
- **Search** (names, tags, ingredients) and **Filters**: total time, I can make now, Uses what's expiring, Keeps 3+ days, tags, sort.
- **Meal chips** (All, Breakfasts, Lunches, Snacks, Dinners). Active filters show as chips with **×**; **Clear all** removes them.
- **Recipe count** and **+ New recipe**.

### Recipe cards
- **Name** opens the recipe sheet. The line below gives meal, time, servings made, cost per serving (● real prices, ○ some estimates) and up to two tags. Labels such as *Can make now* appear when they apply.
- **2x tag** (recipes that keep): tap to switch between single and double.
- **Adds $X** is what the recipe adds to the shopping list after counting what you have; the dotted link below explains the difference from cost per serving.
- **Add** puts it on the menu.

### My menu
- Grouped by meal. Each row has **1x / 2x** and **×**. **Fill the rest** fills open slots. **Cooked** folds away the meals you've made.
- **Done picking: go to Groceries** sits in a bar above the tabs once something is on the menu.

---

## 3. Groceries: the list you use in the store

- **Step strip** and the trip dates, with **+ Add item**.
- **Budget meter:** to buy of the trip budget, a status pill, and one line splitting it into menu, always stocked, extras in cart and bought so far. Tap it for the budget sheet. **Budget too tight** appears only when the menu alone doesn't fit.
- **One note at a time** (unchecked staples, old prices), with **N more**.
- **Shopping list**, grouped by store section. Each section header shows a count and subtotal and folds; **Collapse all / Expand all**.
  - **Tap anywhere on a row** to put the item in the cart.
  - **The price** is a separate tap: type a new price and **Save**.
  - **⋯** (or press and hold) opens **I already have this**, **Not this trip** and **Change price**, plus which menu recipes use it.
  - The line under the name shows the package, and the Aldi item number when the item has one (for example `#382147`).
  - **\*** marks an estimated price.
- **In the cart** (folds): ticked items with **Take out**. **Add N checked items to kitchen** stocks the kitchen without a receipt.
- **Running low** (folds): staples marked Low, not in the total. Tap one to add it.
- **Not this trip** (folds): items you skipped, each with **Put back**.
- **Receipts:** this trip's receipts, with **Log receipt** or **Continue**.
- **Trip:** dates and budget. **Edit** opens **Change the next trip date**, **Budget for this trip** (with **Use the usual share**) and **Start a new trip**.
- **Menu:** meals to cook. **Edit** goes to the Menu tab.
- **Bar above the tabs:** **I'm at the store** when there's a list, then **N in cart · $X · Log receipt**.

### In-store mode
Full screen: amount left, large rows by section (tap to tick, tap the price to fix), Running low, In the cart, **+ Add item**, and **Done, log receipt**.

---

## 4. Kitchen: what you have

- **Summary:** items, leftovers, due soon.
- **Add something you have:** search, then **+ Add** (or **Have it** for staples). **Can't find it? Add a new item.** An empty kitchen shows **Add what you have** and **Check pantry**.
- **You could make now:** top 3, **See all**. Each has **Add to menu**.
- **One item away** (folds).
- **Eat soon** chips.
- **Leftovers** (folds): **− servings +**, **I ate it**, **Toss**.
- **Food on hand**, grouped Fridge, Freezer, Pantry, each with a use-by chip. **N items to confirm** opens the quick check (**Same**, **Less**, **Gone**, **Done checking**). Tap an item for **− +**, **Had some**, and each batch's **Amount** (Empty, ¼, ½, ¾, Full) and **Freeze**.
- **Pantry ›** opens the pantry screen: **Open the pantry checklist** and every staple by shelf. Tap one to set Not checked, Have, Low, Out or Don't buy. Only an Out staple that a menu recipe needs goes on the list.
- **Always stocked ›** opens that screen: a switch per item, **Keep at least − N +**, the usage rate, **Remove**, **+ Keep something else stocked**, and **Habits** (how fast you get through each one).

---

## 5. Settings

Six rows, each opening its own screen with a back arrow.

- **Household:** **People − +**, **Weekly budget**, and **Your week**: a day type per weekday (tap to cycle Normal, Busy, Have time) and a **Shop** radio for your usual shopping day. Picking a day moves the next trip to it.
- **Calendar and reminders:** next trip date, **Add my next trip to my calendar**, and the price reminder.
- **Backup and restore:** **Copy backup**, **Save as file**, **Share backup file**, status lines, the paste box with **Restore pasted** and **Restore from file**, and the last 5 automatic copies with **Restore**. Restoring asks first and saves a copy of the current state.
- **My items and recipes:** items you added (**Link them?** when one now matches a catalog item, **Edit**, **Add an item**, **Copy as CSV**) and your recipes and versions (**Edit**, **Use original**, **New recipe**).
- **Prices and catalog:** price freshness, **Check for a new catalog now**, **Advanced: send phone changes to the spreadsheet** (**Export my additions**, plus the price and alias CSV buttons), and the price list with **All / Edited / Estimated / From receipts** chips and **Reset**.
- **Help and about:** History, Diagnostics (errors, recent actions and budget inputs, with **Copy** and **Clear errors**), the version line (tap for build and data format), and the help questions.

---

## Log receipt

- **Enter items / Paste receipt** tabs and the **Receipt date**.
- **Which trip:** one sentence saying what the receipt will do, with **Change**. The app decides:
  - no trip running, or the trip has ended → a main shop that starts a new trip;
  - the first receipt of the current trip → the main shop for that trip;
  - a later receipt under a third of the trip budget → a quick stop that adds to the trip.
  
  **Change** offers **Main shop** ("I did my regular shopping") and **Quick stop** ("I just grabbed a few things"), each explaining what it does.
- **Each line** has two rows:
  - **Name** (tap to open the line's details), with the item number, the receipt wording and how it was matched underneath. **×** removes the line, and **Undo** appears for a few seconds.
  - **− count +** for packs, or the **weight** with an **lb / oz** button for weighed items, then **@ $ each** (or **$ /lb**) and **= $ total**. Type either price and the other fills in. Changing the count or weight keeps the price each and updates the total.
- **Line details:** **Change item**, **Not food** for pasted lines, size chips (and **Other size** with its unit), the price per unit, and **Sale or discount ›**. The sale row opens by itself when the price differs from usual by 8% or more (**Sale price** / **New regular price**) or a discount was read.
- **Empty receipt:** **Add a line** or **Start from cart**.
- **Footer:** lines, tax, discount and total, with **Total printed on receipt** checked against it. **More** holds tax, whole-receipt discount and item count.
- **Add N items · $X** saves the receipt. Your work is saved as you type.

### Paste receipt
- Paste lines in the form `description, quantity, line total, item number`, for example `All Purpose Flour, 1, 1.95, 382147`. Paper-style lines with the number first (`382147 All Purpose Flour 1.95 FA`) also work, as does the `(N) 1.82 lb x 0.85/lb` weight line. Store, card, reference and transaction numbers are ignored.
- **Copy message for Claude** gives a prompt for turning a receipt photo into those lines.
- **Read receipt** fills the table. Repeated lines of the same product at the same price become one line with a count (six yogurt drinks become one line of 6 at $1.97). Same product at different prices (two packs of stew meat) stays separate.
- **Matching order:** item number, then a receipt name you've matched before, then a best guess. Lines in red need you to choose the item.

### Aldi item numbers
- Each Aldi product has a 6-digit number at the left of its receipt line. The same product always prints the same number, so it's a more reliable match than the abbreviated name.
- **From the spreadsheet:** the Items sheet has an `aldi_numbers` column. Several numbers (sizes, brands) go in one cell, separated by semicolons.
- **Learned on the phone:** when you choose the item for a line whose number isn't known yet, the app remembers the number when you save the receipt. Other lines with that number in the same receipt are filled in at once.
- **Typing a number:** in the item search, digits find items by number. On a receipt line, typing a number that isn't known yet shows a note; pick the item and the number is remembered for it.
- **To the spreadsheet:** **Export my additions** includes the numbers. The catalog builder shows them as an "Aldi item numbers" group with the full `aldi_numbers` value for each Items row, and flags a number that the spreadsheet already has on a different item.

---

## Other sheets

- **Recipe sheet:** times, keeps and reheats, servings and cost, optional ingredients, scaled ingredients with what you have, **Make my version / Edit**, **Use the original**, **Open full recipe**.
- **Recipe editor:** name, meal, makes, keeps, times, reheats, tags, ingredients (amount with a unit menu that converts tsp, tbsp, fl oz and cup, or oz and lb, plus Needed / Optional and "As written"), cost, link, **Delete**, **Cancel**, **Save**.
- **Item search:** recent and frequent items when empty; name, receipt-name or item-number search; **Add "…" as a new item**.
- **Cooked it:** what's taken from which batch, the cost and leftovers. When a package would be nearly empty afterwards, it asks how much is left (**Looks right**, Empty, ¼, ½, ¾).
- **Not tonight:** **Move to tomorrow**, **Put back on my menu**, **Drop from my menu** (leftovers: **Skip for now**, **Throw them out**).
- **Choose a meal**, **Had some** (A little, ¼, ½, Whole), **Pantry checklist** (three answers per item, **Whole shelf**, search).
- **Start a trip:** **At the store**, **Plan ahead**, **Already shopped**, or a date.
- **First-run setup:** people, budget, shopping day, what you already have, then your first trip.
- **Budget sheet:** weekly budget × days ÷ 7, carryover and override, step by step.
- **Update ready:** **Reload** loads the new app version.
