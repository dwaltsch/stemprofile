# Contributing

Bug reports, ideas and pull requests are welcome. For larger changes, open an issue first so we can agree on the approach.

## Setup

There is nothing to install and no build step. You need Node 22 or newer to run the tests, and [just](https://just.systems) is optional.

```bash
just serve   # or: python3 -m http.server 8000
```

## Before opening a pull request

```bash
node scripts/stamp-assets.mjs   # after changing anything in js/ or css/
node --test
node test/run.js
```

`just check` runs what CI runs.

- **No dependencies.** The project has no runtime dependencies, and tests use only `node:test` and `node:assert`.
- **Add tests** for new algorithms, formulas and formats. Every new input path needs a case in `test/robustness.test.js`.
- **Never commit real routes.** GPX, TCX and FIT files reveal where people live and ride. Generate test routes in code instead.
