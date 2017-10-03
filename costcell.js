// custom LatLngBounds (cell)
L.Rectangle.CostCell = L.Rectangle.extend({
    options: {
        style: {
            color: '#fff',
            // weight: 2,
            stroke: false,
            opacity: 0.5,
            fillOpacity: 0.25
        },
        // colorRange: {
        //     '0:5' : '#15FF59',
        //     '6:10' : '#53FF7F',
        //     '7:25' : '#98FFA6',
        //     '26:50' : '#E8FFDE',
        //     '51:Infinity' : '#FFCAD2'
        // }
        colorRange: d3.scaleSequential(d3.interpolateViridis)
            .domain([0, 45])
    },

    initialize: function(bounds, options) {
        // set options; there are no options
        // options = L.setOptions(this, options);
        L.Rectangle.prototype.initialize.call(this, bounds, options);
        this._startTime = performance.now();
        this._initCount = 0;

        // find center
        this._center = this._bounds.getCenter();
        this._dollarValue = 0;
        // console.log('center', this._center);

        this._queryLayers();

        // add listener for only showing layer below a certain zoom level
        map.on('zoomend ', function(e) {
            if (map.getZoom() > 15) {
                this.addTo(map);
                this._addDebugCostMarker();
            } else if (map.getZoom() <= 15) {
                this.removeFrom(map);
                this._removeDebugCostMarker();
            }
        }.bind(this));
    },

    // onAdd: function(map) {
    //     // set value for cell
    //     L.Rectangle.prototype.onAdd.call(this, map);
    // },

    // run identify request for layer
    _identify: function(layer, callback) {
        L.esri.identifyFeatures({
                url: layer.url
            })
            .on(map)
            .at(this._center)
            .layers('all:#'.replace('#', layer.layerID))
            .returnGeometry(false)
            .run(function(error, results) {
                if (error !== undefined || results === undefined) {
                    console.log(error);
                    return false;
                }
                // console.log('results', results);
                callback(layer, parseInt(results.features[0].properties[layer.costField]));
            });
    },

    // query layers for value at cell center
    // use esri leaflet api to simplify http request
    _queryLayers: function() {
        // loop through cost layers
        for (var costLayer in settings.costLayers) {
            if (settings.costLayers.hasOwnProperty(costLayer)) {
                // send identify request to server
                this._identify(settings.costLayers[costLayer], this._setValue.bind(this));
            }
        }
    },

    // convert raw value to adjusted dollar amount based on dollar value
    // mapping in settings
    // takes costLayer settings object and raw value from identify
    _setValue: function(layer, rawValue) {
        // console.log(layer.title + ' [raw]:', rawValue);
        // check which kind of value map this is
        if (layer.valueType == 'distinct') {
            for (var pixval in layer.valueMap) {
                if (layer.valueMap.hasOwnProperty(pixval)) {
                    // list
                    // convert key to array
                    var pixvalArray = JSON.parse(pixval);
                    // check if pixel value is in value map key
                    if (pixvalArray.indexOf(rawValue) > -1) {
                        this._dollarValue += layer.valueMap[pixval];
                    }
                }
            }
        }
        // scales
        else {
            // create d3 scale according to settings
            var scale = layer.valueMap.type
                .domain(layer.valueMap.domain)
                .range(layer.valueMap.range);
            // interpolate dollar value from scale
            this._dollarValue += scale(rawValue);
        }
        // ranges
        // else if (pixval.indexOf(':') > -1 ) {
        //     // convert key to range
        //     var range = pixval.split(':');
        //     // check if value in range
        //     if (rawValue >= range[0] && rawValue <= range[1]) {
        //         this._dollarValue = layer.valueMap[pixval];
        //     }
        // }
        // d3 scale
        //         else {
        //         }
        //     }
        // }
        // console.log(layer.title + '[dollar]:', this._dollarValue);
        this._setSymbology(this._dollarValue);
        this._initCount += 1;
        if (this._initCount >= Object.keys(settings.costLayers).length) {
            this._endTime = performance.now();
            // console.log('derive cell value time', this._endTime - this._startTime, 'ms');
        }
    },

    _setSymbology: function(dv) {
        // var color,
        //     classif = this.options.colorRange;
        // for (var val in classif) {
        //     if (classif.hasOwnProperty(val)) {
        //         var range = val.split(':');
        //         // check if value in range
        //         if (dv >= range[0] && dv <= range[1]) {
        //             color = classif[val];
        //         }
        //     }
        // }
        var color = this.options.colorRange(dv);
        color = color !== undefined ? color : this.options.style.color;
        // console.log('val', dv, 'color', color);
        this.setStyle({
            color: color
        });
    },

    _addDebugCostMarker: function() {
        var debugIcon = L.divIcon({
            className: 'debug-cost-values-icon',
            html: '$' + this._dollarValue
        });
        if (this._marker) {
            this._marker.setIcon(debugIcon);
        } else {
            this._marker = L.marker(this._center, {
                icon: debugIcon
            }).addTo(map);
        }
    },

    _removeDebugCostMarker: function() {
        if (this._marker) {
            this._marker.removeFrom(map);
            this._marker = null;
        }
    }


});

// L.Rectangle.CostCell.addInitHook(function() {
//         // find center
//         this._center = this._bounds.getCenter();
//         this._dollarValue = 0;
//         // console.log('center', this._center);
// });

// factory
L.rectangle.costcell = function(bounds, options) {
    return new L.Rectangle.CostCell(bounds, options);
};
