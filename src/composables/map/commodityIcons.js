/**
 * Commodity Icons (commodityIcons.js)
 *
 * The pictures that show what a town produces, like the commodity symbols
 * printed beside each city on the Empire Builder board. They appear around
 * each town in the map's Plan view and beside each industry in a town's popup.
 *
 * A town's commodities are its industries, each identified by a NAICS
 * industry code (see the industry store). Every code in the full curated
 * industry list has an icon, the game's own list (game_industries.csv)
 * among them, so the game's list can take any of them without a change
 * here. A code without one gets a plain cargo crate.
 *
 * The icons are from game-icons.net (CC BY 3.0); the authors are listed in
 * src/assets/icons/commodities/CREDITS.md, and the map credits the site.
 *
 * @module composables/map/commodityIcons
 */

/**
 * Every icon file's URL, by file name without the extension. Vite turns each
 * SVG into a URL at build time. `?no-inline` keeps each one a file of its own:
 * left to Vite's default, every icon under 4 KB would be written into the
 * JavaScript bundle instead, all hundred of them, whether shown or not.
 */
const iconUrls = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/icons/commodities/*.svg', {
      eager: true,
      query: '?no-inline',
      import: 'default'
    })
  ).map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url])
)

/** The icon for a commodity that has none of its own */
const FALLBACK_ICON = 'wooden-crate'

/**
 * Icon file names by NAICS industry code, in NAICS order: every industry in
 * the curated list (public/data/label_industry_curated.csv) and in the
 * game's own list (public/data/game_industries.csv), which has some the
 * curated list does not. A comment names each industry: its NAICS title, or
 * its label in the game's list.
 */
