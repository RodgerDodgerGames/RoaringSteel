# roaring-steel

This is a browser-based version of the legendary railroad building board game [Empire Builder](https://boardgamegeek.com/boardgame/168/empire-builder). Since this is the internet, this game will update the locations and commodities according to the latest available data from the US Census and the US Department of Labor. Play versus your friends or play solo against computer players. Either way, have fun building your railroad empire.

## Installation

Run `npm install roaring-steel`

## Architecture

The app is built with [Vite](https://vitejs.dev/) and [Vue](https://vuejs.org/). [Bulma](https://bulma.io/) is used as a CSS framework.

## Development

```sh
npm install
npm run dev        # dev server at localhost:5173
npm run test:run   # test suite
npm run build      # production build
```

See [docs/workflow.md](docs/workflow.md) for how work moves from issue to merge, and
[docs/codebase_analysis.md](docs/codebase_analysis.md) for a technical analysis of the codebase (dated December 2025).

## Credits

The game's About dialog lists every credit; the list lives in `src/config/credits.js`.

- Map tiles: [Stadia Maps](https://www.stadiamaps.com/), [Stamen Design](https://www.stamen.com/), [OpenMapTiles](https://openmaptiles.org/), and [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, on AWS Open Data). United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration.
- Land cover: [Annual National Land Cover Database](https://www.mrlc.gov/data/project/annual-nlcd) (Annual NLCD), U.S. Geological Survey and the MRLC Consortium
- Towns and industries: [U.S. Census Bureau](https://www.census.gov/data/developers.html) (American Community Survey, Quarterly Workforce Indicators, TIGERweb). This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.
- Commodity icons: [game-icons.net](https://game-icons.net) (CC BY 3.0; authors in `src/assets/icons/commodities/CREDITS.md`)
- Typefaces: Eutemia I, Saddlebag and Steelplate Textura, from [1001 Fonts](https://www.1001fonts.com/)
- Interface icons: [Font Awesome](https://fontawesome.com/)
- Built with [Vue](https://vuejs.org/), [Pinia](https://pinia.vuejs.org/), [Leaflet](https://leafletjs.com/), [Turf.js](https://turfjs.org/) and [Bulma](https://bulma.io/)

## File Summary

public/data
- CSV files for generating commodities (industries)
- CSV files for generating towns
- GeoJSON files for generating towns

src/assets
- icons/towns
- icons/commodities: what towns produce, from [game-icons.net](https://game-icons.net)
  (CC BY 3.0; authors in its CREDITS.md)
- fonts
- images

src/components
- vue components

src/stores
- pinia stores

src/composables
- map/
  - functional logic for map components
- setup/
  - functional logic for setup components

src/config
- configuration files, usually associated with composable activities

src/views
- vue views

top-level tools/configs
- .env file
- package.json
- vite.config.js
- .eslintrc.cjs
- .prettierrc.json
- jsconfig.json



