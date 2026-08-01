#!/usr/bin/env bash
# Deploy the VizCon 2026 entry to GitHub Pages.
#
#   ./deploy.sh <github-username> <personal-email> [repo-name]
#
# Requires a GitHub Personal Access Token with 'repo' scope, exported as GH_TOKEN
# or entered when prompted. Create one at:
#   https://github.com/settings/tokens/new?scopes=repo&description=vizcon2026
#
# Safe to re-run: if the repo already exists it just pushes an update.
#
# NOTE ON THE PAGES FOLDER: GitHub Pages only lets you serve from the branch
# root or from /docs -- an arbitrary folder like /web is NOT selectable, in the
# UI or the API. So this script publishes the CONTENTS of web/ to the root of a
# separate 'gh-pages' branch via git subtree. 'main' keeps its normal layout.

set -euo pipefail

USER_NAME="${1:?usage: ./deploy.sh <github-username> <personal-email> [repo-name]}"
USER_EMAIL="${2:?usage: ./deploy.sh <github-username> <personal-email> [repo-name]}"
REPO="${3:-longevity-happiness-gap}"

cd "$(dirname "$0")"

if [[ -z "${GH_TOKEN:-}" ]]; then
  if [[ -t 0 ]]; then
    read -rsp "GitHub Personal Access Token (repo scope): " GH_TOKEN
    echo
  else
    cat >&2 <<'MSG'
ERROR: no token, and stdin is not an interactive terminal so I cannot prompt.
       Pass it via the environment instead — note the leading space, which
       keeps the token out of your shell history:

         export GH_TOKEN=ghp_xxxxxxxxxxxx
         ./deploy.sh <github-username> <personal-email>

MSG
    exit 1
  fi
fi
[[ -n "$GH_TOKEN" ]] || { echo "ERROR: no token supplied." >&2; exit 1; }

api() {
  curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

split() { BODY=$(sed '$d' <<<"$1"); CODE=$(tail -n1 <<<"$1"); }

# --- 0. verify the token, and that it belongs to the expected account --------
split "$(api https://api.github.com/user)"
[[ "$CODE" == "200" ]] || { echo "ERROR: token rejected (HTTP $CODE). Check scopes." >&2; exit 1; }
ACTUAL=$(python3 -c 'import sys,json;print(json.load(sys.stdin)["login"])' <<<"$BODY")
if [[ "$ACTUAL" != "$USER_NAME" ]]; then
  echo "ERROR: token belongs to '$ACTUAL' but you specified '$USER_NAME'." >&2
  echo "       Refusing to push to the wrong account." >&2
  exit 1
fi
echo "==> Authenticated as $ACTUAL"

# --- 1. repo-local commit identity (never touches your global config) -------
git config user.name  "$USER_NAME"
git config user.email "$USER_EMAIL"
echo "==> Commit identity for THIS repo only: $USER_NAME <$USER_EMAIL>"

# --- 2. rewrite the README placeholder with the real Pages URL --------------
PAGES_URL="https://${USER_NAME}.github.io/${REPO}/"
python3 - "$PAGES_URL" <<'PY'
import re, sys, pathlib
url = sys.argv[1]
p = pathlib.Path("README.md")
t = p.read_text()
t2 = re.sub(r'https://[A-Za-z0-9_.-]*REPLACE_ME[A-Za-z0-9_.-]*\.github\.io/[^)]*', url, t)
if t2 != t:
    p.write_text(t2)
    print(f"==> README live link set to {url}")
else:
    print("==> README link already set (no placeholder found)")
PY

# --- 3. commit ---------------------------------------------------------------
# Deliberately does NOT 'git add -A'. Deploying is not the place to decide what
# belongs in a public repo -- that is how internal notes got published once
# already. Only the README rewrite from step 2 is auto-committed; anything else
# uncommitted stops the deploy so you can look at it and commit it yourself.
if [[ -n "$(git status --porcelain --untracked-files=all -- . ':!README.md')" ]]; then
  echo "ERROR: uncommitted changes other than README.md:" >&2
  git status --short --untracked-files=all -- . ':!README.md' >&2
  cat >&2 <<'MSG'

       Review these and commit them yourself before deploying. Check that
       nothing internal is among them -- deploy.sh will not stage files for
       you. If a file should never be published, add it to .gitignore.
MSG
  exit 1
fi

if git diff --quiet -- README.md; then
  echo "==> Nothing new to commit"
else
  git add README.md
  git commit -q -m "Set the live Pages URL in the README"
  echo "==> Committed the README live-link update"
fi

git branch -M main

# --- 4. create the repo if it doesn't exist --------------------------------
split "$(api "https://api.github.com/repos/${USER_NAME}/${REPO}")"
if [[ "$CODE" == "404" ]]; then
  echo "==> Creating public repo ${USER_NAME}/${REPO}"
  split "$(api -X POST https://api.github.com/user/repos -d @- <<JSON
{"name":"${REPO}",
 "description":"The Longevity-Happiness Gap - a D3 scrollytelling data story. Analyticon VizCon 2026.",
 "homepage":"${PAGES_URL}",
 "private":false,
 "has_issues":false,
 "has_wiki":false,
 "has_projects":false}
JSON
)"
  [[ "$CODE" == "201" ]] || { echo "ERROR: repo creation failed (HTTP $CODE)"; echo "$BODY" >&2; exit 1; }
  echo "==> Created"