export const commodityIconNames = {
  // Oilseed and Grain Farming
  1111: 'wheat',
  // Vegetable and Melon Farming
  1112: 'carrot',
  // Fruit and Tree Nut Farming
  1113: 'fruit-tree',
  // Greenhouse, Nursery, and Floriculture Production
  1114: 'greenhouse',
  // Cotton & Hay
  1119: 'cotton-flower',
  // Cattle Ranching and Farming
  1121: 'cow',
  // Hog and Pig Farming
  1122: 'pig',
  // Poultry and Egg Production
  1123: 'chicken',
  // Sheep and Goat Farming
  1124: 'sheep',
  // Catfish & Oysters
  1125: 'oyster',
  // Horses
  1129: 'horse-head',
  // Forestry and Logging
  113: 'log',
  // Fishing, Hunting and Trapping
  114: 'fishing-pole',
  // Farming
  1151: 'pitchfork',
  // Ranching
  1152: 'lasso',
  // Timber Crews
  1153: 'chainsaw',
  // Oil and Gas Extraction
  211: 'oil-pump',
  // Coal Mining
  2121: 'coal-wagon',
  // Metal Ore Mining
  2122: 'gold-nuggets',
  // Nonmetallic Mineral Mining and Quarrying
  2123: 'stone-pile',
  // Oilfield Supplies
  2131: 'oil-rig',
  // Construction
  23: 'crane',
  // Animal Food Manufacturing
  3111: 'grain-bundle',
  // Grain and Oilseed Milling
  3112: 'windmill',
  // Sugar and Confectionery Product Manufacturing
  3113: 'sugar-cane',
  // Fruit and Vegetable Preserving and Specialty Food Manufacturing
  3114: 'mason-jar',
  // Dairy Product Manufacturing
  3115: 'milk-carton',
  // Animal Slaughtering and Processing
  3116: 'meat',
  // Seafood Product Preparation and Packaging
  3117: 'shrimp',
  // Bakeries and Tortilla Manufacturing
  3118: 'bread',
  // Snack Foods
  3119: 'chips-bag',
  // Beverage Manufacturing
  3121: 'beer-bottle',
  // Tobacco Manufacturing
  3122: 'cigar',
  // Textile Mills
  313: 'yarn',
  // Yarn & Thread
  3131: 'yarn',
  // Fabric
  3132: 'rolled-cloth',
  // Dyed Fabric
  3133: 'clothesline',
  // Textile Product Mills
  314: 'sewing-machine',
  // Carpets & Curtains
  3141: 'red-carpet',
  // Rope & Tents
  3149: 'rope-coil',
  // Apparel Manufacturing
  315: 't-shirt',
  // Knitwear
  3151: 'wool',
  // Clothing
  3152: 't-shirt',
  // Hats & Gloves
  3159: 'gloves',
  // Leather and Hide Tanning and Finishing
  3161: 'leather-vest',
  // Footwear Manufacturing
  3162: 'leather-boot',
  // Purses & Luggage
  3169: 'suitcase',
  // Wood Product Manufacturing
  321: 'planks',
  // Lumber
  3211: 'planks',
  // Plywood
  3212: 'wood-pile',
  // Millwork & Mobile Homes
  3219: 'door',
  // Paper Manufacturing
  322: 'scroll-unfurled',
  // Paper
  3221: 'scroll-unfurled',
  // Cardboard Boxes
  3222: 'cardboard-box',
  // Printing
  3231: 'stamper',
  // Petroleum and Coal Products Manufacturing
  324: 'oil-drum',
  // Basic Chemical Manufacturing
  3251: 'round-bottom-flask',
  // Resin, Synthetic Rubber, and Artificial and Synthetic Fibers and Filaments Manufacturing
  3252: 'bubbling-flask',
  // Pesticide, Fertilizer, and Other Agricultural Chemical Manufacturing
  3253: 'fertilizer-bag',
  // Pharmaceutical and Medicine Manufacturing
  3254: 'medicine-pills',
  // Paint, Coating, and Adhesive Manufacturing
  3255: 'paint-bucket',
  // Soap, Cleaning Compound, and Toilet Preparation Manufacturing
  3256: 'soap',
  // Explosives & Ink
  3259: 'dynamite',
  // Plastics Product Manufacturing
  3261: 'plastic-duck',
  // Rubber Product Manufacturing
  3262: 'car-wheel',
  // Clay Product and Refractory Manufacturing
  3271: 'clay-brick',
  // Glass and Glass Product Manufacturing
  3272: 'wine-glass',
  // Cement and Concrete Product Manufacturing
  3273: 'concrete-bag',
  // Lime and Gypsum Product Manufacturing
  3274: 'stone-block',
  // Insulation & Cut Stone
  3279: 'brick-pile',
  // Iron and Steel Mills and Ferroalloy Manufacturing
  3311: 'furnace',
  // Steel Product Manufacturing from Purchased Steel
  3312: 'metal-bar',
  // Alumina and Aluminum Production and Processing
  3313: 'metal-plate',
  // Nonferrous Metal (except Aluminum) Production and Processing
  3314: 'melting-metal',
  // Foundries
  3315: 'foundry-bucket',
  // Forging and Stamping
  3321: 'anvil',
  // Cutlery and Handtool Manufacturing
  3322: 'fork-knife-spoon',
  // Architectural and Structural Metals Manufacturing
  3323: 'i-beam',
  // Boiler, Tank, and Shipping Container Manufacturing
  3324: 'water-tank',
  // Hardware Manufacturing
  3325: 'hexagonal-nut',
  // Spring and Wire Product Manufacturing
  3326: 'wire-coil',
  // Machine Shops; Turned Product; and Screw, Nut, and Bolt Manufacturing
  3327: 'screw',
  // Coating, Engraving, Heat Treating, and Allied Activities
  3328: 'paint-roller',
  // Valves & Fittings
  3329: 'valve',
  // Agriculture, Construction, and Mining Machinery Manufacturing
  3331: 'farm-tractor',
  // Industrial Machinery Manufacturing
  3332: 'factory-arm',
  // Commercial and Service Industry Machinery Manufacturing
  3333: 'gears',
  // Ventilation, Heating, Air-Conditioning, and Commercial Refrigeration Equipment Manufacturing
  3334: 'fridge',
  // Metalworking Machinery Manufacturing
  3335: 'drill',
  // Engine, Turbine, and Power Transmission Equipment Manufacturing
  3336: 'turbine',
  // Other General Purpose Machinery Manufacturing
  3339: 'cog',
  // Computer and Peripheral Equipment Manufacturing
  3341: 'laptop',
  // Communications Equipment Manufacturing
  3342: 'radio-tower',
  // Audio and Video Equipment Manufacturing
  3343: 'tv',
  // Semiconductor and Other Electronic Component Manufacturing
  3344: 'microchip',
  // Navigational, Measuring, Electromedical, and Control Instruments Manufacturing
  3345: 'compass',
  // Manufacturing and Reproducing Magnetic and Optical Media
  3346: 'compact-disc',
  // Electric Lighting Equipment Manufacturing
  3351: 'light-bulb',
  // Household Appliance Manufacturing
  3352: 'washing-machine',
  // Electrical Equipment Manufacturing
  3353: 'plug',
  // Batteries & Wire
  3359: 'battery-pack-alt',
  // Motor Vehicle Manufacturing
  3361: 'city-car',
  // Motor Vehicle Body and Trailer Manufacturing
  3362: 'car-door',
  // Motor Vehicle Parts Manufacturing
  3363: 'car-battery',
  // Aerospace Product and Parts Manufacturing
  3364: 'plane-wing',
  // Railroad Rolling Stock Manufacturing
  3365: 'steam-locomotive',
  // Ship and Boat Building
  3366: 'sailboat',
  // Motorcycles
  3369: 'full-motorcycle-helmet',
  // Furniture and Related Product Manufacturing
  337: 'sofa',
  // Furniture
  3371: 'sofa',
  // Office Furniture
  3372: 'office-chair',
  // Mattresses & Blinds
  3379: 'bed',
  // Medical Equipment and Supplies Manufacturing
  3391: 'stethoscope',
  // Toys & Sporting Goods
  3399: 'kite',
  // Grain Elevators
  4245: 'round-silo',
  // Building Material and Garden Equipment and Supplies Dealers
  444: 'toolbox',
  // Building Material and Supplies Dealers
  4441: 'brick-pile',
  // Air Transportation
  481: 'commercial-airplane',
  // Rail Transportation
  482: 'railway',
  // Water Transportation
  483: 'cargo-ship',
  // Truck Transportation
  484: 'truck',
  // Transit and Ground Passenger Transportation
  485: 'bus',
  // Pipeline Transportation
  486: 'pipes',
  // Scenic and Sightseeing Transportation
  487: 'mountain-road',
  // Support Activities for Transportation
  488: 'forklift',
  // Imports
  4883: 'harbor-dock',
  // Postal Service
  491: 'envelope',
  // Couriers and Messengers
  492: 'cardboard-box-closed',
  // Warehousing and Storage
  493: 'warehouse',
  // Movies
  5121: 'clapperboard',
  // Music
  5122: 'musical-notes',
  // Publishing Industries
  513: 'book-pile',
  // Newspaper, Periodical, Book, and Directory Publishers
  5131: 'newspaper',
  // Software
  5132: 'cloud-download',
  // TV & Radio
  5161: 'old-microphone',
  // Data Centers
  5182: 'server-rack',
  // Credit Cards
  5222: 'wallet',
  // Stocks & Bonds
  5231: 'chart',
  // Stock Exchanges
  5232: 'charging-bull',
  // Investment Funds
  5239: 'piggy-bank',
  // Advertising
  5418: 'megaphone',
  // Waste Management and Remediation Services
  562: 'recycle',
  // Trash
  5621: 'trash-can',
  // Landfill Waste
  5622: 'bulldozer',
  // Recycling
  5629: 'recycle',
  // Sports Teams
  7112: 'american-football-helmet',
  // Theme Parks
  7131: 'carousel',
  // Tourism: not a NAICS industry; the towns store gives it to every large town
  9999: 'photo-camera'
}

