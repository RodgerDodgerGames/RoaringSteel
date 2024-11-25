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
      features: towns.value.map((town) => {
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
        marker.bindTooltip(feature.properties.name.split('-')[0], {
          permanent: true, // Make the tooltip always visible
          direction: 'center',
          className: 'town-tooltip',
          offset: [0, 20]
        })

        // Add a click event handler to display town information
        marker.on('click', () => {
          // popup options
          const options = {
            className: 'town-popup'
          }
          // industry content
          const indContent =
            feature.properties.industries.length > 0
              ? feature.properties.industries
                  .map((industry) => `<li>${industry.name}</li>`)
                  .join('')
              : '<li>None</li>'
          const townInfo = `<div class="has-text-centered mb-3">
      <div class="title is-4 has-text-dark mb-2">${feature.properties.name}</div>
      <span class="has-text-grey-dark">Size: ${feature.properties.size}</span></div>
      <ul>Industries:${indContent}</ul>
      `
          L.popup(options).setLatLng(latlng).setContent(townInfo).openOn(map.value)
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
        return 24
      case 'medium':
        return 28
      case 'large':
        return 32
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
