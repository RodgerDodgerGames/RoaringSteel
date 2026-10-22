/**
 * Player Colors (playerColors.js)
 *
 * The colors a player can pick on the setup screen. A player's color is
 * how everything they own is told apart — their track on the map, their chip
 * in the top bar, their card in the side panel — so no two players may share
 * one, and the colors themselves have to be easy to tell apart at a glance.
 *
 * Each hue is well away from its neighbors on the color wheel, so no two
 * are easily mistaken for each other. They are also chosen to work in both
 * places a color is shown:
 * - behind black text (setup buttons, the confirm cards, player chips), so
 *   none is dark;
 * - as track on the terrain map, drawn with a dark outline, so none is so pale
 *   it washes out against the light background.
 *
 * Order matters: a new setup row is given the first color nobody has yet, so
 * the first few are the most distinct from each other.
 *
 * @module config/playerColors
 */

export const playerColors = [
  '#E8504A', // red
  '#4F86F7', // blue
  '#FFE119', // yellow
  '#3CB44B', // green
  '#F58231', // orange
  '#B07CEB', // purple
  '#42D4F4', // sky
  '#F032E6', // magenta
  '#B5E61D', // lime
  '#FF9FC8', // pink
  '#2EC4B6', // teal
  '#C08A55' // brown
]
