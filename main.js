
window.onload = init;
var map, townsLayer, cities;
function init() {
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
        });



        map = new L.Map('map', {
            layers: [Esri_NatGeoWorldMap],
            center: new L.LatLng(46.92260021203586, -92.50556945800781),
            zoom: 6
        });
        // load layers
        // costLayers = loadLayers(map),

        // load towns layer

        townFields = [
            // "ANSICODE",
            "COUNTY",
            "COUNTYFIPS",
            "FEATURE",
            "FEATURE2",
            // "GNIS_ID",
            // "LATITUDE",
            // "LONGITUDE",
            "NAME",
            "OBJECTID",
            "POP_2010",
            "STATE",
            "STATE_FIPS"
        ],

// https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0/query?returnGeometry=true&where=1%3D1&outSr=4326&outFields=COUNTY%2CCOUNTYFIPS%2CFEATURE%2CFEATURE2%2CNAME%2COBJECTID%2CPOP_2010%2CSTATE%2CSTATE_FIPS&inSr=4326&geometry=%7B%22xmin%22%3A-101.25%2C%22ymin%22%3A48.922499263758255%2C%22xmax%22%3A-90%2C%22ymax%22%3A55.7765730186677%2C%22spatialReference%22%3A%7B%22wkid%22%3A4326%7D%7D&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&geometryPrecision=1&f=geojson
        // towns feature layer

        // load towns as snapshot
        // ref: https://esri.github.io/esri-leaflet/examples/feature-layer-snapshot.html
        // grab the towns within the map bounds
        townsURL = 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0';
        L.esri.query({
          url: townsURL,
          useCors: false
        })
            .within(map.getBounds())
            .fields(townFields)
            .precision(2)
            .run(function(error, townFeatures){
                townsLayer = L.geoJSON.cityCommodity(townFeatures, {
                    pointToLayer: function(geojson, latlng) {
                        return L.marker(latlng, {
                            opacity: 0
                        });
                    }
                })
                .addTo(map);
            });
        // townsLayer = new L.esri.featureLayer.cityCommodity({
        //     url: 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0',
        //     fields: townFields,
        //     useCors: false,
        //     precision: 1,
        //     pointToLayer: function(geojson, latlng) {
        //         return L.marker(latlng, {
        //             opacity: 0
        //         });
        //     },
        //     // pointToLayer: function(geojson, latlng) {
        //     //     return L.marker(latlng, {
        //     //         icon: townIcon
        //     //     }).bindTooltip( function(layer) {
        //     //         return layer.feature.properties['NAME'];
        //     //     }, townTooltipOptions);
        //     // },
        // })
        //     .addTo(map);
            // .on('load', function() {
            //     // initialize city commodities
            //     cities = new cityCommodity();
            // });


        // add virtual grid layer
        // debugGrid = new DebugGrid().addTo(map);

        // add custom L.Grid layer
        // debugGrid = new L.gridLayer.debugCoords().addTo(map);

        // baseDataBounds = [
        //     [48.76343113791796, -86.737060546875],
        //     [45.01918507438176, -98.272705078125]
        // ],
        // baseData = new L.rectangle(baseDataBounds,{}).addTo(map),
        // data = baseData.toGeoJSON(),

        // // create geojsonvt
        // tileIndex = geojsonvt(data, {
        //     maxZoom: 14,  // max zoom to preserve detail on
        //     tolerance: 3, // simplification tolerance (higher means simpler)
        //     extent: 4096, // tile extent (both width and height)
        //     buffer: 64,   // tile buffer on each side
        //     debug: 2,      // logging level (0 to disable, 1 or 2)

        //     indexMaxZoom: 4,        // max zoom in the initial tile index
        //     indexMaxPoints: 100000, // max number of points per tile in the index
        //     solidChildren: false    // whether to include solid tile children in the index
        // });

        // nestedGridTest = new L.rectangle.nestedGrid(map.getBounds(), {
        //     desiredSize : settings.desiredCellSize
        // });

        // map.fitBounds(baseData.getBounds());

        // theTooltip = new L.tooltip(
        //     {
        //         permanent : true,
        //         sticky : true
        //     })
        //     .setTooltipContent('nothing yet...');
            // .openTooltip(map.getCenter())
            // .addTo(map);




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
        },

        // towns feature layer
        townsLayer = L.esri.featureLayer({
            url: 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0',
            useCors: false,
            // pointToLayer: function(geojson, latlng) {
            //     return L.marker(latlng, {
            //         icon: townIcon
            //     }).bindTooltip( function(layer) {
            //         return layer.feature.properties['NAME'];
            //     }, townTooltipOptions);
            // },
        })
            .addTo(map);

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
}
