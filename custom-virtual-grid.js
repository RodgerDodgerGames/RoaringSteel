// make a new VirtualGrid
var DebugGrid = VirtualGrid.extend({
    options: {
        // cellSize: 153.45,
        cellSize: 15.345,
        pathStyle: {
            color: '#3ac1f0',
            weight: 2,
            opacity: 0.5,
            fillOpacity: 0.25
        }
    },

    initialize: function(options) {
        L.Util.setOptions(this, options);
        this.rects = {};
    },

    createCell: function(bounds, coords) {
        // console.log('cell size', bounds.getSouthWest().distanceTo(bounds.getNorthWest()));
        // this.rects[this.coordsToKey(coords)] = L.rectangle(bounds, this.options.pathStyle).addTo(map);
        this.rects[this.coordsToKey(coords)] = L.rectangle.costcell(bounds,this.options.pathStyle).addTo(map);
    },

    cellEnter: function(bounds, coords) {
        var rect = this.rects[this.coordsToKey(coords)];
        map.addLayer(rect);
    },

    cellLeave: function(bounds, coords) {
        var rect = this.rects[this.coordsToKey(coords)];
        map.removeLayer(rect);
    },

    coordsToKey: function(coords) {
        return coords.x + ':' + coords.y + ':' + coords.z;
    }
});
