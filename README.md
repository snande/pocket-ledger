# pocket-ledger

Static app shell: `python3 -m http.server 8000`, then open http://localhost:8000/.

## Totals module

`src/totals.js` is a pure module with no DOM or storage dependency. Entries have this shape:

```js
{ id: string, amount: number /* rupees */, note: string, createdAt: number /* epoch ms */ }
```

- `computeTotals(entries, now)` returns `{ today, month }` in rupees, using the local calendar day and month of `now`. Sums are computed in integer paise, so they are exact to the paisa. It throws a `TypeError` if `entries` is not an array, `now` is not a valid `Date`, or any entry lacks a finite numeric `amount` or `createdAt`.
- `formatRupees(n)` returns an `en-IN` formatted string prefixed with `₹`, e.g. `formatRupees(1234.5)` gives `"₹1,234.50"`.

Run the tests with `npm test`.
