/**
 * Regions (regions.js)
 *
 * The groups of states a game can be played on, besides a single state. The
 * Area Select screen has a button for each grouping, and shows its regions
 * on the map to choose from (see boards.js for how a region becomes a
 * board).
 *
 * Each grouping has an `id` (kept in saved games: do not change it once
 * games have been played), a `label` for its button, and its regions. Each
 * region has an `id` (also kept in saved games), a `name` shown to players,
 * and its `states`, by postal abbreviation. Edit freely: add a region, move
 * a state from one to another, or add a grouping of your own. A state may
 * be in any number of groupings, but in only one region of each.
 *
 * Alaska and Hawaii are left out of every region: a board is one piece of
 * land, and they are far from the rest. They can still be played on their
 * own, as states.
 *
 * @module config/regions
 */

export const REGION_GROUPINGS = [
  {
    // Neighboring states in twos and threes: boards a little bigger than a
    // single state, with enough towns for a good game
    id: 'regions',
    label: 'Regions',
    regions: [
      { id: 'new-england', name: 'New England', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'] },
      { id: 'new-york-new-jersey', name: 'New York & New Jersey', states: ['NY', 'NJ'] },
      { id: 'chesapeake', name: 'Chesapeake', states: ['PA', 'DE', 'MD', 'DC'] },
      { id: 'virginias', name: 'The Virginias', states: ['VA', 'WV'] },
      { id: 'carolinas', name: 'The Carolinas', states: ['NC', 'SC'] },
      { id: 'georgia-florida', name: 'Georgia & Florida', states: ['GA', 'FL'] },
      { id: 'gulf-coast', name: 'Gulf Coast', states: ['AL', 'MS', 'LA'] },
      { id: 'tennessee-kentucky', name: 'Tennessee & Kentucky', states: ['TN', 'KY'] },
      { id: 'ohio-valley', name: 'Ohio Valley', states: ['OH', 'IN'] },
      { id: 'great-lakes', name: 'Great Lakes', states: ['MI', 'IL', 'WI'] },
      { id: 'upper-midwest', name: 'Upper Midwest', states: ['MN', 'IA'] },
      { id: 'ozarks', name: 'Ozarks', states: ['MO', 'AR'] },
      { id: 'northern-plains', name: 'Northern Plains', states: ['ND', 'SD', 'NE'] },
      { id: 'southern-plains', name: 'Southern Plains', states: ['KS', 'OK'] },
      { id: 'texas', name: 'Texas', states: ['TX'] },
      { id: 'southwest', name: 'Southwest', states: ['AZ', 'NM'] },
      { id: 'rocky-mountains', name: 'Rocky Mountains', states: ['CO', 'UT', 'WY'] },
      { id: 'northern-rockies', name: 'Northern Rockies', states: ['MT', 'ID'] },
      { id: 'pacific-northwest', name: 'Pacific Northwest', states: ['WA', 'OR'] },
      { id: 'california-nevada', name: 'California & Nevada', states: ['CA', 'NV'] }
    ]
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
