L.Polyline.Measure = L.Draw.Polyline.extend({
    statics: {
        trackCostMessage: '$%cost%'
    },

    includes: {
        _checkPoints : []
    },
    addHooks: function() {
        L.Draw.Polyline.prototype.addHooks.call(this);
        if (this._map) {
            this._markerGroup = new L.LayerGroup();
            this._map.addLayer(this._markerGroup);

            this._markers = [];
            this._map.on('click', this._onClick, this);
            this._startShape();
            this._costLayers = this.options.costLayers;
        }
    },

    removeHooks: function () {
        L.Draw.Polyline.prototype.removeHooks.call(this);

        this._clearHideErrorTimeout();

        //!\ Still useful when control is disabled before any drawing (refactor needed?)
        this._map
            .off('pointermove', this._onMouseMove, this)
            .off('mousemove', this._onMouseMove, this)
            .off('click', this._onClick, this);

        this._clearGuides();
        this._container.style.cursor = '';

        this._removeShape();
    },

    _getTooltipText: function(value) {
        var labelText,
            distanceStr;
        if (this._markers.length === 0) {
            labelText = {
                text: L.drawLocal.draw.handlers.polyline.tooltip.start
            };
        } else {
            distanceStr = showLength ? this._getMeasurementString() : '';
            labelText = {
                text: this.statics.trackCostMessage.replace('%cost%', Math.round(value, 2)),
                subtext: distanceStr
            };
        }
        return labelText;
    },

    _onCursorMove: function() {
        if (this.enabled && this._markers.length) {
            var currentLatLng = this._currentLatLng,
                previousLatLng = this._markers[this._markers.length - 1].getLatLng(),

                // calculate the distance from the last fixed point to the mouse position
                distance = currentLatLng.distanceTo(previousLatLng);

            // console.log('distance', distance);

            // create array of check points
            // this._createCheckPoints();
            // console.log('check points', this._checkPoints);
            if (this._checkPoints.length > 1) {
                var trackLength = this._currentLatLng.distanceTo(this._markers[this._markers.length - 1].getLatLng());
                this._calcTrackCost(this._checkPoints, trackLength);
            }
        }
    },

    // calculate the cost of laying track for current mouse position
    _calcTrackCost: function(ptArray, trackLength) {
        // aggregate cost
        var ptValueSum = 0;
        // loop through points
        ptArray.forEach( function(pt) {
            this._getPtCost(pt, handleCost);
        }, this);

        function handleCost (cost) {
            ptValueSum += cost;
            var trackCost = ptValueSum * trackLength;
            console.log('cost of track',trackCost);
            this._getTooltipText(trackCost);
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

    _startShape: function() {
        this._drawing = true;
        this._poly = new L.Polyline([], this.options.shapeOptions);
        //this is added as a placeholder, if leaflet doesn't recieve this when the tool is turned off all onclick events are removed
        this._poly._onClick = function() {};

        this._container.style.cursor = 'crosshair';

        this._updateTooltip();
        this._map
            .on('pointermove', this._onMouseMove, this)
            .on('mousemove', this._onMouseMove, this)
            .on('pointermove', this._onCursorMove, this)
            .on('mousemove', this._onCursorMove, this);
    },

    _finishShape: function () {
        this._drawing = false;

        this._cleanUpShape();
        this._clearGuides();

        this._updateTooltip();

        this._map
            .off('pointermove', this._onMouseMove, this)
            .off('mousemove', this._onMouseMove, this);

        this._container.style.cursor = '';
    },

    _removeShape: function() {
        if (!this._poly)
            return;
        this._map.removeLayer(this._poly);
        delete this._poly;
        this._markers.splice(0);
        this._markerGroup.clearLayers();
    },

    _onClick: function(e) {
        if (!this._drawing) {
            this._removeShape();
            this._startShape();
            return;
        }
    },

    _getTooltipText: function() {
        var labelText = L.Draw.Polyline.prototype._getTooltipText.call(this);
        if (!this._drawing) {
            labelText.text = '';
        }
        return labelText;
    }
});

L.Control.MeasureControl = L.Control.extend({

    statics: {
        TITLE: 'Measure distances'
    },
    options: {
        position: 'topleft',
        handler: {}
    },

    toggle: function() {
        if (this.handler.enabled()) {
            this.handler.disable.call(this.handler);
        } else {
            this.handler.enable.call(this.handler);
        }
    },

    onAdd: function(map) {
        var className = 'leaflet-control-draw';

        this._container = L.DomUtil.create('div', 'leaflet-bar');

        this.options.handler.costLayers = this.options.costLayers;
        this.handler = new L.Polyline.Measure(map, this.options.handler);

        this.handler.on('enabled', function () {
            this.enabled = true;
            L.DomUtil.addClass(this._container, 'enabled');
        }, this);

        this.handler.on('disabled', function () {
            delete this.enabled;
            L.DomUtil.removeClass(this._container, 'enabled');
        }, this);

        var link = L.DomUtil.create('a', className+'-measure', this._container);
        link.href = '#';
        link.title = L.Control.MeasureControl.TITLE;

        L.DomEvent
            .addListener(link, 'click', L.DomEvent.stopPropagation)
            .addListener(link, 'click', L.DomEvent.preventDefault)
            .addListener(link, 'click', this.toggle, this);

        return this._container;
    }
});


L.Map.mergeOptions({
    measureControl: false
});


L.Map.addInitHook(function () {
    if (this.options.measureControl) {
        this.measureControl = L.Control.measureControl().addTo(this);
    }
});


L.Control.measureControl = function (options) {
    return new L.Control.MeasureControl(options);
};
