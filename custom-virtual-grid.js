// custom LatLngBounds (cell)
var CostCell = L.Rectangle.extend({
    options: {
        style: {
            color: '#3ac1f0',
            weight: 2,
            opacity: 0.5,
            fillOpacity: 0.25
        }
    },

    initialize: function(bounds, options) {
        // set options; there are no options
        options = L.setOptions(this, options);
        this._bounds = bounds;
        // find center
        this._center = this._bounds.getCenter();
    },

    onAdd: function(map) {

        // set value for cell
        this._setValue();
    },

    // run identify request for layer
    _identify: function(layer) {
        L.esri.identifyFeatures({
            url: layer.url
        })
        .on(map)
        .at(this._center)
        .layers('all:#'.replace('#', layer.layerID))
        .returnGeometry(false)
        .run(function(error, featureCollection, response){
            return featureCollection.features[0].properties['NLCD_2011'];
        });
    },

    // query layers for value at cell center
    // use esri leaflet api to simplify http request
    _queryLayers: function() {
        // loop through cost layers
        for (var costLayer in settings.costLayers) {
            var raw, adjusted;
            if (settings.costLayers.hasOwnProperty(costLayer)) {
                // raw  = '';
                this._identify(settings.costLayers[costLayer]);
            }
        }
    },

    // set the value for this cell
    _setValue: function() {

        // query layers to get layer's value at cell center
        this._rawValues = this._queryLayers();
    },


});

// make a new VirtualGrid
var DebugGrid = VirtualGrid.extend({
    options: {
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
        this.rects[this.coordsToKey(coords)] = new CostCell(bounds, this.options.pathStyle).addTo(map);
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
