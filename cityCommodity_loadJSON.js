// cityCommodity.js

L.CityCommodity = L.FeatureGroup.extend({

    // set options
    // maybe move this somewhere else later
    options : {
        townTooltipOptions : {
            direction: 'center',
            offset: L.point(18,18),
            permanent: true,
            className: 'town-tooltip'
        },
        markerOptions : {
            riseOnHover : true
        },
        townData : undefined
    },

    // initialize city commodities
    initialize : function(options) {

        // initialize options
        L.setOptions(this, options);


        L.FeatureGroup.prototype.initialize.call(this, options);
    },

// Adding parent functions
    onAdd: function(map) {
        L.FeatureGroup.prototype.onAdd.call(this, map);
    },

    onRemove: function(map) {
        L.FeatureGroup.prototype.onRemove.call(this, map);
    },

    addLayer: function (layer) {
        L.LayerGroup.prototype.addLayer.call(this, layer);
    },

    removeLayer: function (layer) {
        L.LayerGroup.prototype.removeLayer.call(this, layer);
    },

    _createTownLayer : function() {

        // 1. add markers to feature group
        _createFeatureGroup.call(this);

        // 2. classify towns
        _classifyTowns.call(this);

        // 3. configure layer
        _configureTownLayer.call(this);


        // add layers that intersect the map to feature group
        function _createFeatureGroup() {
            // var featureGroup = new L.featureGroup();

            // Loop over all towns and create marker for those that are within
            // the map bounds
            for (var i = this._allTowns.length - 1; i >= 0; i--) {
                // create temporary latlng
                var tempLatLng = L.latLng(this._allTowns[i]['LATITUDE'], this._allTowns[i]['LONGITUDE']);
                // check if within map bounds
                if (map.getBounds().contains(tempLatLng)) {
                    console.log(this._allTowns[i].NAME, this._allTowns[i].STATE_FIPS, tempLatLng);
                    var marker = L.marker(tempLatLng, this.options.markerOptions);
                    marker.properties = this._allTowns[i];
                    console.log(marker);
                    this.addLayer(marker);
                }
            }
        }

        function _classifyTowns() {
            // reduce towns to array of total employment and population
            var popArray = this.getLayers().map( function(layer) {
                return parseFloat(layer.properties.POP_2010) +
                    layer.properties.industry.total;
            });
            // sort array smallest to largest for use with d3.quantile
            popArray = popArray.sort(d3.ascending);

            // assign category to towns
            // run through d3.quantiles
            // small < 0.75 > medium < 0.9 > large
            this.eachLayer( function(layer) {
                var popEmp = parseFloat(layer.properties.POP_2010) +
                    layer.properties.industry.total;

                // small
                if (popEmp < d3.quantile(popArray, 0.75)) {
                    layer._category = 'small';
                }

                // medium
                else if (popEmp >= d3.quantile(popArray, 0.75) && popEmp < d3.quantile(popArray, 0.9)) {
                    layer._category = 'medium';
                }

                // large
                else {
                    layer._category = 'large';
                }
            });

            //TODO -  now make sure they have a roughly even distribution

        }


        // 2. Configure layer
        function _configureTownLayer() {
            var townTooltipOptions = this.options.townTooltipOptions;
            this.eachLayer( function(layer) {

                // small, medium, large
                var iconSize = {
                    'small' : 16,
                    'medium' : 24,
                    'large' : 30
                    }[layer._category];
                    // towns icon
                var townIcon = L.icon({
                    iconUrl: 'town.png',
                    iconSize: [iconSize, iconSize],
                    iconAnchor: [iconSize/2, iconSize/2],
                    // popupAnchor: [0, -11],
                });
                layer
                    .setIcon(townIcon)
                    .bindTooltip(function(layer) {
                        return layer.properties['NAME'];
                    }, townTooltipOptions)
                    .openTooltip()
                    .setOpacity(1);
            });
        }
    }

});

L.FeatureGroup.addInitHook(function() {
    // get towns data
    this._allTowns = this.options.townData;

    // 1. create town layer
    this._createTownLayer();

});

// factory
L.cityCommodity = function(options) {
    return new L.CityCommodity(options);
};
