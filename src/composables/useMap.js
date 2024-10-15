// src/composables/useMap.js
import maplibregl from 'maplibre-gl'

export function useMap() {
  function addTownsToMap(map, towns) {
    if (map.getSource('towns')) {
      map.removeLayer('towns-layer')
      map.removeSource('towns')
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

    // Add markers to map
    geojson.features.forEach((marker) => {
      // Create a DOM element for the marker
      const el = document.createElement('div')
      el.className = 'marker'
      el.style.backgroundImage = `url(${getIconUrl(marker.properties.size)})`
      el.style.width = '30px'
      el.style.height = '30px'
      el.style.backgroundSize = '100%'

      el.addEventListener('click', () => {
        window.alert(marker.properties.name)
      })

      // Add marker to map
      new maplibregl.Marker({ element: el }).setLngLat(marker.geometry.coordinates).addTo(map)
    })

    // Zoom to the extent of the points
    const coordinates = geojson.features.map((feature) => feature.geometry.coordinates)
    const bounds = coordinates.reduce(
      (bounds, coord) => {
        return bounds.extend(coord)
      },
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    )

    map.fitBounds(bounds, {
      padding: 20
    })
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

  return {
    addTownsToMap
  }
}