/**
 * The URL of a commodity's icon, or of the plain crate when it has none.
 * @param {number|string} industryCode - The commodity's NAICS industry code
 * @returns {string} URL of the icon's SVG
 */
export function commodityIconUrl(industryCode) {
  return iconUrls[commodityIconNames[industryCode]] ?? iconUrls[FALLBACK_ICON]
}

/** Width and height of a commodity icon on the map, in px */
export const COMMODITY_ICON_SIZE = 18

/**
 * How far from a town's center its commodity icons sit: just clear of the
 * town's dot, with a 2px gap between dot and icon. A town with too many
 * commodities to fit around its dot that way gets a wider ring, so the icons
 * never overlap each other. The industry assignment holds every town to
 * three things, its Tourism included; the ring still widens should a town
 * ever have more.
 * @param {number} dotSize - Width of the town's dot icon, in px
 * @param {number} count - How many icons go around it
 * @returns {number} Distance from the dot's center to each icon's center, in px
 */
export function iconRingRadius(dotSize, count) {
  const snug = dotSize / 2 + COMMODITY_ICON_SIZE / 2 + 2
  if (count < 2) return snug
  // Neighbors are 180° / (count - 1) apart around the ring. A chord across
  // that angle has to be an icon wide plus a 2px gap, which also leaves room
  // for the offsets being rounded to whole pixels.
  const halfStep = Math.PI / (2 * (count - 1))
  const spread = (COMMODITY_ICON_SIZE + 2) / (2 * Math.sin(halfStep))
  return Math.max(snug, spread)
}

/**
 * Where to put a town's commodity icons around its dot on the map, as pixel
 * offsets from the dot's center (x to the right, y downward, as on screen).
 *
 * The icons fan out over the top half of a circle, from the left of the dot
 * over the top to its right, evenly spaced; a single icon sits straight
 * above. The bottom half is left clear because the town's name hangs below
 * the dot.
 *
 * @param {number} count - How many icons the town has
 * @param {number} radius - Distance from the dot's center to each icon's center, in px
 * @returns {Array<{x: number, y: number}>} One offset per icon, left to right
 */
export function iconRingOffsets(count, radius) {
  return Array.from({ length: count }, (_, i) => {
    // Angle from straight up, clockwise: -90° is due left, 90° due right
    const degrees = count === 1 ? 0 : -90 + (180 * i) / (count - 1)
    const radians = (degrees * Math.PI) / 180
    // Rounded to whole pixels so the icons sit crisply. `+ 0` turns the -0
    // that rounding gives for icons level with the dot into a plain 0.
    return {
      x: Math.round(radius * Math.sin(radians)) + 0,
      y: Math.round(-radius * Math.cos(radians)) + 0
    }
  })
}
