L.Polyline.Measure = L.Draw.Polyline.extend({
    options : {
        trackCostMessage: '$%cost%',
        // minimum distance (in meters) before cost of track is found
        minFindCostDistance: 500
    },

    includes: {
        _checkPoints : [],
    },
    addHooks: function() {
        L.Draw.Polyline.prototype.addHooks.call(this);
        if (this._map) {
            this._markerGroup = new L.LayerGroup();
            this._map.addLayer(this._markerGroup);

            this._markers = [];
            this._map.on('click', this._onClick, this);
            this._startShape();
            this._TrackLayer = this.options.trackLayer;
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

    _getTrackCostText: function(value) {
        var labelText;
            // distanceStr;
        if (this._markers.length === 0) {
            labelText = {
                text: L.drawLocal.draw.handlers.polyline.tooltip.start
            };
        } else {
            // distanceStr = this._getMeasurementString();
            labelText = {
                text: this.options.trackCostMessage.replace('%cost%', numberWithCommas(Math.round(value))),
                // subtext: distanceStr
            };
        }
        return labelText;

        // format string as currency
        // http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
        function numberWithCommas(x) {
            return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    },

    _onCursorMove: function() {
        if (this._enabled && this._markers.length) {
            var currentLatLng = this._currentLatLng,
                previousLatLng = this._markers[this._markers.length - 1].getLatLng(),

                // calculate the distance from the last fixed point to the mouse position
                distance = currentLatLng.distanceTo(previousLatLng);

            // console.log('distance', distance);

            // create array of check points
            // this._createCheckPoints();
            // console.log('check points', this._checkPoints);
            if (this._checkPoints.length > 0 && distance > 500) {
                console.log('number of points', this._checkPoints.length);
                var trackLength = this._currentLatLng.distanceTo(this._markers[this._markers.length - 1].getLatLng());
                this._TrackLayer.calcTrackCost(this._checkPoints, trackLength, this._updateTooltipText.bind(this));
            }
        }
    },

    _updateTooltipText : function(value) {
        console.log('cost of track',value);
        this._tooltip.updateContent(this._getTrackCostText(value));
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

        // create new track layer
        this.options.handler.trackLayer = new TrackLayer(map, {
            costLayers : this.options.costLayers
        });
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
