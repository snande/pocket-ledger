# pocket-ledger

Static app shell: `python3 -m http.server 8000`, then open http://localhost:8000/.

## Hosting

The app is deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main` (and can be triggered manually via `workflow_dispatch`). It publishes the repository root as-is, with no build or install step. The public link has the form `https://<owner>.github.io/<repo>/`.

## Offline use

`sw.js` precaches the app shell (`PRECACHE_URLS`) and serves it cache-first. It only runs over HTTPS or on `localhost`. After one online visit, open DevTools > Network > Offline and reload: the shell still renders. `index.html` loads the root `app.js`, which imports `src/app.js`. When you add, rename or remove a shell file, update `PRECACHE_URLS` (a missing file makes install fail) and bump `CACHE`.

## Totals module

`src/totals.js` is a pure module with no DOM or storage dependency. Entries have this shape:

```js
{ id: string, amount: number /* rupees */, note: string, createdAt: number /* epoch ms */ }
```

- `computeTotals(entries, now)` returns `{ today, month }` in rupees, using the local calendar day and month of `now`. Sums are computed in integer paise, so they are exact to the paisa. It throws a `TypeError` if `entries` is not an array, `now` is not a valid `Date`, or any entry lacks a finite numeric `amount` or `createdAt`.
- `formatRupees(n)` returns an `en-IN` formatted string prefixed with `₹`, e.g. `formatRupees(1234.5)` gives `"₹1,234.50"`.

Run the tests with `npm test`.
