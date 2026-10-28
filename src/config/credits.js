/**
 * Credits (credits.js)
 *
 * Everything the game is built on that someone else made: the maps, the
 * terrain and census data, the art and type, and the main libraries. The
 * About dialog lists all of it. Several of these licenses ask for a credit
 * (the map tiles, OpenStreetMap, the icons, the terrain data, the Census
 * Bureau's API); the rest are credited because they deserve it.
 *
 * Kept here, not in the dialog, so adding a source means adding a line of
 * data rather than editing markup.
 *
 * @module config/credits
 */

/** The board game this is a version of */
export const BOARD_GAME_URL = 'https://boardgamegeek.com/boardgame/168/empire-builder'

/** Where the game's code lives */
export const REPOSITORY_URL = 'https://github.com/RodgerDodgerGames/RoaringSteel'

/**
 * The notice the Census Bureau's terms ask every app using its API to show,
 * word for word.
 */
export const CENSUS_NOTICE =
  'This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.'

/**
 * The credits, in groups. Each credit names who made it, links to them, and
 * says what the game uses it for. Where a license asks for particular
 * wording, the `note` is that wording.
 */
export const CREDIT_GROUPS = [
  {
    title: 'Maps',
    credits: [
      { name: 'Stadia Maps', url: 'https://www.stadiamaps.com/', note: 'Game map tiles' },
      {
        name: 'Stamen Design',
        url: 'https://www.stamen.com/',
        note: 'Terrain background map style'
      },
      { name: 'OpenMapTiles', url: 'https://openmaptiles.org/', note: 'Map tile schema' },
      {
        name: 'OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
        note: 'Map data, and the map the region is chosen on'
      }
    ]
  },
  {
    title: 'Terrain',
    credits: [
      {
        name: 'Terrain Tiles (Mapzen), on AWS Open Data',
        url: 'https://registry.opendata.aws/terrain-tiles/',
        note:
          'Elevation. United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain ' +
          'data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National ' +
          'Oceanic and Atmospheric Administration.'
      },
      {
        name: 'National Land Cover Database (NLCD 2021)',
        url: 'https://www.mrlc.gov/',
        note: 'Land cover, from the U.S. Geological Survey and the MRLC Consortium'
      }
    ]
  },
  {
    title: 'Towns and industries',
    credits: [
      {
        name: 'U.S. Census Bureau',
        url: 'https://www.census.gov/data/developers.html',
        note:
          'Metro area populations (American Community Survey), jobs by industry (Quarterly ' +
          'Workforce Indicators), metro area locations (TIGERweb), and state outlines'
      }
    ]
  },
  {
    title: 'Art and type',
    credits: [
      {
        name: 'game-icons.net',
        url: 'https://game-icons.net',
        note: 'Commodity icons (CC BY 3.0); each icon’s author is listed in the source'
      },
      {
        name: '1001 Fonts',
        url: 'https://www.1001fonts.com/',
        note: 'The Eutemia I, Saddlebag and Steelplate Textura typefaces'
      },
      { name: 'Font Awesome', url: 'https://fontawesome.com/', note: 'Interface icons' }
    ]
  },
  {
    title: 'Built with',
    credits: [
      { name: 'Vue', url: 'https://vuejs.org/', note: 'Interface' },
      { name: 'Pinia', url: 'https://pinia.vuejs.org/', note: 'Game state' },
      { name: 'Leaflet', url: 'https://leafletjs.com/', note: 'Maps' },
      { name: 'Turf.js', url: 'https://turfjs.org/', note: 'Geography' },
      { name: 'Bulma', url: 'https://bulma.io/', note: 'Styles' }
    ]
  }
]
