// CostLayer

// Creates a track cost (suitability) layer
// of Leaflet LatLng Bounds

// Some functionality borrowed from Leaflet.Grid
// https://github.com/jieter/Leaflet.Grid

CostLayer = L.Class.extend({
    options : {
        gridSize : 30,
        // Redraw on move or moveend
        redraw: 'move'
    },

    initialize : function(map, options) {
        this._map = map;
        this._grid = [];
        this._gridSize = this.options.gridSize;
    },

    enable : function(point) {
        this._startingPoint = point;
        var grid = this.redraw();
        this._map.on('viewreset '+ this.options.redraw, function () {
            grid.redraw();
        });
        this.enabled = true;
    },

    disable: function() {
        // remove layer listeners and elements
        this._map.off('viewreset '+ this.options.redraw, this.map);
        this._grid = [];
        this.enabled = false;
    },

    // create the grid
    redraw : function() {
        // get grid size based on screen/geog pixel ratio

        // get map bounds
        var mapLimits = this._getLimits(),
            startingPoint = this._startingPoint;

        // create gridwork
        this._grid = this._generateGrid(startingPoint, mapLimits);
        // update grid with cost values
    },

    _getLimits : function() {
        var mapBounds = this._map.getBounds().pad(0.5);
        return {
            top : this._map.latLngToLayerPoint(mapBounds.getNorth()).y,
            bottom : this._map.latLngToLayerPoint(mapBounds.getSouth()).y,
            left : this._map.latLngToLayerPoint(mapBounds.getWest()).x,
            right : this._map.latLngToLayerPoint(mapBounds.getEast()).x,
        };
    },

    _generateGrid : function(startingPoint, limits) {
        var quads = ['NE', 'SE'],
            grid = [];
        quads.forEach( function(quad) {
            grid.push(this._generateGridForQuad(startingPoint, limits, quad));
        }, this);
        return grid;
    },

    _generateGridForQuad : function(startingPoint, limits, quad) {
        var grid = [],
            topLeft,
            bottomRight;

        // check which quadrant is getting created
        // SE +-
        if (quad == 'SE') {
            // set intial values
            topLeft = startingPoint;
            bottomRight = [
                topLeft.x + this._gridSize,
                topLeft.y - this._gridSize
            ];

            // moving left to right (x-axis)
            while(bottomRight.x < limits.right ) {
                // moving top to bottom (y-axis)
                while( bottomRight.y > limits.bottom) {
                    grid.push( {
                            coords : [topLeft, bottomRight]
                        } );
                    topLeft.y -= this._gridSize;
                    bottomRight.y -= this._gridSize;
                }
                // shift column over
                topLeft.x += this._gridSize;
                bottomRight.x += this._gridSize;
            }
        }

        // NE ++
        if (quad == 'NE') {
            // set intial values
            topLeft = [
                startingPoint.y + this._gridSize,
                startingPoint.x
            ];
            bottomRight = [
                startingPoint.x + this._gridSize,
                startingPoint.y
            ];

            // moving left to right (x-axis)
            while(bottomRight.x < limits.right ) {
                // moving top to bottom (y-axis)
                while( bottomRight.y < limits.top) {
                    grid.push( {
                            coords : [topLeft, bottomRight]
                        } );
                    topLeft.y += this._gridSize;
                    bottomRight.y += this._gridSize;
                }
                // shift column over
                topLeft.x += this._gridSize;
                bottomRight.x += this._gridSize;
            }
        }

        return grid;
    },

    // _createBox : function(topLeft, bottomRight)

});