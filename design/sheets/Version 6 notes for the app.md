# Version 6: notes for the app (Claude Design)

Everything outside the app is done to the contract in the version 6 brief. These are the details the brief left open, as built.

## Script

- `GET ?key=…&schema=2` returns `{ok, version, schema: 2, catalog, problems}`. Without `schema` (version 5.3) the reply is `schema: 1`.
- Items and recipes carry `changed` (ISO time of the row's last edit). Send it as `base.changed` for `item.update`.
- Offers carry `changed` too. `price.set` and `offer.set` compare `base.price` with the offer's current price.
- A change of type `price.set` with no `store` is an Aldi price (5.3 phones).
- `number.link` accepts 4 to 14 digits. A number of an unusual length for that store is a warning in Check data, not a rejection.
- `node.add` is rejected when the parent's level isn't lower than the new node's, or when a node other than level 1 has no parent. A node with the same name under the same parent is reused (`idMap` points to it).
- `item.place` is a conflict when the sheet already has a different node for the item (the reply's `sheet.node` holds it).
- Conflict and success messages name the store for non-Aldi offers, for example "Eggs at Sam's Club: the sheet's price $4.98 was kept."

## Recipe ingredients that are nodes

The amount is in the unit of the products under that node. Version 5.3 phones get the favorite product under the node, otherwise the cheapest per unit **among products in the unit most products under that node use** (ties: the unit of the product placed highest in the tree). So a node whose products mix lb and oz keeps its amount meaning for older phones. The app should apply the same rule, or convert units when the chosen product's unit differs.

## Export my additions (read by the builder, step 3)

The builder accepts these sections next to the existing ones. Each may be an array or an object keyed by id.

| Section | Shape |
| --- | --- |
| `ownItems[]` | as before, plus `brand`, `node` (may be `u_n_…`), `offers: [{store, price, pack, unit, pkg, nums, priceDate, src}]` |
| `offers` | `[{item, store, price, pack, unit, pkg, nums, priceDate, src}]` |
| `nodes` | `[{id: 'u_n_…', name, parent, level}]` (parent may be another `u_n_…` in the file) |
| `favorites` | `{nodeId: itemId}` or `[{node, item}]`; `item: null` clears |
| `placements` | `[{item, node}]` or `{itemId: nodeId}` |
| `itemUpdates` | `[{id, fields: {name?, brand?, pack?, unit?, pkg?, cat?, node?}}]` |
| `numLinks` | `[{num, item, store}]`; a blank or missing `store` means Aldi |
| `aliases` | `[{text, item, store}]` |
| `priceEdits` | `{itemId: {price, at, via, store?}}` |

## receipts.js

`ReceiptParsers.parse` returns `{store, date, total, subtotal, tax, count, sum, items: [{text, amount, qty, num, weighed, perLb, discount, lines}]}` and never throws; on a bad input it returns an empty result with `error`. `ReceiptParsers.stores` lists each store's number lengths and position. Compare `sum` with `subtotal` to warn about missed lines (photos), and `count` with the sum of `qty` (weighed items count as 1).
