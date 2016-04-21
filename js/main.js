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
                zoom: 14
            });
            // trackLayer = new L.TrackLayer(map);
            // load layers
            loadLayers(map);

            // add measure control
            L.Control.measureControl().addTo(map);

    });
    // end doc ready function

    // load map layers
    function loadLayers(map) {
        // towns layer dynamic
        // L.esri.dynamicMapLayer({
        //   url: "http://services.nationalmap.gov/arcgis/rest/services/geonames/MapServer",
        //   layers: [4],
        //   opacity: 1
        // }).addTo(map);
        // towns feature layer
        L.esri.featureLayer({
            url: 'http://services.nationalmap.gov/arcgis/rest/services/geonames/MapServer/4',
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


    }

})();

