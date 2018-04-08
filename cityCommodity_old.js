// cityCommodity.js

L.CityCommodity = L.Class.extend({

    // initialize city commodities
    initialize : function(options) {

        // census tables to assist with employment queries
        this._industries = [];
        this._geographies = [];
        this._data = [];
        // var industryListingURL = "https://lehd.ces.census.gov/data/schema/latest/label_industry.csv",
        //     geographyListingURL = "https://lehd.ces.census.gov/data/schema/latest/label_geography.csv";
        // load locally since the census resources were giving me trouble
        this._industryListingURL = "label_industry.csv";
        this._geographyListingURL = "label_geography.csv";
        this._baseurl = "https://api.census.gov/data/timeseries/qwi/sa?";
        this._key = "36628d51ad86d97e94ecd9677ce9e0bd46a3e8f3";
        this._townsURL = 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0';
        // TODO: 2017 wasn't working for some reason so just use 2016 for now
        // this._year = new Date().getFullYear();
        this._year = '2016';

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

        // compare with the census geographies
        this.data = this._townCensusIntersect.call(this);

        /*
        Next, we need to find the top industries for our culled list of towns.
        We call this here since it may take a while to run and return all
        these requests.
        Top industries are determined based on employment counts and earnings.
        Record the top three for each town since we may need to go to backups; we want to avoid a situation where there is a clump of towns that all supply the same thing.
        called with this._assignIndustry
        */

        /*
        Concurrently, we can categorize the towns.
        This is based on their population.
        Categorize them into small, medium, and large.
        Use d3.quantiles as such small < 0.75 > medium < 0.9 > large
        called with this._categorizeTowns
        */

        /*
        Then, show the town layer.
        Symbolize based on category size.
        called with this._showTowns
        */


    },

    // get populated places dataset based on params
    // :param town: <string> town name
    // :param state: 2-digit FIPS code for state
    // :return: query result
    _getPlace : function(town, state, qwitown, callback) {
        var townFields = [
            // "ANSICODE",
            "COUNTY",
            "COUNTYFIPS",
            // "FEATURE",
            // "FEATURE2",
            // "GNIS_ID",
            // "LATITUDE",
            // "LONGITUDE",
            "NAME",
            "OBJECTID",
            "POP_2010",
            "STATE",
            "STATE_FIPS"
        ];

        L.esri.query({
          url: this._townsURL,
          useCors: false
        })
            .fields(townFields)
            .where(_setWhereClause(town, state))
            .returnGeometry(false)
            .run(function(error, townFeatures){
                if (error) throw error;
                callback(qwitown, townFeatures);
            }, this);

        function _setWhereClause(t, s) {
            return "NAME = '%town%' and STATE_FIPS = '%state%'"
                .replace('%town%', t)
                .replace('%state%', s);
        }
    },


    // handle results from pop places request
    _getPlaceHandler : function(qwitown, results) {
        // check and make sure there's just one result
        if (results.features.length != 1) {
            console.log('no match with', qwitown.label);
            return false;
        }

        // if it matches grab the attributes
        console.log('found match in', qwitown.label);
        var k = results['features'][0]['properties'];
        // add qwi geography
        k['qwiGeography'] = qwitown['geography'].slice(2);

        // then get industry info
        // first, total industry
        // TODO: set this all up as a d3.queue
        // with each request as a defer
        // 1. get place
        // 2. get total industry
        // 3. get top three industries
        var tot = this._getTotalIndustry(k, this._getTotalIndustryHandler);
        console.log(tot);

    },

    // get industry total for town
    _getTotalIndustry : function(town) {
        console.log('total industry for', town.NAME);
        return this._getIndustry(town, ['00'], this._getTotalIndustryHandler);
    },


    _getTotalIndustryHandler: function(results) {
        // return sum of employment for all quarters
        return d3.sum(results, function(d) {
            return d['EmpS'];
        });
    },

    // find intersection between census geography and towns
    // send request for pop place from each QWI geography
    // later on consider including county seats if the towns are too sparse
    _townCensusIntersect : function() {

        // loop through census geogs
        for (var g=0; g<this._geographies.length; g++) {

            // console.log('Working on', this._geographies[g].label, '...');

            // state fips is first two digits of geography
            var state = this._geographies[g].geography.slice(0,2);

            // split up towns to handle multiple
            var qwiTowns = this._geographies[g].label.split(',')[0].split('-');
            // then loop through towns and attempt a match
            for (var t=0; t<qwiTowns.length; t++) {
                // send request to pop places
                this._getPlace(qwiTowns[t], state, this._geographies[g], this._getPlaceHandler.bind(this));
            }
        }



        // return keepers;

        // // assign industries to towns
        // this._assignIndustry(this._key, this._baseurl, this._industryParamList);

        // // put towns into categories
        // this._categorizeTowns();
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
                layer.feature.properties.POP_2010]);
        });

        // assign category to towns
        // run through d3.quantiles
        // small < 0.75 > medium < 0.9 > large
        this.eachLayer( function(layer) {
            var pop = layer.feature.properties.POP_2010;

            // small
            if (pop < d3.quantile(popArray, 0.75)) {
                layer._category = 'small';
            }

            // medium
            else if (pop >= d3.quantile(popArray, 0.75) && pop < d3.quantile(popArray, 0.9)) {
                layer._category = 'medium';
            }

            // large
            else {
                layer._category = 'large';
            }
        });

        // now display towns again with icon based on category
        this._showTowns(popArray);
    },

    // qwi industry request
    // based on town qwi geography, state, and industries to find
    _getIndustry: function(town, industries, callback) {

        var urlParams = {
                key : this._key,
                get : "EmpS",
                for : _setFor(town),
                in : _setIn(town),
                time : this._year,
            },
            url = this._baseurl + _manuallyEncodeParams(urlParams) + '&' + _setIndustryString(industries);
            // url = base + L.Util.getParamString(urlParams) + indParams;

        // https://api.census.gov/data/timeseries/qwi/sa?key=36628d51ad86d97e94ecd9677ce9e0bd46a3e8f3&get=EmpS&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area:10660&in=state:27&time=2016&industry=00
        console.log(url);
        d3.json(url)
            .get( function(error, results) {
                if (error) throw error;
                _censusResultsToObject(results, callback);
            });

        // format census results (array of arrays) into object
        function _censusResultsToObject(results, callback) {
            // grab headers
            var data = [],
                keys = results.shift();

            // loop through data and add to object
            for (var i=0; i<results.length; i++) {
                // convert array to object map with reduce
                var row = results[i].reduce( function(obj, item, idx) {
                    obj[keys[idx]] = item;
                    return obj;
                }, {});
                data.push(row);
            }
            // when finished send off to the callback
            callback(data);
        }

        // manually encode params
        // since the census site was rejected the way these were being encoded
        // the url example above returns a correct result
        function _manuallyEncodeParams(urlParams) {
            var paramList = [];
            var template = '%key%=%val%';
            for (var param in urlParams) {
                if (urlParams.hasOwnProperty(param)) {
                    paramList.push(template
                        .replace('%key%', param)
                        .replace('%val%', urlParams[param])
                    );
                }
            }
            return paramList.join('&');
        }

        // set "for" value for request
        function _setFor(layer) {
            return "metropolitan%20statistical%20area/micropolitan%20statistical%20area:" + town.qwiGeography;
        }

        // set "in" value for request
        function _setIn(layer) {
            return "state:" + town.STATE_FIPS;
        }

        function _setIndustryString(industryList) {
            var indParamList = [],
                template = "industry=%indCode%";
            // loop through industries and add to param string
            for (var i=0; i<industryList.length; i++) {
                indParamList.push(template.replace('%indCode%', industryList[i]));
            }
            return indParamList.join('&');
        }

    },

    // show town icons once all data has been added to layer
    _showTowns: function(popArray) {
        this.eachLayer( function(layer) {
            var townTooltipOptions = {
                direction: 'center',
                offset: L.point(18,18),
                permanent: true,
                className: 'town-tooltip'
            };


            // TODO: create and assign icons based on category
            // small, medium, large
            var iconSize = {
                'small' : 18,
                'medium' : 26,
                'large' : 36
                }[layer._category],
                // towns icon
                townIcon = L.icon({
                    iconUrl: 'town.png',
                    iconSize: [iconSize, iconSize],
                    iconAnchor: [iconSize/2, iconSize/2],
                    // popupAnchor: [0, -11],
                });
            layer
                .setIcon(townIcon)
                .bindTooltip( function(layer) {
                    return layer.feature.properties['NAME'];
                }, townTooltipOptions)
                .openTooltip()
                .setOpacity(1);
        })
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
        // this._geographies = results[1];

        // filter geographies down to micro/metro stat areas
        this._geographies = _filterGeographies(results[1]);

        // once we have the tables
        // wait for the layer to load and then run the rest of the init
        this._restOfInit();

        function _filterGeographies(data) {
            return data.filter( function(geog) {
                // return if metro micro and skip the "non" listings
                return geog.geo_level == 'M' && geog.geography.slice(2) != '99999';
            });
        }
    }

});

// factory
L.cityCommodity = function(options) {
    return new L.CityCommodity(options);
};
