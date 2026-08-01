#!/usr/bin/env bash
# Run every check in this directory against a local copy of the site.
#
#   ./tests/run_all.sh
#
# Starts its own server on :8765, runs all six suites, prints a combined total,
# and exits non-zero if anything failed. The README's check count comes from
# this script's output -- if you change a suite, re-run it and update the README
# rather than trusting the number already written there.
#
# Requires: python3, playwright (+ chromium), pillow.
#   pip install playwright pillow && playwright install chromium

set -uo pipefail
cd "$(dirname "$0")/.."

PORT=8765
SUITES=(a11y_test.py verify_test.py trap_test.py ask_test.py ask_ui_test.py)

for cmd in python3; do
  command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }
done
python3 -c "import playwright" 2>/dev/null || {
  echo "playwright not installed; pip install playwright pillow && playwright install chromium" >&2
  exit 1
}

# --- server ------------------------------------------------------------------
# Reuse an already-running server rather than failing on a bound port, but only
# tear down one we started ourselves.
OWN_SERVER=0
if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "==> Reusing server already on :$PORT"
else
  echo "==> Starting server on :$PORT"
  python3 -m http.server "$PORT" --directory web >/dev/null 2>&1 &
  SERVER_PID=$!
  OWN_SERVER=1
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "http://localhost:$PORT/" && break
    sleep 0.25
  done
fi

cleanup() {
  if [[ "$OWN_SERVER" == "1" ]]; then kill "$SERVER_PID" 2>/dev/null; fi
}
trap cleanup EXIT

# --- suites ------------------------------------------------------------------
TOTAL_PASS=0
TOTAL_FAIL=0
BAD=0

for suite in "${SUITES[@]}"; do
  echo
  echo "=============================================================="
  echo "  $suite"
  echo "=============================================================="
  out=$(python3 "tests/$suite" 2>&1)
  status=$?
  echo "$out"
  # Each suite ends with a "PASS n  FAIL n" line. The suites are not consistent
  # about how many spaces sit between the two, so match one or more.
  line=$(echo "$out" | grep -oE 'PASS [0-9]+ +FAIL [0-9]+' | tail -1)
  if [[ -n "$line" ]]; then
    p=$(echo "$line" | awk '{print $2}')
    f=$(echo "$line" | awk '{print $4}')
    TOTAL_PASS=$((TOTAL_PASS + p))
    TOTAL_FAIL=$((TOTAL_FAIL + f))
  else
    # A suite that dies on an exception (server down, selector gone ambiguous)
    # prints no summary. Counting that as "0 failures" is how a crashed suite
    # gets reported as a clean run -- it already happened once. Treat a missing
    # summary as a hard failure, not as an absence of findings.
    echo "  !! $suite produced no PASS/FAIL summary -- it crashed. Counting as failed."
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    BAD=1
  fi
  [[ $status -ne 0 ]] && BAD=1
done

# The palette/contrast checker reports in its own format, so its checks are
# counted separately rather than folded into the Playwright total.
echo
echo "=============================================================="
echo "  cvd_contrast_check.py"
echo "=============================================================="
cvd=$(python3 tests/cvd_contrast_check.py --live 2>&1)
cvd_status=$?
echo "$cvd"
CVD_PASS=$(echo "$cvd" | grep -c '^  PASS')
CVD_FAIL=$(echo "$cvd" | grep -c '^  FAIL')
[[ $cvd_status -ne 0 ]] && BAD=1

echo
echo "=============================================================="
printf '  Playwright suites : PASS %d   FAIL %d\n' "$TOTAL_PASS" "$TOTAL_FAIL"
printf '  Palette/contrast  : PASS %d   FAIL %d\n' "$CVD_PASS" "$CVD_FAIL"
printf '  TOTAL             : PASS %d   FAIL %d\n' \
  "$((TOTAL_PASS + CVD_PASS))" "$((TOTAL_FAIL + CVD_FAIL))"
echo "=============================================================="

[[ $TOTAL_FAIL -gt 0 || $CVD_FAIL -gt 0 ]] && BAD=1
exit "$BAD"
