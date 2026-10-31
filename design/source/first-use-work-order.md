# Meal Prep first-use work order
Oct 18, 2026 · @Nelson
## Scope and decisions
This order comes from five rounds of using the 6.5 app as a first-time user: setup and the first trip, Menu and the shopping list, Days, the store and the receipt, and cooking and the Kitchen. I asked, you answered and sent screenshots, and this order combines the two. The evidence is the 6.5 screen guide, about thirty screenshots and your answers. I haven&apos;t seen the source file, so anything about how screens are built is for Claude Code to check against the real code. Package numbers continue from the last order (WP47 to WP53), so this one runs WP54 to WP67.
Rounds 6 to 8 then covered the calendar, essentials and always stocked, settings and backup, and the end of a trip and your second week. Those answers became WP63 to WP67. They were decided by your answers, not by screenshots, so each of those packages starts with a check against the real screens. Reset, web import and the Google Sheet screens beyond their status line weren&apos;t discussed and are not in this order.
Out of scope: accounts, syncing between phones, push notifications, nutrition tracking.
Round
Area
What you decided, or what the screenshots showed
Status
Package
1
Setup, people
Keep names. Replace the age buttons with a slider from "eats less" to "eats more" for each person. Count mode gets an optional line for anyone who eats more or less.
Decided
WP54
1
Setup, pantry
No checklist in setup. Ask about a staple only when a recipe needs it, batched near shopping time and inline in the cook sheet.
Decided
WP54, WP58
1
Setup, step 5
The dinner prices beside "Plan your first trip" were unclear, so label them and say what Fill will plan.
Proposed
WP54
2
Shopping time
You shop later today, and the plan should cover every meal after you get home.
Decided
WP54
2
Breakfast
It is loose: some days a bagel, an egg or a bar, some days nothing. Keep your usual items stocked and plan a real breakfast only on days you choose.
Decided
WP54
2
Lunch and dinner
The pattern changes week to week, so ask "how will you eat this week?" when a trip starts.
Decided
WP54
2
Browse all
A sideways row of compact cards for each protein.
Decided
WP56
2
Recipe card
A photo, total time, cuisine and tags, and "Adds $X to buy now."
Decided
WP56
2
Filters and clutter
Filters becomes an icon with a badge. The duplicate "Mains" chip and the Cook double switch leave Browse.
Proposed
WP56
2
After Fill my trip
Land on My menu to review the plan before shopping.
Decided
WP56
2
Quick plan
Offer it first when you pick for yourself. Its animation is choppy, which is low priority.
Decided
WP56, WP62
2
Shopping list
Order by store section. Items your kitchen covers sit greyed out at the bottom.
Decided
WP61
3
Moving between days
Swiping is natural.
Decided
None
3
Passed meals
Meals that have passed stay on the card, and you mark them skipped or ate out.
Decided
WP57
3
Cooked it before a receipt
Allowed, with a warning of what&apos;s missing.
Decided
WP57, WP58
3
Changing the next trip date
You set Monday yourself, and the app gave a one-day budget with no explanation.
Proposed
WP55
4
Receipt after reading
One skim list. Suggested names are applied for you, and only lines that need you are marked.
Decided
WP59
4
Brand and flavor
Never asked automatically, and one tap away.
Decided
WP59
4
Total off by cents
Show the three most likely lines side by side with their photo strips.
Decided
WP59
4
Old receipt date
Log the receipt under the date it prints.
Decided
WP59
4
Budget at the store
Calm amber, not red.
Decided
WP61
4
Same item from two rules
One line with the combined amount.
Decided
WP61
5
A missing ingredient in the cook sheet
Ask right there: "I have it" or "Add to my list."
Decided
WP58
5
Quick check
Swipe through cards: same, less, gone.
Decided
WP60
5
Food past its use-by date
One line, "11 past use-by, review," with a bulk Toss.
Decided
WP60
Decisions from rounds 6 to 8:
- Calendar: spoilage comes first, and tapping a spoil day leads with meals that use those items (WP63).
- Always stocked: the app suggests items you keep rebuying, as one card right after a receipt (WP64).
- Essentials: you tap Opened new in At home › Essentials, as now (WP64).
- Settings: you use Backup and Prices, and the Google Sheet connection is how you keep recipes and prices, so it stays visible (WP65).
- Backup: automatic, saved to Google Drive (WP66).
- End of a trip: ask what to keep from the meals you never cooked (WP67).
- Fill: use up what&apos;s expiring first (WP67).
- Thumbs: rank lower and don&apos;t hide (WP67).
## What first use showed
Most of the logic held up. The cook sheet&apos;s preview, the day gallery, the receipt table with a photo strip under each line, and swiping all work. The problems are in the first hour: numbers that don&apos;t add up, too much on screen at once, and places where the app asks you for something it could work out. In rough order of damage:
- A week&apos;s shop landed on a one-day trip. The Plan next trip card reads "Next trip Mon, Oct 19 · 6 days · $102.86, minus $164.16 overspent," which leaves the next trip with a negative budget. The "When&apos;s your next trip?" sheet never opened. Fixed in WP55.
- There is no way back to that question. The receipt attached to the trip that already existed, so the app didn&apos;t ask, and the header card with "Next trip · Change" is hidden once you are cooking. Fixed in WP55.
- Shelf-stable food shows as expired. Canned tuna, marinara, sparkling water and summer sausage are all red "expired" a few days after the receipt date. New items seem to get a short default use-by. Fixed in WP60.
- Eat soon is a wall of 13 chips, 11 of them red, with "Not on your menu yet" repeated twelve times, and the Kitchen tab badge reads 13. Fixed in WP60.
- The receipt review is overload. Above the first row sit a red header, two buttons, the trip line, a date, five store chips and, below, an amber message with its own line and button. An open row has nine controls. Fixed in WP59.
- A receipt row contradicts its own photo. The row says #282743, and the strip under it reads 382745. Fixed in WP59 on top of WP48.
- The photo strips show slices of the lines above and below, which makes them harder to read. Fixed in WP59.
- The total is off by $0.16 and nothing points at the line. The footer reads "Lines $137.55 = $137.55 ≠ $137.39." Fixed in WP59.
- The cook sheet fights an empty kitchen. Olive oil, onions and garlic are red "not in your kitchen," olive oil isn&apos;t treated as a staple, six spice lines say "Staple (not checked)," and amounts read "2¾ cloves garlic," "¾ multicolored peppers" and "⅛ tsp chili powder." Fixed in WP58.
- After cooking, two slots are pre-ticked for 2 portions that cover one, so the sheet shows a red "not enough for all of these," next to "2 of 2 placed." Fixed in WP58.
- The leftovers card repeats "eat by Oct 21" twice. Other turns into Less, a word Quick check also uses for "less than before." Fixed in WP57.
- Quick check is eight large rows, each with three big buttons. Fixed in WP60.
- Browse all gives you eight rows of controls before the first recipe. A card squeezes its text into a narrow column that wraps to four lines, with a red "Goes over by $23.34" pill. About one and a half cards fit on a screen. "Mains" appears twice, and Filters is a plain button with no icon. Fixed in WP56.
- Menu shows "Over by $16.02 · 2 of 3 meals" in red for what turned out to be a one-day trip, and "Fill my trip for me" lands on Groceries. Fixed in WP55 and WP56.
- Setup puts "Person 1" and "Person 2" in the name fields as real text. The age buttons feel invasive and guess wrong. The pantry checklist is 63 items that you closed unanswered, and the step 5 prices beside each dinner don&apos;t say what they are. Fixed in WP54.
- At the store the header says "Over by $33.94" in red, and Large eggs appears twice, once under always stocked and once in the cart. Fixed in WP61.
- Today&apos;s card offered breakfast at 11:41 am, and Cooked it, before you had shopped. Fixed in WP54 and WP57.
## WP54: Setup and the first trip
Goal: setup asks only what the app needs, in your own terms, and ends on a plan that fits how you really eat. Setup stays five steps. Step 1 changes, step 3 gains a question, step 4 loses the pantry checklist, and step 5 becomes a real preview.
Changes
- Make the name fields start empty, with "Name" as placeholder text, not "Person 1" as real text you have to delete. A blank name becomes "Person 1" quietly when you tap Next.
- Replace the age buttons with an appetite slider for each person, running from "Eats less" to "Eats more" in five stops (Small, Light, Usual, Hearty, Big). Map them to 0.5, 0.75, 1.0, 1.25 and 1.5 portions, start on Usual, and read the result back in words ("about 1 portion"). Never ask for age. Keep the per-meal fine-tune in Settings, Household. Members created earlier keep their appetite value and lose the age field from the screen.
- In count mode, add a line under the stepper: "Does anyone eat noticeably less or more?" with "Not really" selected and "Yes, set it up," which opens one slider per person.
- Remove "Check my pantry" from step 4. Make step 4 an optional "What&apos;s in the fridge right now?" with the search and the "about how much is left" chips, and add the line "Pantry basics like spices and oil: I&apos;ll ask only when a recipe needs one." Skipping stays the default.
- Ask about staples just in time. When the menu holds a recipe that needs a staple you haven&apos;t answered about, show one note on Groceries, "Check 6 pantry items the menu needs," that opens a single short list. Each item has three answers (Have it, Buy it, Don&apos;t buy), with "Have all of these" at the top. Sort it by shelf and include only what the menu needs. The same question appears inline in the cook sheet (WP58).
- Add a question to step 3, "When are you shopping this trip?" with Today, Tomorrow, Another day and "I already shopped." Today asks "First meal after you&apos;re home?" with the next sensible meals as chips.
- Handle meals that have already passed when a trip starts. Fill doesn&apos;t plan them. They show as one row, "Earlier today: breakfast, lunch," with Skip them, and per meal Cooked it and Ate out. This keeps your rule that passed meals stay visible and you mark them, without making you mark each one.
- Add "How will you eat this week?" to Start a trip and to step 5, with four chips: "Cook dinner, leftovers for lunch," "Cook lunch and dinner," "A mix, I&apos;ll decide as I go" and "Mostly eating out." The answer sets how many mains Fill plans per day, and defaults to your last answer.
- Make breakfast optional. By default a trip has no breakfast recipe slots. Each day card has a "+ Breakfast" chip for the days you want one. Add a "Your usual breakfast" list (for example bagels, cream cheese, eggs, granola bars) held as always-stocked items. On a day with no recipe, the breakfast row reads "Your usual" with Had some chips, so a bagel gets logged in one tap.
- Make step 5 a real preview. Show "6 days · 6 mains, some doubled · $102.86" and the three example dinners, each labeled "$1.24 a serving." Say what Fill will plan: "This fills every meal after you&apos;re home, within the budget."
- Keep the two buttons, and change where they lead. "Fill my trip for me" lands on My menu to review the plan (WP56). "I&apos;ll pick myself" opens Quick plan.
- Create the trip only when step 5 finishes. Today a trip seems to exist from step 3, because the Days screen behind the pantry sheet already read "0 meals left · Trip ends Friday."
Acceptance
- The name fields are empty with a placeholder, and blank names become "Person 1" and "Person 2."
- No age appears anywhere in setup. The slider gives 0.5 to 1.5 and the readout updates.
- Count mode with "Yes, set it up" shows one slider per person.
- Setup has no pantry checklist. Adding a menu recipe that needs cumin produces "Check 1 pantry item" on Groceries.
- Starting a trip at 11:41 am with "Today" and "Dinner" as the first meal leaves breakfast and lunch out of Fill, and shows one "Earlier today" row.
- Choosing "Cook dinner, leftovers for lunch" gives one main per day, cooked double, in Fill&apos;s output.
- A fresh trip has no breakfast recipe slots until you tap "+ Breakfast."
- No trip exists until step 5 completes.
## WP55: Trip dates, budget and the next-trip question
Goal: the app never lets a week&apos;s shop sit on a one-day trip without saying so, and the next-trip date can always be found and changed. Here is what happened to you. You set the next trip to Monday yourself, so the trip was one day long. The $137.39 receipt then attached to that trip as its first receipt, and the app asks "When&apos;s your next trip?" only after a receipt that starts a new trip, so nothing came up. Once you were cooking, the header card with "Next trip · Change" was hidden. The next trip&apos;s budget then went to $102.86 minus $164.16.
Changes
- Ask about the next trip after every main shop, including one that attaches to a trip you planned. Show it as a card on Days, not a sheet, so it can&apos;t be dismissed unseen: "This shop covers until Mon, Oct 19 (1 day). Is that right?" with Yes and Change. Keep it until it is confirmed or changed.
- Add a size check. If a main shop&apos;s total is more than twice the trip&apos;s budget share, say so: "This looks like more than 1 day of groceries ($137 against a $17 budget). When&apos;s your next trip?" with the usual quick picks.
- Keep "Next trip · Change" visible at all times. During cooking, shrink the Days header card to one line ("Trip ends Fri · Next trip Sat, Oct 24 · Change") instead of hiding it. Show the same Change link on the Groceries trip row and on the last card of the gallery.
- Confirm a date change that shortens the trip, with what it does: "The trip becomes 1 day and the budget $17.14. 2 meals fit and 4 won&apos;t. Keep or cancel."
- Cap the overspend that carries forward. Carry at most half the weekly budget (so $60 on a $120 week), say how much was overspent and how much carries ("Overspent $164.16, $60 carries forward"), and add "Start fresh" to drop it. Unspent budget stays capped at one week, as now.
- Fix the wording on the Plan next trip card. Show one line per fact: the next trip date with a Change link, the length in days, the budget, and the carry ("Budget $102.86, minus $60 carried: $42.86"). Make the length agree with the date. "Mon, Oct 19 · 6 days" does not.
- Show a note on Groceries when the trip is very short: "This trip is 1 day long. Is that right?" with Change dates.
- Make the budget line in Menu amber, not red, on a trip of three days or fewer, with the hint "Short trip: budget $17.14." Red stays for real overspends on normal trips.
- Keep the Budget sheet&apos;s formula visible, for example "$120 × 1 ÷ 7 = $17.14."
Acceptance
- Adding the $137.39 receipt to a trip with a $17.14 share shows the card, with "more than 1 day of groceries."
- On Days during cooking, the header shows "Next trip · Change" on one line, and Change opens the date sheet.
- Changing a 6-day trip to 1 day shows the confirmation with $17.14 and "2 meals fit."
- An overspend of $164.16 carries $60 and the card says both numbers. "Start fresh" removes the carry.
- The Plan next trip card&apos;s day count matches its date.
- The Menu budget line is amber on a 1-day trip.
## WP56: Menu
Goal: Browse all lets you scan 53 recipes in a few swipes, each card shows only what you decide on, and the screen has room for recipes. Today eight rows of controls come before the first recipe, a card is squeezed into a narrow column that wraps to four lines, and you have to scroll past every chicken dish to reach the other proteins.
The drawing shows the new Browse all on the left and one card on the right. It is a wireframe for structure, not a visual design.
Browse all as rails · card anatomy
The peek of the next card on each rail is what shows people they can swipe sideways.
Changes
- Replace the vertical grouped list with one sideways row (a rail) per protein. Each rail has a heading with its count, "Chicken 26," and "See all ›." About two and a half cards show, so the next one peeks. Order the rails Chicken, Beef, Pork, Fish and seafood, Eggs and vegetarian, then Everything else. With Group by Cuisine, the rails are cuisines. "See all" opens that group as a vertical list.
- Make the card compact, about 92 px wide in the rail. It has a photo (or a colored protein tile when there is none), the name in at most two lines, "30 min · Mexican," "Adds $7.32" in bold and an Add button. Move the heart, the 2x chip, the per-serving price with its ○ or ● dot, and the extra tags to the recipe sheet and My menu. Remove the red "Goes over by" pill. An over-budget add turns the budget line amber and shows a toast.
- Keep the kind tabs (Mains, Sides, Desserts, Drinks, Snacks, Sauces) and add Breakfasts as a tab, since breakfast is optional. Remove the second row of chips (All, Breakfasts, Mains), which repeats "Mains."
- Turn Filters into a funnel icon with a count badge inside the search field. Show active filters as chips only when some are on. Move the Cook double switch into Filters, and move "+ From the web" and "+ New recipe" into one "+" menu at the end of the kind tabs. Drop the "53 recipes of 72" line, since each rail shows its own count.
- Pin only the budget line and the three-way switch (about 90 px). Let the step strip scroll away, and keep the kind tabs and search row in the page, not pinned.
- Show at least two rails under the header on a 360 by 640 px screen.
- Make "Fill my trip for me" land on My menu with a review bar, "Looks good? Go to Groceries," and a summary line at the top ("6 mains, 2 desserts · $94"). Each row can be removed or changed.
- Make "I&apos;ll pick myself" open Quick plan first, with "Browse all" as a button at the bottom of it. Add a one-line "Quick plan: swipe through recipes" entry at the top of Browse all, so it can&apos;t be missed again.
- Load card photos lazily and draw only the rails near the screen.
Acceptance
- Browse all opens with a funnel icon, kind tabs, and at least two rails visible on a 360 by 640 px screen.
- A card has a photo, a name of at most two lines, time and cuisine, "Adds $X" and Add, and no heart, 2x or red pill.
- "Mains" appears once.
- Swiping the Chicken rail moves only that rail, and "See all" opens a vertical list of its 26 recipes.
- Fill my trip for me lands on My menu with the review bar.
- "I&apos;ll pick myself" opens Quick plan, and Browse all has the Quick plan entry.
## WP57: Days
Goal: a day card shows what matters, its buttons say what they do, and nothing is said twice. Swiping between days stays as it is. You found it natural.
Changes
- Show passed meals as the "Earlier today" row from WP54, with Cooked it, Ate out and Skip for each. Skipped meals show a quiet "Skipped" line and don&apos;t count in "meals left."
- Allow Cooked it before any receipt, as you chose, and add a quiet line under the meal while the trip has no receipt: "Groceries not logged yet · Log receipt." The warning about what&apos;s missing is in the cook sheet (WP58).
- Replace the in-place expansion that swaps Other for Less with one More button that opens a small menu with Change, Not tonight (or Not today) and Ate out. "Less" is retired, because Quick check uses it for "less than before."
- Say each fact once on the leftovers card. Today it repeats "eat by Oct 21" in two lines. Use "Leftovers from today · 2 portions · eat by Oct 21," then Ate it, Some left and More.
- Shorten long recipe names on the card. Show the text before the first parenthesis when the parenthetical is longer than 20 characters ("Shakshuka," not "Shakshuka (eggs in spiced tomato sauce)"), at 17 px, and keep the full name in the recipe sheet. A card with two big lines takes a lot of the screen for no gain.
- Make the Snacks and extras line do something. "8 always-stocked items are out. They&apos;re on your next list." becomes a tappable row that shows the first three names and opens Always stocked filtered to out.
- Hide "Day 1 of 1" on a one-day trip, and show "Day 2 of 6" only on longer trips.
- Keep one line of header during cooking, as in WP55, so the date and the next trip are always visible.
Acceptance
- A passed breakfast and lunch appear in one "Earlier today" row, and Skip removes both from "meals left."
- Before a receipt, a planned dinner shows "Groceries not logged yet," and Cooked it still opens the cook sheet.
- The meal card shows More, and no screen contains a button labeled "Less" except Quick check.
- A leftovers card states its eat-by date once.
- "Llapingachos" shows as the card title, and the recipe sheet shows the full name.
- Tapping the Snacks and extras line opens the list of out items.
- A one-day trip doesn&apos;t show "Day 1 of 1."
## WP58: Cook sheet and after cooking
Goal: cooking a meal is one confirmation, the sheet asks the one question the app can&apos;t answer, and the amounts are ones a person can measure. Your first Shakshuka showed three red "not in your kitchen" lines on a kitchen that was simply empty, six grey staple lines, amounts like "2¾ cloves garlic" and "⅛ tsp chili powder," and a leftovers sheet that pre-ticked two slots for portions that cover one.
Changes
- Ask about a missing ingredient on its own line: "Olive oil · I have it · Add to my list." For a staple, I have it sets the staple to Have and takes nothing. For anything else it asks "About how much?" with ¼, ½, ¾ and Full (Full is preselected), adds that as a batch dated today, and then takes the recipe&apos;s amount from it. Add to my list puts it on the current trip&apos;s list, or the next one if you&apos;ve already shopped. Put "I have all of these" at the top when two or more lines are missing. This is the just-in-time pantry question you chose in round 1.
- Fix the staple list in the catalog so cooking basics are staples: oils, vinegars, salt, pepper, spices, sugar, flour, baking soda and powder, and soy sauce. Olive oil is currently treated as a normal item. Perishables such as garlic and onions stay normal.
- Collapse staples into one line, "6 staples · not tracked," that opens to the list. Show a staple as its own line only when its state is Out.
- Round amounts to what a person measures, here and in the recipe sheet and steps. Count items that come whole (eggs, garlic cloves) round to the nearest whole number, so 2¾ cloves reads "3 cloves." Vegetables and fruit round to the nearest half, with ties rounding up. A teaspoon under ¼ reads "a pinch." Teaspoons otherwise round to ¼, tablespoons to ½, and cups to ¼. Keep the exact value in the calculation.
- Say what the servings mean: "Cooking the full recipe (4 servings): 2 portions now and 2 extra for leftovers." Today it says "4 servings for 2 portions" with no reason.
- In the after-cooking sheet, pre-tick only what the portions cover. With 2 leftover portions and a slot that takes 2, tick one slot: tonight&apos;s dinner if you cooked earlier in the day, otherwise tomorrow&apos;s lunch. Count in portions, "Placed 2 of 2 portions," and when a tick would go over, switch that row off with "No portions left." Remove "not enough for all of these."
- Leave Thumbs up and Thumbs down unselected by default, and keep the line explaining that thumbs down means it is suggested less often.
- After Done, show a toast naming where the leftovers went ("Cooked Shakshuka · leftovers for tonight&apos;s dinner"), and update Days.
Acceptance
- A missing olive oil, with the kitchen empty, shows "I have it" and "Add to my list." Choosing "I have it" sets the staple to Have and removes the red line.
- A missing onion asks "About how much?" and then takes 4 oz from the new batch.
- "I have all of these" appears with three or more missing lines and clears them in one tap.
- Paprika, cumin and chili powder appear as "3 staples · not tracked."
- 2¾ cloves of garlic reads "3 cloves," ¾ of a pepper reads "1 pepper" (ties round up), and ⅛ tsp reads "a pinch."
- The sheet says "2 portions now and 2 extra for leftovers."
- With 2 leftover portions, one slot is pre-ticked, the other slots show "No portions left," and no red message appears.
## WP59: Receipt review
Goal: after the receipt is read, you see one screen you can skim in about thirty seconds. The app has already done everything it can, and only what needs you is marked. Your word for the current screen was overload, and "use all suggestions" was a bandaid. This package replaces the screen. It builds on WP47 to WP52 from the last order, which cover reading accuracy, matching and pricing.
The drawing shows the new review screen on the left, and what you do on the right. It is a wireframe for structure, not a visual design.
receipt review wireframe · the four things a person does
The check card appears only when something needs the person. With a clean receipt, the screen is the summary, the list and the Add button.
Changes
- Apply the suggested names automatically when the receipt is read. Remove the "Use all 26 suggestions" button and the "Review all" link. Put one quiet line under the summary, "Names applied · Review names," and keep the review sheet behind it for anyone who wants it.
- Open with one summary card: "49 items · $137.39," the detected store and date ("Aldi · logged as Oct 10 · Change"), and "21 new names applied · 28 matched." Use a neutral color when everything checks out, and amber only when the total doesn&apos;t match. No red header.
- Replace the five store chips with one detected chip, "Aldi ✓." Change opens the chips. Show the date as text with a small calendar icon.
- Log the receipt under the date it prints, as you chose. Don&apos;t attach it to the current trip by guessing. Show "Logged as Oct 10" and only ask about trips when the date falls inside more than one choice. When this makes food already past its use-by date, add one note: "11 items from this receipt are already past their use-by date. Count the food as bought today instead?" It is a switch, off by default, and the receipt date stays as printed either way.
- Add a "things to check" card above the list, shown only when something needs you. For a total that is off, show the three most likely lines side by side. Each shows its photo strip, the price that was read, and an editable price field. Tapping the wrong one lets you fix it. End with "None of these, add anyway." Rank the candidates by how likely a misread is: digits the reader was unsure of, then the 8, 3, 5 and 6 digits it confuses most.
- Build the skim list below it. Each row is one line of about 44 px: the name, a small group word in grey, the price, and a ×N badge for repeats. Show the lines that are new to you in the open list and fold the matched ones under "28 matched · tap to review." Put rows with an amber dot (a doubtful number or price) at the top.
- Open a row into a short editor with four visible controls: the name, the price with an Edit link, the group, and "Add brand or flavor" (one tap, never asked automatically). Put Change item, Not food, Item details, the item number and the size behind a "More" row. That cuts the nine controls to four.
- Cut the photo strip precisely to its own line, with padding of about 15% of the line height, and mask the neighboring lines so they never show. Make it a little larger than today.
- Verify item numbers by reading the number crop a second time, at three times the size, with digits only. Show the number only when both reads agree. When they disagree, show "#?" next to the strip and let the person type it. This fixes the row that said #282743 while the strip plainly read 382745. First-time numbers can&apos;t be checked against known ones, so agreement between two reads is the check.
- Make the sticky footer a single button, "Add 49 items · $137.39," with a small "Total matches" or "Off by $0.16" beside it. Remove the amber paragraph and the separate "Lines = Lines ≠ Total" line. When the total is off, the button reads "Add anyway · off by $0.16" and sits after the check card.
- Make the Add receipt screen less empty. Show the chosen photo at about 120 px tall with its first line visible, not as a thumbnail, and keep "Read 1 photo" and "Add another photo."
- Keep reading progress in words with steps, as it is now.
Acceptance
- With the 10/10 receipt, the review screen has a summary, one check card and the list, with no "Use all" button, and the first screen needs no scrolling to find the Add button.
- A $0.16 mismatch shows three candidate lines with photo strips, and fixing one price turns the summary neutral and enables "Add 49 items · $137.39."
- A row shows a number only when two reads agree, so 382745 never appears as #282743.
- The photo strip shows one line and none of its neighbors.
- Opening a row shows four controls, and "More" shows the rest.
- A receipt dated Oct 10 is logged on Oct 10, and the note about food already past its use-by date appears with its switch off.
- A 49-item receipt takes about 30 seconds and six taps or fewer when everything is right.
## WP60: Kitchen
Goal: the Kitchen tells the truth about what is still good, warns calmly, and corrects itself in a swipe. After your receipt it showed 13 chips, 11 of them red "expired," including canned tuna, marinara, sparkling water and summer sausage. Then Quick check asked about eight items with three big buttons each.
Changes
- Give new items a sensible shelf life. When an item is created from a receipt line, guess its storage and use-by from the name and group: canned goods 365 days, jarred sauces 180 (a week or so once opened), dry pasta and rice 365, sparkling water and bottled drinks 180, crackers and bars 90, unopened shelf-stable sausage 60. When the type is unknown, set no use-by date at all, and list the item under "No date" instead of marking it expired. This replaces the short default new items seem to get today.
- Show shelf-stable items without a use-by date, or with a "best by" date far off. They never appear in Eat soon unless a date was set on purpose.
- Repair existing items once. When an item was created from a receipt with the short default and an unknown type, recompute or remove its use-by date, and show a note, "Fixed use-by dates on 7 pantry items." History keeps it undoable.
- Handle food past its use-by date as one line, as you chose: "11 past use-by · Review," in amber, in the Kitchen and in the Eat soon banner on Days. It opens a review sheet listing each item with a checkbox, all ticked, and three actions: Toss ticked, Still good (3 more days) and Freeze. Tossing records the waste in dollars when that setting is on, and History can undo it.
- Keep Eat soon for food due within two days, not expired food. Show at most six chips, then "See all." Drop the repeated "Not on your menu yet." When a recipe uses the item, show "Used in Shakshuka," and otherwise show nothing.
- Count only items due within two days in the At home badge. Show expired items as a separate dot, so the badge stops reading 13 for a week-old receipt.
- Rebuild Quick check as swipe cards, as you chose, using the same drag as Quick plan. One item per card, with its name, amount and "last touched Oct 10." Swipe right for Same, left for Gone, and tap Less for ¼, ½ and ¾. Show "3 of 8" and an Undo. Start it from one row, "8 things to check · Start," and offer "Check 8 more" at the end. Skip items with no use-by date that arrived in the last week.
- Keep "You could make now" at the top of the Kitchen whenever any recipe can be made, with "One item away" under it.
- Split the summary line into "39 items · 0 leftovers · 2 due soon · 11 past use-by."
Acceptance
- Canned tuna, marinara, sparkling water and summer sausage created from a receipt show no expired flag, and their dates are 60 days or more away.
- Eleven expired items show as one amber line, "11 past use-by · Review," and Toss ticked removes them in one tap, which History can undo.
- Eat soon shows at most six chips, all due within two days, and the At home badge counts only those.
- Quick check opens as swipe cards, swiping right marks Same, swiping left marks Gone, and Undo restores a card.
- An item with an unknown type shows under "No date."
- The one-time repair note appears once.
## WP61: At the store and the shopping list
Goal: the store screen helps you shop and doesn&apos;t scold you. At the store the header read "Over by $33.94" in a red pill, and Large eggs appeared twice, once under always stocked and once, ticked, in the cart.
Changes
- Make the budget note calm, as you chose: amber, not red, with the same "Over by $33.94" wording. Use the same amber on the Groceries meter and the Menu budget line, and keep red for errors only.
- Show one line for an item that two rules both need, as you chose. Work out the amount as what recipes use plus whatever is needed to bring stock back to the always-stocked level, so Shakshuka&apos;s 4 eggs and the always-stocked "keep a dozen" give one row, "Large eggs · 1 dozen." Put the reasons behind a tap on the row ("Shakshuka uses 4 · always stocked keeps 1 dozen"). Ticking it moves one row to the cart.
- Put always-stocked items in their store sections (Deli meat with meat, Coffee / cold foam with dairy, Energy drinks with drinks) with a small "always stocked" tag, and stop collecting them in a separate group at the bottom. This is my proposal. It matches your rule that the list follows the store&apos;s sections.
- Keep the covered items greyed at the bottom, as you chose, in one collapsed group, "Already covered · 6," so you can still check the shelf. Never show them among the items to buy.
- Rename the Undo button on each cart row to Put back. The top-bar undo does something different, and two buttons with one name is confusing.
- Keep ticked rows in place for about half a second with a check, then move them to the cart, so the list doesn&apos;t jump under your thumb.
- Keep "4 in the cart · 14 to go" and the amount left to buy in the header. Show the budget note only when it is over, in amber.
Acceptance
- The over-budget note is amber on the store screen, the Groceries meter and the Menu line.
- Large eggs, needed by a recipe and by the always-stocked rule, show as one row, and the reasons show behind a tap.
- Always-stocked items sit in their store sections with a tag.
- Covered items appear only in the collapsed "Already covered" group, greyed.
- The cart rows say Put back.
- A ticked row stays for about half a second before moving.
## WP62: Polish and performance
Goal: swipes feel smooth, the new compact screens hold together visually, and text stays readable in the dark theme you use. You called the Quick plan animation choppy, which is low priority, so this package comes last. It is still worth doing right, because the gallery, the rails and Quick plan all use the same kind of drag.
Changes
- Make drags cheap. Move the card with transform only (translate and scale), and promote just the dragged card to its own layer. Update the style from the pointer handler through a ref and requestAnimationFrame instead of through React state on every move. Don&apos;t change shadows, filters, blur or layout while dragging. Let the release spring run as a CSS transition on transform and nothing else.
- Prepare the next card before it is needed. Decode the next card&apos;s image ahead of the swipe, serve photos no wider than about 800 px, and load rail images lazily.
- Add a frame-rate readout to Diagnostics (a switch that shows a small counter), so smoothness can be measured on your phone and not guessed at. Target: fewer than 5% dropped frames across five seconds of dragging, with CPU throttled to 4 times in desktop tools as a stand-in for a mid-range phone.
- Fix the compact card typography from WP56: name 14 over 18 semibold, at most two lines; meta 12; "Adds $X" 13 semibold; the Add button at least 44 px tall in tap area. Keep card width about 148 px and photo height about 100 px.
- Check contrast in the dark theme. In your screenshots the amber text on dark brown chips, the red text on dark red chips and the grey on navy are the weak spots. Every text and background pair needs 4.5:1, and every control 3:1, in both themes.
- Keep reduced motion working on every drag and sheet.
- Keep the toast clear of primary content: under the top bar, no longer than three seconds, and never over a sticky button.
Acceptance
- Dragging a Quick plan card for five seconds on your phone drops fewer than 5% of frames, as shown by the Diagnostics counter.
- The dragged card is the only element on its own layer, and no shadow or filter changes during the drag.
- The compact card has the specified type sizes and a 44 px Add target.
- The contrast check passes for amber, red and grey text in dark and light.
- With reduced motion on, nothing stretches or slides.
## WP63: Calendar
Goal: the calendar answers "what is about to spoil, and what do I do about it?" before anything else. You said you open it for spoilage first, and that tapping a spoil day should lead with meals that use those items. Rounds 6 to 8 were decided by your answers and not by screenshots, so Claude Code should check each change here against the real calendar screens before building.
Changes
- Set the default layers to Spoilage and Trips. Switch Essentials, Cooked and Planned on from the chips when wanted. This keeps the first look to red counts and trip ribbons. Add a one-line legend under the chips: red circle for things spoiling, orange square for essentials, ribbon for a trip.
- Count only food with a real use-by date, using the shelf-life rules from WP60. Shelf-stable items no longer produce red circles.
- Rebuild the Day sheet so it leads with action, not a list. The header reads "3 things spoil Tuesday." Under it, show up to three meals that use those items, each with a photo, the name, "uses spinach and chicken" and "needs 1 more item," and an Add to menu button. Add a second button, Put on Monday&apos;s dinner, which places the meal straight onto the open dinner slot nearest before the spoil date.
- Put the items themselves under a folded "Items (3)" row, with Use it, Ate it, Freeze, Move date and Toss, as they are now. Replace "Plan a meal using these" with "More meals," which opens Browse with the Uses expiring filter and those items selected.
- Replace "Toss expired" on past days with the one-line review from WP60 ("4 past use-by · Review").
- In Ranges, keep the bars and today line, and make tapping a bar open the item sheet with "Meals that use it" first.
- Keep the range summary as it is, and show waste in dollars when that setting is on.
- Build the date-to-items map once when the data changes and reuse it in both modes, so Month renders in under 50 ms.
Acceptance
- A fresh calendar shows red counts and trip ribbons only, with a legend line under the chips.
- Canned tuna created from a receipt produces no red circle.
- Tapping a spoil day opens a sheet that leads with up to three meals using the spoiling items, each with Add to menu and Put on [day].
- "Put on Monday&apos;s dinner" places the meal on that slot and the day card shows it.
- The items list is folded under "Items (3)," and "More meals" opens Browse with Uses expiring on.
- Tapping a Ranges bar opens the item with "Meals that use it" at the top.
## WP64: Always stocked and essentials
Goal: the app learns what you keep rebuying and offers it, without a list you have to build up front, while essentials such as toilet paper and foil keep the "Opened new" habit you already like. Your answers: the app suggests always-stocked items, the suggestion appears as one card right after a receipt, and Opened new stays in At home › Essentials.
Changes
- Suggest always-stocked items from your receipts. After a receipt is added, show one card, "Keep these stocked?", for up to three items you have bought at least three times in the last six weeks, or twice in the last three. Each has Keep stocked (it joins Always stocked with a keep-at-least of 1 and a use rate the app learns) and Not this. A "Not this" is remembered for 60 days. Never suggest an item already kept, and show the card at most once per receipt.
- Don&apos;t seed Always stocked with a starter list, and clear any seeded entries a person didn&apos;t choose. The list starts empty and fills from suggestions and manual adds.
- Keep the manual add. Always stocked still has "+ Keep something else stocked," which opens the item search.
- Keep Opened new, Ran out and spares on the Essentials rows, as now. Make Opened new a single tap with a toast and an undo, and don&apos;t move it to Days. Keep the Essentials rows&apos; status, run-out date and "lasts about 9 days" line.
- Show "Track X? It was on your receipt" for essentials on receipt lines as it does now, and fold it into the same post-receipt card as the always-stocked suggestions, so there is at most one card.
- Make the Days line "8 always-stocked items are out" open the filtered list (WP57). Put out items on the shopping list inside their store sections (WP61).
- Keep the Habits card, and show "usually lasts N days" once two cycles are known.
Acceptance
- After a receipt where eggs, yogurt and seltzer were each bought three times, one card offers all three, and "Keep stocked" on eggs adds it with a keep-at-least of 1.
- "Not this" on seltzer hides it from suggestions for 60 days.
- A fresh install has an empty Always stocked list.
- Tapping Opened new on toilet paper shows a toast with Undo, and the run-out date updates.
- A receipt with both an always-stocked suggestion and an essential to track shows one card, not two.
## WP65: Settings
Goal: Settings puts what you use first, shows what the Google Sheet connection is doing at a glance, and uses the appetite slider you chose in place of ages. You opened Settings for Backup and Prices, and the Google Sheet connection is how you keep recipes and prices, so it can&apos;t sit under Advanced.
Changes
- Order the six rows by use: Household, Prices and catalog, Backup and restore, My items and recipes, Calendar and reminders, Help and about. Each keeps its summary line and attention dot.
- Promote the Google Sheet connection to its own visible row inside Prices and catalog, with a status line ("Connected · 0 changes waiting · last sent 7:02 am"). Show an amber dot on the Settings tab when changes are stuck, and keep the full screen (address, key, Test and connect, changes waiting, Send now, problems, recent results) one tap in.
- Replace the age field in the member editor with the appetite slider from WP54 and keep the per-meal fine-tune and the weekly grid. Show appetite in words on the member row ("Usual appetite · most meals at home").
- Keep Cost by person, the weekly budget and the week table. Add the budget formula link from WP55 under the weekly budget.
- Keep the Stores page under Prices and catalog, the item groups row under My items and recipes, and Recent notices, Reset and Show setup again under Help and about.
- Make Backup and restore show where the last backup went ("Last backed up today at 7:02 am to Google Drive"), as WP66 describes.
Acceptance
- The Settings rows appear in the order above.
- Prices and catalog shows a Google Sheet row with a status line, and a stuck change turns the Settings tab dot amber.
- The member editor has the appetite slider and no age buttons.
- The Backup row&apos;s summary says when and where the last backup went.
## WP66: Automatic backup to Google Drive
Goal: backups happen on their own, into your Google Drive, with no extra sign-in and no weekly chore. You chose automatic, saved to Google Drive or similar. The app already talks to a Google Apps Script through your sheet connection (the app address and key). That script runs as you, so it can also write files into your Drive, which avoids building a Google sign-in into the app.
The drawing shows the path a backup and a restore take.
backup and restore path
The script is the only new piece. The phone, the Drive folder and the connection you already use stay as they are.
Changes
- Add three actions to the Apps Script: backup (receive the backup data and write a dated file), list (return the backups it holds with their dates and sizes) and fetch (return one backup). Files go in a Drive folder called "Meal Prep backups" and are named meal-prep-YYYY-MM-DD-HHmm.json. Keep the last 14 daily files and one file a week for the last 8 weeks, and delete the rest.
- Back up when the app opens and the last Drive backup is more than 24 hours old, and online. Also back up after 30 changes since the last backup, and after adding a receipt or cooking a meal, at most once every 30 minutes. Add Back up now on the Backup screen.
- Compress the backup before sending it, and split it if it is large. Include members, kitchen, menu, trips, receipts, prices, added items, recipes, settings and History. Never include the app key itself, and never include receipt photos unless "Keep the photo" is on.
- Show the result plainly. The Settings row and the Backup screen say "Last backed up today at 7:02 am to Google Drive." If a backup fails or the phone is offline, retry later. After three days without a success, show an amber dot on Settings and "Backup hasn&apos;t run in 3 days."
- Add Restore from Google Drive on the Backup screen. It lists backups by date with counts ("39 items · 4 receipts · 12 recipe edits"), shows what a restore will replace, and uses the confirmation dialog from the last order, after taking an automatic copy of the current state.
- Keep the fallback. When no sheet connection exists, the Backup screen says "Connect your Google Sheet to back up automatically" and offers Save as file and Share as now, with a weekly reminder.
- Warn once on first use: the backup holds household members and receipts and is stored in your own Drive. Say that the script&apos;s app key protects it, and ask for a long random key if the current one is short.
- Reject nothing silently. An old script that doesn&apos;t know the new actions returns an error, and the app says "Update your Google script to turn on automatic backup" with where to find the new code. Update the script before the app.
Acceptance
- With the sheet connected, opening the app after 24 hours sends a backup, and a file appears in "Meal Prep backups" in your Drive.
- The Backup row reads "Last backed up today at 7:02 am to Google Drive."
- After 15 daily backups, the folder holds 14 daily files plus the weekly ones.
- Restore from Google Drive lists the backups with counts, and restoring one returns the phone to that state after an automatic copy.
- Three days offline produce the amber dot and the message, and a later success clears both.
- An old script returns the "Update your Google script" message and breaks nothing else.
- The backup file contains no app key and no photos.
## WP67: Your second week
Goal: the end of one trip flows into the next without losing what you bought or making you start from scratch. This is built from your answers about the end of a trip, what Fill should do with the kitchen, and your thumbs. Like WP63 to WP66, it was decided by answers and not by screenshots, so check it against the real screens first.
Changes
- Ask what to keep when a trip ends with meals you never cooked. Open a short list on the Plan next trip card and when you start a new trip: "5 meals weren&apos;t cooked. Keep any?" Each meal has a toggle, with Keep all and Keep none at the top. Pre-tick the meals whose main ingredients are already in the kitchen, since dropping those wastes food you bought, and leave the rest off. Kept meals move to the new trip&apos;s menu. The rest come off.
- Make Fill use up the kitchen first, as you chose. Score a recipe higher when it uses food that is expiring, then when the kitchen already covers most of it. Choose the first picks from "meals that use up what&apos;s expiring," and show a line in the Fill summary, "Uses up: chicken, spinach, peppers."
- Make thumbs rank, not hide. A thumbs-down lowers a recipe&apos;s rank by a fixed amount, and a thumbs-up raises it. The effect fades after 60 days. Recipes still appear everywhere, and Browse keeps its order unless sorted by Best fit. Add "Clear my thumbs" under My items and recipes.
- Keep leftovers across the boundary. Leftovers still in the kitchen when a trip ends appear on the new trip&apos;s day cards when you place them, with their eat-by date. Pinned slots in the old trip that fall after it are re-offered: "2 leftovers were planned for after this trip. Keep them for the new one?"
- Vary the second week. Don&apos;t pick the same main as last week in Fill unless it has a heart, and say "New this week" on rails for recipes you haven&apos;t cooked.
- Show the carried budget and the kept meals together on the Plan next trip card, so the first look at a new trip says what it starts with: "Budget $102.86 minus $60 carried · 3 meals kept · 12 items to use soon."
Acceptance
- Ending a trip with 5 uncooked meals opens the keep list, with the meals whose ingredients are in the kitchen pre-ticked, and the kept ones appear on the new trip&apos;s menu.
- Fill with chicken and spinach expiring picks meals that use them first, and the summary says "Uses up: chicken, spinach."
- A thumbs-down recipe still appears in Browse, ranks lower in Suggested, and its effect is gone after 60 days.
- Leftovers pinned beyond the trip&apos;s end are offered again on the new trip.
- Fill doesn&apos;t repeat last week&apos;s non-heart mains.
- The Plan next trip card shows the carry, the kept meals and the items to use soon.
## Handoff for Claude Code and design export
Before starting, confirm which parts of the last order (WP47 to WP53: the receipt reader, matching, variants and pricing) are built. WP59 depends on them, and WP58 and WP60 depend on the staple and shelf-life fields in the catalog. Match the existing conventions, ship each package as its own deploy, and add its checks to the self-test page.
Write these as pure functions that the screens and the self-test share: rounding to cookable amounts (WP58), the carried-overspend cap and the next-trip size check (WP55), the shelf-life guesser (WP60), the mismatch candidate ranker and the two-read number agreement check (WP59), the leftover placement defaults (WP58), and the rail grouping by protein (WP56).
Fixtures. Build them from the cases in your screenshots, so each defect can be reproduced and then shown fixed.
- Setup: two members named B and M, a $120 weekly budget, Aldi as the main store, Saturday as the usual day.
- The short trip: Sunday Oct 18 to Monday Oct 19, a $17.14 budget share, a menu of Shakshuka (breakfast) and Llapingachos (lunch), and two members.
- The receipt: the 10/10 receipt from the last order, 49 items and $137.39, read with a $0.16 mismatch and the number 382745 read as 282743.
- The Kitchen after that receipt: 39 items, 11 of them past use-by (marinara sauce, summer sausage, chunk light tuna, green onions, Roma tomatoes, bagged avocados, seasonal harvest, yogurt drink, sparkling water, flavored beverage, flavored water), chicken broth due today, and multicolored peppers due in 2 days.
- The Shakshuka cook sheet: 4 tsp olive oil, 4 oz yellow onions, ¾ multicolored peppers (from the Oct 10 batch, use by Oct 20), 2¾ cloves garlic, 1¼ tsp paprika, ¾ tsp cumin and ⅛ tsp chili powder, with an empty kitchen apart from the peppers.
- After cooking: 2 leftover portions, eat by Oct 21, and slots that each take 2 portions.
- The Plan next trip card: next trip Mon, Oct 19, 6 days, $102.86, $164.16 overspent, 12 items to use soon.
- At the store: $40.95 left to buy, an over-budget note of $33.94, 4 items in the cart, and Large eggs needed by both a recipe and an always-stocked rule.
Privacy. Never commit receipt photos. They show part of a card number, a cashier&apos;s name and the store&apos;s address. Keep any test images in a folder git ignores, and commit only data.
Exporting for design. After each package, run the app at 360 by 800 (and 412 by 915 for Browse, the review screen and Quick plan) in light and dark, load the fixtures above, and save a screenshot of each state to design/handoff/first-use/<package>/<state>-<theme>.png. Capture: the setup slider and count mode, the next-trip card and confirmation, Browse with two rails, the compact card, the cook sheet with and without missing items, the after-cooking sheet, the review screen with and without the check card, the Kitchen with the past-use-by line, a Quick check card, and the store screen with an amber note. Update design/handoff/COMPONENTS.md with the components and tokens each screen uses, and list any state you could not reach.
Extra fixtures for WP63 to WP67. A calendar with three items spoiling on one day, one of them canned tuna; a receipt history in which eggs, yogurt and seltzer each appear three times in six weeks; a backup of about 1 MB with 39 items and 4 receipts; an Apps Script stub that answers backup, list and fetch, and a second stub that doesn&apos;t; a trip that ends with 5 uncooked meals, 2 of them using food already in the kitchen; and a kitchen with chicken and spinach expiring in two days. Add screenshots of the Day sheet with meals first, the keep-stocked card, the Backup screen with a Drive status, the restore list, and the end-of-trip keep list.
## Test plan
Run the number checks in the self-test page against the fixtures, and the screen checks on your Android phone from the installed app.
#
Scenario
Steps
Expected result
1
Name fields
Open setup step 1
Empty fields with a "Name" placeholder; blank names become "Person 1" and "Person 2"
2
Appetite slider
Move a slider across its five stops
0.5, 0.75, 1.0, 1.25, 1.5 with a plain readout; no age anywhere
3
No pantry checklist
Finish setup, then add a menu recipe that needs cumin
Setup has no checklist; Groceries shows "Check 1 pantry item"
4
Trip creation
Stop at step 4 and look at Days
No trip exists until step 5 completes
5
Passed meals
Start a trip at 11:41 am with Dinner as the first meal
One "Earlier today" row, and Fill plans neither breakfast nor lunch
6
Weekly pattern
Choose "Cook dinner, leftovers for lunch"
One main a day, cooked double
7
Breakfast
Start a trip, then tap "+ Breakfast" on one day
No breakfast slots by default; one appears on that day
8
Next-trip card
Log the $137.39 receipt on the one-day trip
The card, with "more than 1 day of groceries"
9
Header
Open Days while cooking
One header line with "Next trip · Change"
10
Short-trip confirmation
Change a 6-day trip to 1 day
The confirmation shows $17.14 and "2 meals fit"
11
Carry cap
Overspend a trip by $164.16
$60 carries, the card says both numbers, and Start fresh drops it
12
Rails
Open Browse all
Two rails visible; a compact card with photo, name, time and cuisine, "Adds $X" and Add
13
One "Mains"
Look at the tabs and chips
"Mains" appears once
14
After Fill
Tap "Fill my trip for me"
Lands on My menu with the review bar
15
Pick myself
Tap "I&apos;ll pick myself"
Quick plan opens
16
Day card
Open today&apos;s card
A passed-meal row, "More" instead of "Other" and "Less," one eat-by line, short names
17
Missing ingredient
Open the Shakshuka cook sheet with an empty kitchen
"I have it" and "Add to my list" on olive oil, onions and garlic
18
Rounding
Read the same sheet
"3 cloves garlic," "1 pepper," "a pinch" of chili powder
19
Staples
Read the same sheet
"3 staples · not tracked" in one line
20
Leftover placement
Finish cooking with 2 portions left
One slot pre-ticked; the others "No portions left"; no red message
21
Review screen
Read the 10/10 receipt
A summary, a check card with three candidate lines and strips, a skim list and one Add button
22
Number agreement
Feed the 382745 and 282743 reads
"#?" until the two reads agree; never #282743
23
Row editor
Open one row
Four controls, with "More" for the rest
24
Old date
Add the receipt dated Oct 10
Logged on Oct 10, with the past-use-by note and its switch off
25
Shelf life
Read the fixtures&apos; tuna, marinara, sparkling water, summer sausage
No expired flag; dates 60 or more days away
26
Past use-by line
Open the Kitchen with 11 expired items
"11 past use-by · Review"; Toss ticked removes them in one tap; Undo restores
27
Eat soon
Open Days
At most six chips, all due within two days; badge counts only those
28
Quick check
Start it
Swipe cards: right is Same, left is Gone, Less opens ¼, ½, ¾
29
Store note
Open At the store over budget
Amber, not red
30
One eggs line
Open the list with eggs needed twice
One row, reasons on tap
31
Cart rows
Look at In the cart
The buttons say "Put back"
32
Smoothness
Drag a Quick plan card for five seconds
Fewer than 5% dropped frames on the Diagnostics counter
Test plan for WP63 to WP67. These follow your answers, so run them against the real screens first and fix the wording of any step that doesn&apos;t match.
#
Scenario
Steps
Expected result
33
Calendar defaults
Open Calendar on a fresh install
Spoilage and Trips on, other layers off, a legend line under the chips
34
Shelf-stable food
Add canned tuna from a receipt
No red circle on any day
35
Spoil day sheet
Tap a day with 3 things spoiling
Up to three meals that use them, each with Add to menu and Put on [day]; items folded under "Items (3)"
36
Place a meal
Tap "Put on Monday&apos;s dinner"
The meal is on that slot and the day card shows it
37
Ranges bar
Tap a bar in Ranges
The item opens with "Meals that use it" first
38
Keep-stocked card
Add a receipt with eggs, yogurt and seltzer each bought three times
One card offers all three; Keep stocked on eggs adds it with a keep-at-least of 1
39
Not this
Choose "Not this" on seltzer
It isn&apos;t suggested again for 60 days
40
Empty start
Open Always stocked on a fresh install
The list is empty
41
Opened new
Tap it on toilet paper
A toast with Undo, and the run-out date updates
42
One card
Add a receipt with a suggestion and an essential to track
One card, not two
43
Settings order
Open Settings
Household, Prices and catalog, Backup and restore, My items and recipes, Calendar and reminders, Help and about
44
Sheet status
Open Prices and catalog
A Google Sheet row with "Connected · 0 changes waiting · last sent …"; a stuck change turns the Settings tab dot amber
45
Appetite in the editor
Open a member
A slider, no age buttons
46
Automatic backup
Open the app 25 hours after the last backup, with the sheet connected
A dated file appears in "Meal Prep backups," and the Backup row says so
47
Retention
Run 15 daily backups
14 daily files plus the weekly ones remain
48
Restore from Drive
Choose a backup from the list
Counts shown, a confirmation, an automatic copy, then the old state returns
49
Offline for three days
Keep the phone offline for three days
An amber dot and "Backup hasn&apos;t run in 3 days," cleared by the next success
50
Old script
Back up against an old script
"Update your Google script," and nothing else breaks
51
Backup contents
Inspect a backup file
No app key and no receipt photos
52
Keep list
End a trip with 5 uncooked meals
A keep list with ingredient-covered meals pre-ticked; kept meals reach the new menu
53
Use up first
Run Fill with chicken and spinach expiring
Those meals are picked first, and the summary says "Uses up: chicken, spinach"
54
Thumbs
Thumbs-down a recipe
It still appears in Browse, ranks lower in Suggested, and the effect ends after 60 days
55
Leftovers across trips
Pin leftovers beyond the trip&apos;s end
They are re-offered on the new trip
56
Variety
Run Fill for a second week
Last week&apos;s non-heart mains aren&apos;t repeated
57
Plan next trip card
Open the card
The carry, the kept meals and the items to use soon
## Build order and open questions
Correctness first, then the receipt screen that cost you the most time, then the daily screens, with polish last. WP55 and WP60 fix numbers and dates that were simply wrong, so they go first. WP59 builds on the receipt reader from the last order.
- WP55, trip dates, budget and the next-trip question.
- WP60, Kitchen shelf life and the past-use-by handling.
- WP66, automatic backup to Google Drive, so your data is safe before the big changes.
- WP59, receipt review.
- WP58, the cook sheet and after cooking.
- WP57, Days.
- WP54, setup and the first trip.
- WP56, Menu rails and compact cards.
- WP63, the calendar.
- WP64, always stocked and essentials.
- WP65, Settings.
- WP67, your second week.
- WP61, At the store and the shopping list.
- WP62, polish and performance.
My rough estimate is about 22 working sessions: three for WP59, two each for WP60, WP58, WP54, WP56, WP66 and WP67, and one each for WP55, WP57, WP61, WP62, WP63, WP64 and WP65. Add a short first session to confirm the source and what already exists from the last order.
Open questions. Anything marked proposed is built as written unless you change it.
- How much overspend should carry into the next trip? I proposed half a week&apos;s budget ($60 on a $120 week), with a "Start fresh" option. Is that right, or should it carry in full or not at all?
- Should always-stocked items sit in their store sections with a tag (my proposal), or stay in a group of their own?
- Should a new trip have no breakfast slots by default, with "+ Breakfast" on days you want one? That is how I read your "it is so variable."
- Are the five slider stops (Small, Light, Usual, Hearty, Big) the right words for how much someone eats?
- Which phone do you use? I&apos;d test smoothness on something like it.
- When a receipt&apos;s date makes food already old, should the "count it as bought today" switch stay off by default, as I proposed?
Added after rounds 6 to 8:
- Should the calendar open with only Spoilage and Trips on, as I wrote, or with Essentials on too?
- Is 14 daily and 8 weekly backup files the right amount to keep in Drive?
- When ending a trip, should meals whose ingredients are already in the kitchen come pre-ticked to keep, as I proposed?
- Is the Settings row order (Household, Prices and catalog, Backup and restore, My items and recipes, Calendar and reminders, Help and about) the right one for how you use it?
Rounds 6 to 8 are done and are in WP63 to WP67. Reset, web import and the Google Sheet screens beyond their status line are the only areas not discussed.