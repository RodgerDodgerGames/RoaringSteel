# Development Workflow

How work moves through this repo, from idea to merged code.

## Roles

**Coordinator** — files issues, does manual and user testing, reviews, merges.

**Developer** (currently Claude) — reads the issue, asks blocking questions up front,
implements with tests, self-reviews, opens the PR.

The split exists so that judgment about *what the game should do* stays with the
coordinator, and the mechanical work of building and verifying it doesn't.

## The loop

```
  Coordinator                          Developer
  ───────────                          ─────────
  1. File issue
  2. "work #NN"  ──────────────────▶
                                       3. Read issue, ask blockers
                                       4. Branch, implement, test
                                       5. Push → DRAFT PR
                                          (CI runs automatically)
                 ◀──────────────────
  6. Check CI, test the draft
  7. Comment findings ─────────────▶
                                       8. Fix, then polish pass:
                                          tests + lint + code review
                                          → mark PR ready
                 ◀──────────────────
  9. Review diff, merge, delete branch
```

The **draft PR** is the hinge. It means the coordinator never tests a branch that
hasn't already passed CI, and the developer never polishes code that's about to be
redirected.

## Writing an issue

Use **Issues → New issue** and pick the **Feature / Change** or **Bug** form. The
Feature form asks for three things, each doing a specific job:

| Field | Job |
|---|---|
| **Outcome** | What's true when it's done, from a player's point of view. Prevents solving the wrong problem. |
| **Acceptance criteria** | Becomes the literal testing checklist on the PR. The highest-value field. |
| **Out of scope** | The anti-scope-creep lever. "Don't restyle the panel" saves a review round-trip. |

Issues don't need to be long. They need to be *decided*.

### Example

Issue #52 was originally filed as:

> **update packages** — Update all npm packages

That cost a round-trip, because it didn't say how to handle major version bumps —
and there were five of them, including Pinia jumping two majors. Compare:

> **Outcome:** every dependency on its latest version, major bumps included.
> **Acceptance criteria:** `npm outdated` empty; `npm audit` clean; 183 tests pass; build succeeds.
> **Out of scope:** fixing anything that breaks — file follow-up issues instead.

Same request, no round-trip.

### Sizing

One issue should be one PR, one testing session. If it needs more than that, split it
and link the pieces.

