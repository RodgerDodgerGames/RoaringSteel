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
[docs/codebase_analysis.md](docs/codebase_analysis.md) for a technical analysis of the codebase.

## File Summary

public/data
- CSV files for generating commodities (industries)
- CSV files for generating towns
- GeoJSON files for generating towns

src/assets
- icons/towns
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



