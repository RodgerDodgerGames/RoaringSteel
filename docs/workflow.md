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

## Rules

- **GitHub issues are the single source of truth** for the backlog. There is no task
  list file — one existed, drifted out of date, and was removed in #51.
- One issue → one branch → one PR.
- Branch naming: `feat/<issue#>-slug`, `fix/<issue#>-slug`, `docs/<issue#>-slug`,
  `chore/<issue#>-slug`.
- Never push directly to `main`.
- Work outside an issue's stated scope becomes a new issue, not extra commits.
- The developer does not merge. The coordinator does.
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
