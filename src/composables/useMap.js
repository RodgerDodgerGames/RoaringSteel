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

    // Paths to your icons
    const iconPaths = {
      'small-town-icon': new URL('@/assets/icons/towns/small.png', import.meta.url).href,
      'medium-town-icon': new URL('@/assets/icons/towns/medium.png', import.meta.url).href,
      'large-town-icon': new URL('@/assets/icons/towns/large.png', import.meta.url).href
    }

    console.log('Resolved icon paths:', iconPaths)

    // Add the towns source
    map.addSource('towns', {
      type: 'geojson',
      data: geojson
    })

    // Add the towns layer after the images are loaded
    map.addLayer({
      id: 'towns-layer',
      type: 'symbol',
      source: 'towns',
      layout: {
        'text-field': ['get', 'name'], // Use the 'name' property for labels
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'], // Let MapLibre adjust the label position
        'text-radial-offset': getIconSize(['get', 'size']) / 13, // Offset the label from the marker
        'text-justify': 'auto', // Automatically justify text
        'text-size': getIconSize(['get', 'size']) / 1.4
      },
      paint: {
        'text-color': '#000',
        'text-halo-color': '#fff',
        'text-halo-width': 2
      }
    })

    // Add markers to map
    geojson.features.forEach((marker) => {
      // Create a DOM element for the marker
      const el = document.createElement('div')
      el.className = 'marker'
      el.style.backgroundImage = `url(${getIconUrl(marker.properties.size)})`

      // Set the size of the marker based on the town size
      const size = getIconSize(marker.properties.size)
      el.style.width = `${size}px`
      el.style.height = `${size}px`
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
      (bounds, coord) => bounds.extend(coord),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    )

    map.fitBounds(bounds, {
      padding: 20
    })
  }

  return {
    addTownsToMap
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