- Right-sized: *"Add welcome message at top of info panel"* (#42)
- Too big: *"Build bad-ass basemap"* (#14) — that's a milestone wearing an issue's clothes

## What gets a test

New logic ships with tests. That is the default, not a judgment call the developer
makes fresh each time.

It is a default, not a rule that fires on every line. The question to ask is: **if this
broke silently, would a player notice — and would anyone catch it before they did?**

**Write a test for:**

- Game rules and state transitions — movement costs, build legality, turn order,
  payouts, win conditions. Anything where "wrong" means the game is playing itself
  incorrectly.
- Anything with branches, arithmetic, or edge cases. Off-by-one on a track segment
  cost is invisible in the UI and obvious in a test.
- Every bug fix. The test reproduces the bug first, then the fix turns it green.
  This is the one case with no exceptions — an untested fix can regress silently,
  and a bug that already happened once is proof the case is reachable.
- Data parsing and transforms — anything reading an external API or CSV into game
  state, where the shape can change underneath us.

**Don't write a test for:**

- Wiring: a click handler that calls one store action, a computed that renames a
  field, a prop passed down a level.
- Styling, layout, copy.
- Rendering, unless the component itself holds logic worth protecting. This repo
  currently has no component tests, and that's a deliberate line — logic lives in
  stores and composables, and that's where the suite lives too.

A test that only restates the implementation is worse than no test: it fails on every
refactor and catches nothing. If the only way to write it is to mirror the code
line-for-line, that's a signal the code has no behavior worth asserting yet.

### Where tests live

`tests/` mirrors `src/` — `tests/stores/` and `tests/composables/`. A new store or
composable gets a matching spec file.

### Coverage gaps in existing code

If work uncovers an important game function that has no test — not a gap in the
current diff, but pre-existing — the developer says so and **files an issue**. It does
not become extra commits on the current branch; that's the same scope rule that
applies to everything else. Naming the gap out loud is the point, so the coordinator
can decide when it gets paid down.

## Testing a draft PR

Check CI first — there's a checks section at the bottom of the PR, or:

```sh
gh pr checks <PR#>
```

If it's red, don't spend time testing. Say so and it gets fixed first.

To run the branch locally:

```sh
gh pr checkout <PR#>    # switches to the PR's branch
npm install             # only if dependencies changed
npm run dev
```

Then follow the **How to test** section in the PR description, which gives an exact
click-path. Return to your own work with `git checkout main`.

Automated checks and manual testing cover different things. CI proves the code
compiles and the unit tests pass. It cannot prove the game *plays* correctly — that's
what the manual pass is for, and it's why the workflow puts a human between "green"
and "merged."

## Giving feedback

Two kinds, and the distinction matters:

- **Line comments** — in the *Files changed* tab, click the `+` beside a line.
  Use for "this specific code is wrong."
- **Top-level comments** — bottom of the *Conversation* tab.
  Use for "step 3 doesn't work" or "this feels wrong."

Most coordinator feedback is the second kind, because the job is testing behavior,
not reading diffs.

## Merging

Once the developer marks the PR **ready for review**:

1. Read the final diff.
2. **merge** 
3. **Delete branch** on the confirmation page.

`Closes #NN` in the PR body closes the issue automatically.

Deleting the branch at merge time is the habit that prevents branch pileup. This repo
accumulated 13 stale merged branches before the habit existed.

## After merging

Merging on GitHub changes nothing on your machine. Your clone is still sitting on the
PR's branch, and your local `main` still points at the commit from before the merge.
Three commands put it right:

```sh
git checkout main && git pull --ff-only && git branch -d <the-branch-you-were-on>
```

`--ff-only` is the safety flag. It tells git to fast-forward or fail, never to invent a
merge commit because your local `main` drifted. If it ever errors, that's a signal to
look at why — not to reach for a plain `git pull`.

`git branch -d` (lowercase) refuses to delete a branch whose work isn't merged, so it
can't lose anything. That's why it's `-d` and not `-D`.

If the PR changed `package.json`, add one more:

```sh
npm install
```

and restart `npm run dev` if it was running — Vite won't pick up new dependencies on its
own.

### Branch cleanup

Deleting each branch as you go is the habit that prevents pileup, but if some accumulate,
this clears every branch already merged into `main` and leaves unmerged work alone:

```sh
git branch --merged main | grep -vE '^\*|^\s+main$' | xargs git branch -d
```

Local branches are just labels — deleting one that's been merged discards nothing, since
the commits live on in `main`.

## Rules

- **GitHub issues are the single source of truth** for the backlog. There is no task
  list file — one existed, drifted out of date, and was removed in #51.
- One issue → one branch → one PR.
- Branch naming: `feat/<issue#>-slug`, `fix/<issue#>-slug`, `docs/<issue#>-slug`,
  `chore/<issue#>-slug`.
- Never push directly to `main`.
- Work outside an issue's stated scope becomes a new issue, not extra commits.
- The developer does not merge. The coordinator does.
- New logic ships with tests; every bug fix ships with a regression test. See
  [What gets a test](#what-gets-a-test).
- Test and CI results get reported honestly. A red CI is reported, not worked around.

## Command reference

```sh
gh issue list                  # open issues
gh issue view <N>              # read one
gh issue create                # file one (or use the web forms)

gh pr list                     # open PRs
gh pr view <N>                 # read one
gh pr checks <N>               # CI status
gh pr checkout <N>             # check out a PR branch locally
gh pr diff <N>                 # read the diff in the terminal

npm run dev                    # dev server, localhost:5173
npm run test:run               # full test suite, single run
npm run build                  # production build
npm run lint                   # see "Known issues" below
```
