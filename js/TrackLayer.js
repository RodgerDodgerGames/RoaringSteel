// TrackLayer.js

// This class extends L.MeasuringTool

L.TrackLayer = L.Polyline.Measure.extend({
    addHooks: function () {
        L.Draw.Polyline.Measure.prototype.addHooks.call(this);
        if (this._map) {
            this._startLayingTrack();
        }
    },

    // get current distance
    _startLayingTrack: function() {
        this._map
            .on('pointermove', this._onCursorMove, this)
            .on('mousemove', this._onCursorMove, this);
        // console.log('distance', this.__getMeasurementString());
    },

    _onCursorMove: function() {
        var currentLatLng = this._currentLatLng,
            previousLatLng = this._markers[this._markers.length - 1].getLatLng(),
            distance,

            // calculate the distance from the last fixed point to the mouse position
            distance = currentLatLng.distanceTo(previousLatLng);

        console.log('distance', distance);
    }


});

