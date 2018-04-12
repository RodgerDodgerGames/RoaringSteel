// cityCommodity.js

L.CityCommodity = L.Class.extend({

    // initialize city commodities
    initialize : function(townData, options) {

        // set options
        // maybe move this somewhere else later
        this.options = {
            townTooltipOptions : {
                direction: 'center',
                offset: L.point(18,18),
                permanent: true,
                className: 'town-tooltip'
            },
            markerOptions : {
                riseOnHover : true
            }
        };

        // get towns data
        this._allTowns = townData;

        // 1. create town layer
        this.townLayer = this._createTownLayer();


    },

    _createTownLayer : function() {

        // 1. create town feature group
        var townLayer = _createFeatureGroup();

        // 2. classify towns
        _classifyTowns();

        // 3. configure layer
        _configureTownLayer();

        function _createFeatureGroup() {
            var featureGroup = new L.featureGroup();

            // Loop over all towns and create marker for those that are within
            // the map bounds
            for (var i = this._allTowns.length - 1; i >= 0; i--) {
                // create temporary latlng
                var tempLatLng = L.latLng(this._allTowns[i]['LATITUDE'], this._allTowns[i]['LONGITUDE']);
                // check if within map bounds
                if (map.getBounds().contains(tempLatLng)) {
                    featureGroup.addLayer(L.marker(tempLatLng), this.options.markerOptions);
                }
            }
            return featureGroup;
        }

        // 2. Configure layer
        featureGroup.eachLayer( function(layer) {

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

    _classifyTowns : function() {
        // classify towns into small, medium, or large
        // first run based on population/employment
        // then proximity
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
    }

});

// factory
L.cityCommodity = function(options) {
    return new L.CityCommodity(options);
};
