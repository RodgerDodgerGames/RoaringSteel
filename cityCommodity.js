// cityCommodity.js

var CityCommodity = L.Class.extend({



    // initialize city commodities
    initialize : function() {

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
        this._getTownsLayerLists();

        // second, compare with the census geographies
        this._townCensusIntersect();

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
    _townCensusIntersect : function() {
        this._townsInter = [];
        // loop through ansicode list
        for (var n=0; n<this.townNames.length; n++) {
            // loop through census geogs
            for (var g=0; g<this._geographies.length; g++) {
                // check for match
                if (this._geographies[g].label.indexOf(this.townNames[n]) > -1) {
                    this._townsInter.push(this.townNames[n]);
                }
            }
        }
        console.log(this._townsInter);
    },

    // get town data into lists
    _getTownsLayerLists : function() {
        this.townNames = [];
        this._townCounties = [];
        this._townStates = [];
        // first get list of ansicodes, counties, and states
        townsLayer.eachActiveFeature( function(layer) {
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

        // once we have the tables run the rest of init
        this._restOfInit();
    }

});

// factory
function cityCommodity() {
    return new CityCommodity();
}