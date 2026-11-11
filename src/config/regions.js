/**
 * Regions (regions.js)
 *
 * The groups of states a game can be played on, besides a single state. The
 * Area Select screen has a button for each grouping, in the order they are
 * listed here, and shows its regions on the map to choose from (see
 * boards.js for how a region becomes a board). The first grouping is the one
 * the screen opens on.
 *
 * Each grouping has an `id`, a `label` for its button, and its regions. Each
 * region has an `id`, a `name` shown to players, and its `states`, by postal
 * abbreviation. The ids only tell groupings and regions apart while the
 * screen is open: a saved game keeps its board's name and states, not these
 * ids, so they can be changed freely. Edit freely: add a region, move a state
 * from one to another, or add a grouping of your own.
 *
 * A state may be in more than one region of a grouping. The Objective Lists
 * regions put Pennsylvania and Missouri in two each; those boards overlap on
 * the map, and both include the whole state.
 *
 * Alaska and Hawaii are left out of every region: a board is one piece of
 * land, and they are far from the rest. They can still be played on their
 * own, as states.
 *
 * @module config/regions
 */

/**
 * The sub-regions of Objective Lists' "Regions of the United States"
 * (https://objectivelists.com/regions-of-the-united-states/), which groups
 * states by how alike they are (its State Similarity Index) rather than by
 * history or by Census lines.
 *
 * The page splits two states: East Pennsylvania is in BosWash and West
 * Pennsylvania in Great Lakes; North Missouri is in Great Plains and South
 * Missouri in Southeast. A board is made of whole states, so each of those
 * sub-regions gets the whole state.
 *
 * The page leaves out Washington, DC; it is put in BosWash, with its
 * neighbor Maryland.
 *
 * Each sub-region also names the region (see OBJECTIVE_REGIONS) it is part
 * of, by that region's id.
 */
const OBJECTIVE_SUB_REGIONS = [
  {
    id: 'north-new-england',
    name: 'North New England',
    region: 'northeast',
    states: ['ME', 'NH', 'VT']
  },
  {
    id: 'boswash',
    name: 'BosWash',
    region: 'northeast',
    states: ['CT', 'MA', 'NJ', 'NY', 'RI', 'PA', 'DE', 'MD', 'DC']
  },
  {
    id: 'great-lakes',
    name: 'Great Lakes',
    region: 'midwest',
    states: ['IL', 'IN', 'MI', 'MN', 'OH', 'PA', 'WI']
  },
  {
    id: 'great-plains',
    name: 'Great Plains',
    region: 'midwest',
    states: ['IA', 'KS', 'NE', 'ND', 'SD', 'MO']
  },
  { id: 'florida', name: 'Florida', region: 'south', states: ['FL'] },
  { id: 'south-central', name: 'South Central', region: 'south', states: ['TX', 'OK'] },
  {
    id: 'southeast',
    name: 'Southeast',
    region: 'south',
    states: ['AL', 'AR', 'KY', 'LA', 'MO', 'MS', 'TN', 'GA', 'NC', 'SC', 'VA', 'WV']
  },
  {
    id: 'rocky-mountain',
    name: 'Rocky Mountain',
    region: 'west',
    states: ['ID', 'MT', 'WY', 'CO', 'UT']
  },
  { id: 'pacific-coast', name: 'Pacific Coast', region: 'west', states: ['OR', 'WA', 'CA'] },
  { id: 'southwest', name: 'Southwest', region: 'west', states: ['AZ', 'NV', 'NM'] }
]

/**
 * The page's four mainland regions, the level above its sub-regions. Each
 * is made of the states of its sub-regions, worked out from them below, so
 * the two levels always agree: move a state between sub-regions and its
 * region follows.
 */
const OBJECTIVE_REGIONS = [
  { id: 'northeast', name: 'Northeast' },
  { id: 'midwest', name: 'Midwest' },
  { id: 'south', name: 'South' },
  { id: 'west', name: 'West' }
].map((region) => ({
  ...region,
  // Every state of the region's sub-regions
  states: OBJECTIVE_SUB_REGIONS.filter((sub) => sub.region === region.id).flatMap(
    (sub) => sub.states
  )
}))

export const REGION_GROUPINGS = [
  {
    // Objective Lists' sub-regions: boards from one state (Florida) to a
    // dozen (Southeast)
    id: 'sub-regions',
    label: 'Sub-regions',
    regions: OBJECTIVE_SUB_REGIONS.map(({ id, name, states }) => ({ id, name, states }))
  },
  {
    // Objective Lists' regions: four big boards
    id: 'regions',
    label: 'Regions',
    regions: OBJECTIVE_REGIONS
  },
  {
    // The Census Bureau's nine divisions
    id: 'census-divisions',
    label: 'Census divisions',
    regions: [
      { id: 'new-england', name: 'New England', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'] },
      { id: 'middle-atlantic', name: 'Middle Atlantic', states: ['NJ', 'NY', 'PA'] },
      {
        id: 'east-north-central',
        name: 'East North Central',
        states: ['IL', 'IN', 'MI', 'OH', 'WI']
      },
      {
        id: 'west-north-central',
        name: 'West North Central',
        states: ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD']
      },
      {
        id: 'south-atlantic',
        name: 'South Atlantic',
        states: ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV']
      },
      { id: 'east-south-central', name: 'East South Central', states: ['AL', 'KY', 'MS', 'TN'] },
      { id: 'west-south-central', name: 'West South Central', states: ['AR', 'LA', 'OK', 'TX'] },
      {
        id: 'mountain',
        name: 'Mountain',
        states: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY']
      },
      { id: 'pacific', name: 'Pacific', states: ['CA', 'OR', 'WA'] }
    ]
  },
  {
    // The Census Bureau's four regions: the biggest boards
    id: 'census-regions',
    label: 'Census regions',
    regions: [
      {
        id: 'northeast',
        name: 'Northeast',
        states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA']
      },
      {
        id: 'midwest',
        name: 'Midwest',
        states: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD']
      },
      {
        id: 'south',
        name: 'South',
        states: [
          'DE',
          'DC',
          'FL',
          'GA',
          'MD',
          'NC',
          'SC',
          'VA',
          'WV',
          'AL',
          'KY',
          'MS',
          'TN',
          'AR',
          'LA',
          'OK',
          'TX'
        ]
      },
      {
        id: 'west',
        name: 'West',
        states: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'CA', 'OR', 'WA']
      }
    ]
  }
]
