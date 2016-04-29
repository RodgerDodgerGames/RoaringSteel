// TrackLayer.js

// This class calculates the cost of track being laid

TrackLayer = L.Class.extend({
    initialize: function (map, options) {
        this._map = map;
        this._costLayers = options.costLayers;
    },

    // calculate the cost of laying track for current mouse position
    calcTrackCost: function(ptArray, trackLength, callback) {
        // aggregate cost
        var ptValueSum = 0;
        // loop through points
        ptArray.forEach( function(pt) {
            this._getPtCost(pt, handleCost);
        }, this);

        function handleCost (cost) {
            ptValueSum += cost;
            var trackCost = ptValueSum * trackLength;
            // console.log('cost of track',trackCost);
            callback(trackCost);
        }
    },

    // get cost of point
    _getPtCost: function(pt, callback) {
        var pixelValue,
            classedValue;
        this._costLayers[0]
            .identify()
            .on(this._map)
            .at(pt)
            .layers('4')
            .returnGeometry(false)
            .run(function(error, results){
                // console.log('results', results);
                // console.log('error', error);
                pixelValue = results.features[0].properties["Pixel Value"];
                callback(classify(parseInt(pixelValue)));
            });

        function classify(value) {
            // water
            if( [11,12].indexOf(value) > -1) return 999;
            // developed
            else if( [21,22,23,24].indexOf(value) > -1) return 50;
            // barren
            else if( value == 31) return 2;
            // forest
            else if( [41,42,43].indexOf(value) > -1) return 25;
            // shrubland
            else if( [51,52].indexOf(value) > -1) return 4;
            // herbaceous
            else if( [71,72,73,74].indexOf(value) > -1) return 3;
            // cultivated
            else if( [81,82].indexOf(value) > -1) return 15;
            // wetlands
            else if( [90,91].indexOf(value) > -1) return 35;
        }
    },


});

