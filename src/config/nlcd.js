// NLCD config
// htt"ps":/,          // /www.mrlc.gov/nlcd/
// map NLCD classes to cost

export const nlcdCostMap = {
  // Water and Ice/Snow
  11: 999, // Open Water
  12: 999, // Perennial Ice/Snow
  // Developed Areas
  21: 35, // Developed, Open Space
  22: 50, // Developed, Low Intensity
  23: 65, // Developed, Medium Intensity
  24: 80, // Developed, High Intensity
  // Barren Land
  31: 3, // Barren Land (Rock/Sand/Clay)
  // Forest
  41: 35, // Deciduous Forest
  42: 35, // Evergreen Forest
  43: 35, // Mixed Forest
  // Shrubland
  52: 10, // Shrub/Scrub
  // Agriculture
  81: 15, // Pasture/Hay
  82: 20, // Cultivated Crops
  // Grasslands
  71: 7, // Grassland/Herbaceous
  // Wetlands
  90: 50, // Woody Wetlands
  95: 45 // Emergent Herbaceous Wetlands
}
