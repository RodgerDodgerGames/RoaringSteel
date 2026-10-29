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

/**
 * The color each NLCD class is drawn in, as [red, green, blue].
 *
 * Land cover comes down as pictures of the map (see useLandCoverAPI.js), so a
 * pixel's color is the only way to tell which class it is. These are the
 * colors of the published NLCD legend. The MRLC server draws in a palette a
 * few shades off these — each channel within 4 of the legend in a sampled
 * Massachusetts pull — so a pixel is matched to the nearest legend color
 * rather than an exact one.
 */
export const nlcdLegendColors = {
  11: [70, 107, 159], // Open Water
  12: [209, 222, 248], // Perennial Ice/Snow
  21: [222, 197, 197], // Developed, Open Space
  22: [217, 146, 130], // Developed, Low Intensity
  23: [235, 0, 0], // Developed, Medium Intensity
  24: [171, 0, 0], // Developed, High Intensity
  31: [179, 172, 159], // Barren Land (Rock/Sand/Clay)
  41: [104, 171, 95], // Deciduous Forest
  42: [28, 95, 44], // Evergreen Forest
  43: [181, 197, 143], // Mixed Forest
  52: [204, 184, 121], // Shrub/Scrub
  71: [223, 223, 194], // Grassland/Herbaceous
  81: [220, 217, 57], // Pasture/Hay
  82: [171, 108, 40], // Cultivated Crops
  90: [184, 217, 235], // Woody Wetlands
  95: [108, 159, 184] // Emergent Herbaceous Wetlands
}
