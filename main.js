

        // var Stamen_TerrainBackground = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain-background/{z}/{x}/{y}.{ext}', {
        //     attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        //     subdomains: 'abcd',
        //     minZoom: 0,
        //     maxZoom: 18,
        //     ext: 'png'
        // }),
        // Stamen_TonerLabels = L.tileLayer('http://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.{ext}', {
        //     attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        //     subdomains: 'abcd',
        //     minZoom: 0,
        //     maxZoom: 20,
        //     ext: 'png'
        // }),

        var Esri_NatGeoWorldMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC',
            maxZoom: 16
        }),



        map = new L.Map('map', {
            layers: [Esri_NatGeoWorldMap],
            center: new L.LatLng(46.92260021203586, -92.50556945800781),
            zoom: 14
        }),
        // load layers
        costLayers = loadLayers(map),

        // add virtual grid layer
        debugGrid = new DebugGrid().addTo(map);



    // load map layers
    function loadLayers(map) {
        var layers = [];
        // towns layer dynamic
        // L.esri.dynamicMapLayer({
        //   url: "https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer",
        //   layers: [0],
        //   opacity: 1
        // }).addTo(map);

        // towns icon
        var townIcon = L.icon({
                        iconUrl: 'town.png',
                        iconSize: [36, 36],
                        iconAnchor: [18, 18],
                        // popupAnchor: [0, -11],
                    });
        var townTooltipOptions = {
            direction: 'center',
            offset: L.point(18,18),
            permanent: true,
            className: 'town-tooltip'
        };

        // towns feature layer
        L.esri.featureLayer({
            url: 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0',
            useCors: false,
            pointToLayer: function(geojson, latlng) {
                return L.marker(latlng, {
                    icon: townIcon
                }).bindTooltip( function(layer) {
                    return layer.feature.properties['NAME'];
                }, townTooltipOptions);
            },
        }).addTo(map);

        // land cover raster
        // var landCover = L.esri.dynamicMapLayer({
        //     url: 'http://raster.nationalmap.gov/arcgis/rest/services/LandCover/USGS_EROS_LandCover_NLCD/MapServer',
        //     layers: [6],
        //     opacity: 0.5,
        //     useCors: false
        // }).addTo(map);

        // layers.push(landCover);

        return layers;


    }

