// NLCD config
// htt"ps":/,          // /www.mrlc.gov/nlcd/
// map NLCD classes to cost

export const nlcdCostMap = {
  // Water and Ice/Snow
  11: 9990, // Open Water
  12: 9990, // Perennial Ice/Snow
  // Developed Areas
  21: 350, // Developed, Open Space
  22: 500, // Developed, Low Intensity
  23: 650, // Developed, Medium Intensity
  24: 800, // Developed, High Intensity
  // Barren Land
  31: 30, // Barren Land (Rock/Sand/Clay)
  // Forest
  41: 350, // Deciduous Forest
  42: 350, // Evergreen Forest
  43: 350, // Mixed Forest
  // Shrubland
  52: 100, // Shrub/Scrub
  // Agriculture
  81: 150, // Pasture/Hay
  82: 200, // Cultivated Crops
  // Grasslands
  71: 70, // Grassland/Herbaceous
  // Wetlands
  90: 500, // Woody Wetlands
  95: 450 // Emergent Herbaceous Wetlands
}
