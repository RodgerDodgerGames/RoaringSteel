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
        this.options = options;
        this._map = map;
        this._grid = [];
        this._gridSize = this.options.gridSize;
        this._costLayers = this.options.costLayers;
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
        this._addCostToGrid(this._grid);
    },

    _getLimits : function() {
        var mapBounds = this._map.getBounds().pad(0.5),
            northEast = this._map.latLngToLayerPoint(mapBounds.getNorthEast()),
            southWest = this._map.latLngToLayerPoint(mapBounds.getSouthWest());
        return {
            top : northEast.y,
            bottom : southWest.y,
            left : southWest.x,
            right : northEast.x,
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
            cellSize = this._gridSize,
            topLeft,
            bottomRight;

        // check which quadrant is getting created
        // SE +-
        if (quad == 'SE') {
            // set intial values
            topLeft = startingPoint;
            bottomRight = [
                topLeft.x + cellSize,
                topLeft.y - cellSize
            ];

            // moving left to right (x-axis)
            while(bottomRight.x < limits.right ) {
                // moving top to bottom (y-axis)
                while( bottomRight.y > limits.bottom) {
                    grid.push( {
                            coords : [topLeft, bottomRight]
                        } );
                    topLeft.y -= cellSize;
                    bottomRight.y -= cellSize;
                }
                // shift column over
                topLeft.x += cellSize;
                bottomRight.x += cellSize;
                // shift back up to the top
                topLeft.y = startingPoint.y;
                bottomRight.y = startingPoint.y + cellSize;
            }
        }

        // NE ++
        if (quad == 'NE') {
            // set intial values
            topLeft = [
                startingPoint.y + cellSize,
                startingPoint.x
            ];
            bottomRight = [
                startingPoint.x + cellSize,
                startingPoint.y
            ];

            // moving left to right (x-axis)
            while(bottomRight.x < limits.right ) {
                // moving top to bottom (y-axis)
                while( topLeft.y < limits.top) {
                    grid.push( {
                            coords : [topLeft, bottomRight]
                        } );
                    topLeft.y += cellSize;
                    bottomRight.y += cellSize;
                }
                // shift column over
                topLeft.x += cellSize;
                bottomRight.x += cellSize;
                // shift back up to the top
                topLeft.y = startingPoint.y + cellSize;
                bottomRight.y = startingPoint.y;
            }
        }

        return grid;
    },

    // add classified track cost to each grid cell
    _addCostToGrid : function(grid) {

        // loop through grid cells
        gridCells.forEach( function(cell) {
            // get cell center
            cell.centerPt = _getCenterPoint(cell);
            // calculate cost
            _getPtCost(cell);
        });


        // get cost of center point for grid cell
        function _getPtCost(cell) {
            // loop through cost layers
            this._costLayers
            var pixelValue;
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

        // get grid cell center points
        function _getCenterPoint(cell) {
            return L.bounds(cell.coords).getCenter();
        }
    }

    // _createBox : function(topLeft, bottomRight)

});