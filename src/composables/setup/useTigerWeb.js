export default async function getMSALatLon(cbsaCode) {
  const baseUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer/{layerID}/query`
  const layerIDs = [3, 4]
  const params = new URLSearchParams({
    where: `CBSA='${cbsaCode}'`,
    outFields: 'INTPTLON,INTPTLAT',
    f: 'json',
    returnGeometry: false
  })

  try {
    let result = null

    for (const layerID of layerIDs) {
      const url = `${baseUrl.replace('{layerID}', layerID)}/query?${params.toString()}`
      const response = await fetch(url)

      if (response.ok) {
        const data = await response.json()

        if (data.features && data.features.length > 0) {
          const feature = data.features[0]
          const centroidLongitude = feature.attributes.INTPTLON
          const centroidLatitude = feature.attributes.INTPTLAT
          result = {
            centroidLongitude,
            centroidLatitude
          }
          break
        }
      } else {
        throw new Error(`Error: ${response.status} ${response.statusText}`)
      }
    }

    if (result) {
      return result
    } else {
      return false
    }
  } catch (error) {
    console.error('An error occurred:', error)
    return false
  }
}