elif [[ "$CODE" == "200" ]]; then
  echo "==> Repo already exists; will push an update"
else
  echo "ERROR: unexpected response checking repo (HTTP $CODE)" >&2; echo "$BODY" >&2; exit 1
fi

# --- 5. push main, then publish web/ to the root of gh-pages ----------------
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${USER_NAME}/${REPO}.git"
PUSH_URL="https://${USER_NAME}:${GH_TOKEN}@github.com/${USER_NAME}/${REPO}.git"

echo "==> Pushing main (source of record)"
git push -q --set-upstream "$PUSH_URL" main

echo "==> Publishing web/ to the root of gh-pages"
SPLIT=$(git subtree split --prefix web -q --annotate="[pages] " HEAD 2>/dev/null || git subtree split --prefix web HEAD | tail -n1)
[[ -n "$SPLIT" ]] || { echo "ERROR: git subtree split produced no commit." >&2; exit 1; }
git push -q --force "$PUSH_URL" "${SPLIT}:refs/heads/gh-pages"
echo "==> gh-pages updated (web/ contents are now that branch's root)"

# --- 6. enable Pages, serving from the root of gh-pages ---------------------
echo "==> Enabling GitHub Pages (source: gh-pages branch, root)"
split "$(api -X POST "https://api.github.com/repos/${USER_NAME}/${REPO}/pages" \
  -d '{"source":{"branch":"gh-pages","path":"/"}}')"
if [[ "$CODE" == "201" ]]; then
  echo "==> Pages enabled"
elif [[ "$CODE" == "409" ]]; then
  echo "==> Pages already enabled; updating source"
  split "$(api -X PUT "https://api.github.com/repos/${USER_NAME}/${REPO}/pages" \
    -d '{"source":{"branch":"gh-pages","path":"/"}}')"
else
  echo "WARNING: could not enable Pages automatically (HTTP $CODE)."
  echo "         Set it by hand: Settings > Pages > Branch: gh-pages, folder: / (root)"
  echo "$BODY" >&2
fi

# --- 7. wait for the first build, then verify it actually serves -----------
echo "==> Waiting for the first Pages build (this usually takes 30-90s)"
for i in $(seq 1 40); do
  sleep 15
  LIVE=$(curl -s -o /dev/null -w '%{http_code}' "$PAGES_URL" || true)
  if [[ "$LIVE" == "200" ]]; then
    echo
    echo "================================================================"
    echo " LIVE: $PAGES_URL"
    echo "================================================================"
    # verify the assets the page depends on, not just the HTML
    BAD=0
    for f in css/style.css js/main.js img/hero.jpg img/close.jpg \
             data/gap.json data/world.topo.json data/decoupling.json \
             data/affect.json data/groups.json data/covid.json \
             data/regions.json data/panel.json data/choropleth.json; do
      c=$(curl -s -o /dev/null -w '%{http_code}' "${PAGES_URL}${f}")
      printf '  %-24s %s\n' "$f" "$c"
      [[ "$c" == "200" ]] || BAD=1
    done

    # Confirm the deploy actually replaced the old files, rather than Pages
    # serving a stale build: these strings only exist in the current version.
    echo
    for marker in verify-open a11y-live skip-link; do
      if curl -s "$PAGES_URL" | grep -q "$marker"; then
        printf '  %-24s present\n' "$marker"
      else
        printf '  %-24s MISSING (stale build?)\n' "$marker"; BAD=1
      fi
    done

    [[ "$BAD" == "0" ]] && echo && echo "==> All assets and freshness markers OK"
    exit "$BAD"
  fi
  printf '    ... still building (%s, attempt %d/40)\n' "$LIVE" "$i"
done

echo "WARNING: not serving 200 yet. First builds can take a few minutes."
echo "         Check status: https://github.com/${USER_NAME}/${REPO}/actions"
echo "         URL will be:  $PAGES_URL"
