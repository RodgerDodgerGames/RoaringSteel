// data.js

// storing data from map application

var db = {

    mapOptions : {
        center : [39.073348, -108.572076],
        zoom : 12
    },

    //-----------------------------------------------------------
    // TILE LAYERS
    tileLayers : [
        // Stamen Terrain Background
        {
            url : 'http://stamen-tiles-{s}.a.ssl.fastly.net/terrain-background/{z}/{x}/{y}.{ext}',
            options : {
                attribution : 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                subdomains: 'abcd',
                minZoom: 4,
                maxZoom: 18,
                ext: 'png',
                bounds: [[22, -132], [70, -56]]
            }
        },

        // Stamen Toner Labels
        {
            url : 'http://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.{ext}',
            options : {
                attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                subdomains: 'abcd',
                minZoom: 0,
                maxZoom: 20,
                ext: 'png'
            }
        }
    ],  // end tileLayers


    //----------------------------------------------------
    // DISPLAY LAYERS
    displayLayers : [
        // bts? populated places
        {
            options : {
                url: 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0',
                useCors: false,
                pointToLayer: function (geojson, latlng) {
                  return L.marker(latlng, {
                    icon: L.icon({
                      iconUrl: 'images/town.png',
                      iconSize: [36, 36],
                      iconAnchor: [18, 18],
                      // popupAnchor: [0, -11],
                    })
                  });
                }
            }
        }
    ],

    //----------------------------------------------------
    // COST LAYERS
    costLayers = [
        {
            options: {
                url: 'http://raster.nationalmap.gov/arcgis/rest/services/LandCover/USGS_EROS_LandCover_NLCD/MapServer',
                layers:[4],
                opacity: 0.5,
                useCors: true
            },
            display : true,
            classificationMap :
        }
    ]




};