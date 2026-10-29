# StemProfile task runner. Run `just` to list recipes.

# List available recipes
default:
    @just --list

# Serve the app locally at http://localhost:PORT
serve port="8000":
    @echo "StemProfile at http://localhost:{{port}}  (Ctrl+C to stop)"
    python3 -m http.server {{port}}

# Run the test suite (each suite in its own process)
test:
    node --test

# Run all suites in one process (catches globals leaking between suites)
test-one-process:
    node test/run.js

# Run a single test file, e.g. `just test-file test/pacing.test.js`
test-file file:
    node --test {{file}}

# Re-stamp asset versions + CSP hash in index.html (after changing js/ or css/)
stamp:
    node scripts/stamp-assets.mjs

# Everything CI checks: stamps up to date, both test runners green. Run before committing.
check:
    node scripts/stamp-assets.mjs --check
    node --test
    node test/run.js

# Deep fuzzing run, e.g. `just fuzz 20000 7` (iterations per format, seed)
fuzz iterations="5000" seed="20261029":
    FUZZ_ITERATIONS={{iterations}} FUZZ_SEED={{seed}} node --test test/fuzz.test.js
