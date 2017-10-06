// cityCommodity.js

L.GeoJSON.CityCommodity = L.GeoJSON.extend({

    // initialize city commodities
    initialize : function(options) {

        // census tables to assist with employment queries
        this._industries = [];
        this._geographies = [];
        // var industryListingURL = "https://lehd.ces.census.gov/data/schema/latest/label_industry.csv",
        //     geographyListingURL = "https://lehd.ces.census.gov/data/schema/latest/label_geography.csv";
        // load locally since the census resources were giving me trouble
        this._industryListingURL = "label_industry.csv";
        this._geographyListingURL = "label_geography.csv";
        this._baseurl = "https://api.census.gov/data/timeseries/qwi/sa";
        this._key = "36628d51ad86d97e94ecd9677ce9e0bd46a3e8f3";

        // setup queue for multiple requests
        d3.queue(2)
            // get industries
            .defer(d3.csv, this._industryListingURL)
            // get geographies
            .defer(d3.csv, this._geographyListingURL)
            .awaitAll(this._censusTableUploadHandler.bind(this));

        L.GeoJSON.prototype.initialize.call(this, options);
    },

    onAdd: function(map) {
        L.GeoJSON.prototype.onAdd.call(this, map);
        // this._restOfInit();
    },

    onRemove: function(map) {
        L.GeoJSON.prototype.onRemove.call(this, map)
    },

    _restOfInit : function() {

        /*
        Essentially, we are trying to create a list of towns that intersect
        between the esri towns layer and the census industry layer.
        To begin with, attempt a straight intersect.
        But since there are more towns in the esri data than in the industry
        layer attempt to match towns based on prominence (size, county seat?)
        within the county
        */

        // first, get the town data into lists
        // this._getTownsLayerLists();

        // second, compare with the census geographies
        this._townCensusIntersect.call(this);

        // var urlParams = {
        //         key : key,
        //         get : "EmpTotal,industry",
        //         for : "county:003",
        //         in : "state:27",
        //         time : "2016",
        //         industry : "0000"
        //     },
        //     url = baseurl + L.Util.getParamString(urlParams);

        // var url = "http://api.census.gov/data/timeseries/qwi/sa?get=year&for=state:27&time=2010&key=36628d51ad86d97e94ecd9677ce9e0bd46a3e8f3";
        // var url = "https://api.census.gov/data/timeseries/qwi/sa?get=year,agegrp,quarter&for=county:195&in=state:02&time=2010-Q1";
        // console.log(url);
        // d3.json(url)
        //     .get(getQWIHandler);

        function getQWIHandler(error, results) {
            if (error) throw error;
            console.log(results);
        }

    },

    // find intersection between census geography and towns
    // essentially, cull town layer down to those that we can find
    // industry data for
    // initially just use those towns listed (with geo_level=M)
    // later on consider including county seats if the towns are too sparse
    _townCensusIntersect : function() {
        // TODO: figure out how to do this in one iteration rather than two
        var keep = [];
        // loop through town features
        this.eachLayer( function(layer) {
            // loop through census geogs
            for (var g=0; g<this._geographies.length; g++) {
                // check for correct geo level
                if (this._geographies[g].geo_level != 'M') {
                    continue;
                }

                // split label into city[0] and state[1]
                var labelArray = this._geographies[g].label.split(', ');

                // some towns straddle two states
                var state;
                if (labelArray[1].indexOf('part') > -1) {
                    state = labelArray[1].split(' part')[0].slice(-2);
                } else {
                    state = labelArray[1];
                }

                // keep track of features that match
                if (labelArray[0] == layer.feature.properties.NAME && state == layer.feature.properties.STATE) {
                    console.log(labelArray[0], labelArray[1]);
                    keep.push(layer.feature.properties.OBJECTID);
                    continue;
                }
            }
        }, this);

        // remove everything that doesn't match
        this.eachLayer( function(layer) {
            if (keep.indexOf(layer.feature.properties.OBJECTID) == -1) {
                this.removeLayer(layer);
            }
        }, this);

        // put towns into categories
        this._categorizeTowns();
    },

    // put towns into categories: small, medium, large
    // initially based on population
    // but ensure even distribution
    //  - this is more important for large and medium towns
    _categorizeTowns: function() {
        // reduce towns to array of ID and population
        var popArray = [];
        this.eachLayer( function(layer) {
            popArray.push([
                layer.feature.properties.OBJECTID,
                layer.feature.properties.POP_2010]);
        });

        // use d3 quantiles to categorize towns by population
        var quantiles = d3.scaleQuantile();
        quantiles
            .domain( popArray.map( function(d) { return d[1] }))
            .range(['small', 'medium', 'large']);

        console.log('quantiles', quantiles.quantiles());
        console.log('popArray', popArray);

        // now display towns again with icon based on category
        // this._showTowns();
    },

    _showTowns: function() {
        // towns icon
        var townIcon = L.icon({
                        iconUrl: 'town.png',
                        iconSize: [36, 36],
                        iconAnchor: [18, 18],
                        // popupAnchor: [0, -11],
                    }),
        townTooltipOptions = {
            direction: 'center',
            offset: L.point(18,18),
            permanent: true,
            className: 'town-tooltip'
        };
        this.eachLayer( function(layer) {
            layer.setOpacity(1);
        })
        .bindTooltip( function(layer) {
            return layer.feature.properties['NAME'];
        }, townTooltipOptions);
    },

    // get town data into lists
    _getTownsLayerLists : function() {
        this.townNames = [];
        this._townCounties = [];
        this._townStates = [];
        // first get list of ansicodes, counties, and states
        townsLayer.eachLayer( function(layer) {
            this.townNames.push(layer.feature.properties.NAME);
            this._townCounties.push(layer.feature.properties.COUNTYFIPS);
            this._townStates.push(layer.feature.properties.STATE_FIPS);
        }, this);
    },

    _censusTableUploadHandler : function(error, results) {
        if (error) throw error;
        console.log(results);

        // first result is industry
        this._industries = results[0];
        this._geographies = results[1];

        // once we have the tables
        // wait for the layer to load and then run the rest of the init
        if (map.hasLayer(this)) {
            this._restOfInit();
        } else {
            this.on('add', this._restOfInit);
        }
    }

});

// factory
L.geoJSON.cityCommodity = function(options) {
    return new L.GeoJSON.CityCommodity(options);
};
