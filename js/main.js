(function() {
    $(function(){
        var Stamen_TerrainBackground = L.tileLayer('http://stamen-tiles-{s}.a.ssl.fastly.net/terrain-background/{z}/{x}/{y}.{ext}', {
                attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                subdomains: 'abcd',
                minZoom: 4,
                maxZoom: 18,
                ext: 'png',
                bounds: [[22, -132], [70, -56]]
            }),
            Stamen_TonerLabels = L.tileLayer('http://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.{ext}', {
                attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                subdomains: 'abcd',
                minZoom: 0,
                maxZoom: 20,
                ext: 'png'
            }),

            map = new L.Map('map', {
                layers: [Stamen_TerrainBackground, Stamen_TonerLabels],
                center: new L.LatLng(39.073348, -108.572076),
                zoom: 12
            }),
            // load layers
            costLayers = loadLayers(map);

            // trackLayer = new L.TrackLayer(map,{
            //     costLayers : costLayers
            // });

            // add measure control
            L.Control.measureControl({
                costLayers : costLayers
            }).addTo(map);

    });
    // end doc ready function

    // load map layers
    function loadLayers(map) {
        layers = [];
        // towns layer dynamic
        // L.esri.dynamicMapLayer({
        //   url: "https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer",
        //   layers: [0],
        //   opacity: 1
        // }).addTo(map);
        // towns feature layer
        L.esri.featureLayer({
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
            },
          }).addTo(map);

        // land cover raster
        var landCover = L.esri.dynamicMapLayer({
          url: 'http://raster.nationalmap.gov/arcgis/rest/services/LandCover/USGS_EROS_LandCover_NLCD/MapServer',
          layers:[6],
          opacity: 0.5,
          useCors: true
        }).addTo(map);

        layers.push(landCover);

        return layers;


    }

})();

