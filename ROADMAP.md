# Roadmap

Features planned for Roaring Steel but not yet scheduled. Each entry says what
is wanted, why, and how the game gets by without it for now.

## Ferries

**What:** Ferry routes that carry trains across water too wide to bridge, so
towns on islands far offshore, such as Nantucket (BosWash) or Key West (South
Atlantic), can be reached. Empire Builder has ferry lines between fixed ports,
with their own building cost and a turn's delay to cross.

**Why:** Track may only bridge a short stretch of water (see `bridges` in
`src/config/game.js`), so no player can lay track to a town on such an island.

**For now:** Towns that track cannot reach are left off the board once the grid
is built (see `src/composables/reachableTowns.js`). Adding ferries would bring
those towns back.
