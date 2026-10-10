# Meal Prep UI rules (6.2, WP45)

These rules apply to every screen, including new ones. The frame, colors and fonts stay as they are. The color values live in tools/meal-core.js TOKENS and as CSS variables in the app's helmet.

## Type
- Titles: Bricolage Grotesque 700, 22/28. Section headings: Bricolage 700, 17/22.
- Body text: Figtree 15/22. Card titles: Figtree 600, 15. Small text: 13/18. Use 11.5 only for badges.
- Use tabular figures for prices, quantities and counts.

## Spacing
- Use a 4 px scale: 16 px page margins, 14 px card padding, 12 px between cards.
- List rows are at least 56 px tall.
- There is one section-label style: 12 px, 600 weight, small capitals with 0.06em spacing, var(--muted).

## Touch
- Every control is at least 44 by 44 px. Neighbouring controls in a row have at least 8 px between them.
- The main action sits in the lower 40% of the screen, usually in the sticky bar or a sheet's sticky footer.
- A destructive action is never right next to the main action.
- Gestures are always shortcuts. Each one has a visible button that does the same thing (the gallery pull has Plan next trip). A swipe that starts within 24 px of a screen edge is left to the system back gesture.

## Color
- Navy is for the one main action on a screen.
- Green means done. Amber means a warning. Red means a problem, spoilage or Out. Orange means an essential.
- Grey means not checked or not buying.
- Text needs 4.5:1 contrast and controls need 3:1, in both light and dark.

## Motion
- Sheets rise in about 220 ms and leave in 180 ms. A gallery page snaps in about 200 ms. A tick fills in about 120 ms.
- Nothing takes more than 250 ms.
- With reduced motion on, use fades of 100 ms or less. The gallery pull then has no stretch, but the hint and the button still work.
- Use short haptics on a tick, at the pull threshold and on Confirm in Cooked it.

## Feedback
- Confirm every action with a toast under the top bar (3 s or less) or with a change in place. A toast never covers the sticky bar.
- Only the Update ready strip and the crash screen interrupt the user. Notices (price reminder, catalog update) are inline cards or strips, and they are listed afterwards under Settings › Help and about › Recent notices.
- Every list has an empty state of one line and one button.

## Large text
- Layouts hold at 130% system text size. Names wrap to two lines, then end with an ellipsis.
- Prices and quantities never truncate.

## Copy
- Use sentence case and put the verb first on buttons.
- Numbers always carry units.
- Use plain words, not internal terms. Say "portions", not person-equivalents. Round portions to the nearest quarter (2½, 2¾).
- Every error says what to do next.
- Use one verb for each action:

| Action | Word |
| --- | --- |
| Put a meal on the menu | Add |
| Take it off the menu | Remove |
| Keep a meal without a day | Back on my menu |
| Ate somewhere else | Ate out |
| Leave an item off this trip | Not this trip |
| Return it to the list | Put back |
| Already own it | I already have this |
| A staple you never buy | Don't buy |
| Throw food away | Toss |
| Finish a leftover | Ate it |
| Use part of something | Had some |

- "Household" means the people only. Non-food items are "Essentials".

## New pieces in 6.2
- **Day gallery card:** today and the days after it, followed by a plan-next-trip card.
- **Gallery dots:** display only. The current day is a wide navy pill, done days are green dots, and the rest are grey dots.
- **Header card:** a status line, the next-step button with ?, and a "Next trip · Change" line.
- **Evening check card:** up to 8 chips, inline amounts (A little, ¼, ½, Whole), then Nothing else and Not now.
- **Past-meal note:** on the Today card, with Cooked it, Ate out and Skip.
- **Leftover row:** Ate it (green), a Some left link that opens a stepper and Ate N, and Toss in red text.
- **Who's eating sheet:** day type at the top, then the member grid, guests with a +½ button, and Back to usual.
- **Store chips** on the shopping list and in At the store mode. A "Cheaper at X · save $Y" link shows at ≥10% and ≥$0.50 savings.
- **Kitchen | Essentials switch** on the At home tab, with a count badge on each side.
- **Reset screen** with 5 checkboxes (Settings is off by default), the always-kept note, a red Reset button, and Advanced › Erase everything (type ERASE).
- **Stores page:** make a store the main one, rename, delete (blocked while the store is in use), and add.
