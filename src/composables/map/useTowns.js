import { ref, onUnmounted } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

export function useTowns() {
  const townsLayer = ref(null)

  const addTownsToMap = (map, towns) => {
    if (!map || !map.value) {
      // Check if map is available and initialized
      console.error('Map instance is not available')
      return
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

        return marker
      }
    }).addTo(map.value)

    // Zoom to the extent of the points
    const bounds = L.latLngBounds(
      geojson.features.map((feature) => {
        return [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]
      })
    )

    map.value.fitBounds(bounds, {
      padding: [20, 20]
    })
  }

  const getIconUrl = (size) => {
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

  const getIconSize = (size) => {
    switch (size) {
      case 'small':
        return 20
      case 'medium':
        return 30
      case 'large':
        return 40
      default:
        return 20
    }
  }

  onUnmounted(() => {
    if (townsLayer.value) {
      townsLayer.value.clearLayers()
    }
  })

  return {
    townsLayer,
    addTownsToMap
  }
}
