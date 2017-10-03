L.Rectangle.NestedGrid = L.Rectangle.extend({

    options: {
        desiredCellSize: settings.desiredCellSize
    },

    initialize: function(bounds, options) {
        var start = performance.now();
        // console.log('options', options);

        // set options and call parent initialize
        L.setOptions(this, options);
        L.Rectangle.prototype.initialize.call(this, bounds, options);

        // initialize variables
        this._parent = options.parent !== undefined ? options.parent : null;
        this._desiredCellSize = options.desiredCellSize !== undefined ? options.desiredCellSize : settings.desiredCellSize;

        // initialize nested grid
        this._initGrid();

        // setup listeners
        map.on('mousemove', this._mousemove.bind(this));

        console.log(Math.round(this._size), 'init time:', performance.now() - start, 'ms');
    },

    // onAdd: function(map) {
    //     L.Rectangle.prototype.onAdd.call(this, map);
    // },

    _initGrid: function() {

        // set size
        this._size = this._getSize();

        // set children
        this._children = [];


        var childSize = this._bounds.getNorthWest().distanceTo(this._bounds.getNorthEast());
        // console.log('child size:', childSize, 'desiredCellSize:', this._desiredCellSize);

        // check if procreation is needed
        if (childSize >= this._desiredCellSize) {
            // console.log('children', this._children);
            this._setChildren(false);
        }
        // otherwise calculate cell values
        else {
            this._setChildren(true);
        }

    },

    _setChildren: function(createCostCells) {
        // console.log('create cost cells?', createCostCells);
        // check if children are to be costcells or more nested grids
        if (createCostCells) {
            // create nested grid children
            this._children.push(
                new L.rectangle.costcell([this._bounds.getNorthEast(), this._bounds.getCenter()])
            );
            this._children.push(
                new L.rectangle.costcell([this._bounds.getSouthEast(), this._bounds.getCenter()])
            );
            this._children.push(
                new L.rectangle.costcell([this._bounds.getSouthWest(), this._bounds.getCenter()])
            );
            this._children.push(
                new L.rectangle.costcell([this._bounds.getNorthWest(), this._bounds.getCenter()])
            );
        } else {
            // create nested grid children
            this._children.push(
                new L.rectangle.nestedGrid([this._bounds.getNorthEast(), this._bounds.getCenter()],{
                    parent: this
                })
            );
            this._children.push(
                new L.rectangle.nestedGrid([this._bounds.getSouthEast(), this._bounds.getCenter()],{
                    parent: this
                })
            );
            this._children.push(
                new L.rectangle.nestedGrid([this._bounds.getSouthWest(), this._bounds.getCenter()],{
                    parent: this
                })
            );
            this._children.push(
                new L.rectangle.nestedGrid([this._bounds.getNorthWest(), this._bounds.getCenter()],{
                    parent: this
                })
            );
        }
    },

    // get cell size
    _getSize: function() {
        return this._bounds.getNorthWest().distanceTo(this._bounds.getNorthEast());
    },

    // mouse move handler
    // find cost cell child and display on map
    _mousemove: function(e) {
        // console.log(this._parent);
        // check if this is not a top level grid
        if (this._parent) {
            return false;
        }
        // check if mouse in inside grid
        if (!this._bounds.contains(e.latlng)) {
            return false;
        }

        var currentCost = this._findCostCell(this);
        // console.log('current cost', currentCost);
    },


    // recursively search for cost cell among child cells
    _findCostCell: function(grid) {
        var i,
            currentChild;

        if (grid._dollarValue) {
            return grid._dollarValue;
        } else {
            // Use a for loop instead of forEach to avoid nested functions
            // Otherwise "return" will not work properly
            for (i = 0; i < grid._children.length; i += 1) {
                currentChild = grid._children[i];

                // Search in the current child
                result = this._findCostCell(currentChild);

                // Return the result if the node has been found
                if (result !== false) {
                    return result;
                }
            }

            // The node has not been found and we have no more options
            return false;
        }
    }

});

L.rectangle.nestedGrid = function(bounds, options) {
    return new L.Rectangle.NestedGrid(bounds, options);
};



