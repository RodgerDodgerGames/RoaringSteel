import { ref } from 'vue'
import L from 'leaflet'

export function useMap() {
  const townsLayer = ref(null) // Use ref to store the layer reference reactively

  function addTownsToMap(map, towns) {
    // Remove existing towns layer if it exists
    if (townsLayer.value) {
      map.removeLayer(townsLayer.value)
    }

    const geojson = {
      type: 'FeatureCollection',
      features: towns.map((town) => {
        const { lon, lat, ...properties } = town
        return {
          type: 'Feature',
          properties: properties,
          geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          }
        }
      })
    }

    console.log('GeoJSON data prepared:', geojson)

    // Add markers to map using Leaflet's L.geoJSON
    townsLayer.value = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const size = feature.properties.size
        const icon = L.icon({
          iconUrl: getIconUrl(size),
          iconSize: [getIconSize(size), getIconSize(size)],
          className: 'marker'
        })

        const marker = L.marker(latlng, { icon: icon })

        // Bind a tooltip to display the town's name
        marker.bindTooltip(feature.properties.name, {
          permanent: false, // Make the tooltip always visible
          direction: 'top', // Position the tooltip above the marker
          offset: [0, -getIconSize(size) / 2] // Offset so it appears above the marker
        })

        // Add a click event for each marker
        marker.on('click', () => {
          window.alert(feature.properties.name)
        })

        return marker
      }
    }).addTo(map)

    // Zoom to the extent of the points
    const bounds = L.latLngBounds(
      geojson.features.map((feature) => {
        return [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]
      })
    )

    map.fitBounds(bounds, {
      padding: [20, 20]
    })
  }

  return {
    addTownsToMap,
    townsLayer // Return the ref if you need to track it in other components
  }
}

function getIconUrl(size) {
  switch (size) {
    case 'small':
      return new URL('@/assets/icons/towns/small.png', import.meta.url).href
    case 'medium':
      return new URL('@/assets/icons/towns/medium.png', import.meta.url).href
    case 'large':
      return new URL('@/assets/icons/towns/large.png', import.meta.url).href
    default:
      return new URL('@/assets/icons/towns/small.png', import.meta.url).href
  }
}

function getIconSize(size) {
  switch (size) {
    case 'small':
      return 16
    case 'medium':
      return 24
    case 'large':
      return 32
    default:
      return 16
  }
}
