/*
 * Leaflet.draw assumes that you have already included the Leaflet library.
 */

L.drawVersion = '0.3.0-dev';

L.drawLocal = {
    draw: {
        toolbar: {
            // #TODO: this should be reorganized where actions are nested in actions
            // ex: actions.undo  or actions.cancel
            actions: {
                title: 'Cancel drawing',
                text: 'Cancel'
            },
            finish: {
                title: 'Finish drawing',
                text: 'Finish'
            },
            undo: {
                title: 'Delete last point drawn',
                text: 'Delete last point'
            },
            buttons: {
                polyline: 'Draw a polyline',
                polygon: 'Draw a polygon',
                rectangle: 'Draw a rectangle',
                circle: 'Draw a circle',
                marker: 'Draw a marker'
            }
        },
        handlers: {
            circle: {
                tooltip: {
                    start: 'Click and drag to draw circle.'
                },
                radius: 'Radius'
            },
            marker: {
                tooltip: {
                    start: 'Click map to place marker.'
                }
            },
            polygon: {
                tooltip: {
                    start: 'Click to start drawing shape.',
                    cont: 'Click to continue drawing shape.',
                    end: 'Click first point to close this shape.'
                }
            },
            polyline: {
                error: '<strong>Error:</strong> shape edges cannot cross!',
                tooltip: {
                    start: 'Click to start drawing line.',
                    cont: 'Click to continue drawing line.',
                    end: 'Click last point to finish line.'
                }
            },
            rectangle: {
                tooltip: {
                    start: 'Click and drag to draw rectangle.'
                }
            },
            simpleshape: {
                tooltip: {
                    end: 'Release mouse to finish drawing.'
                }
            }
        }
    },
    edit: {
        toolbar: {
            actions: {
                save: {
                    title: 'Save changes.',
                    text: 'Save'
                },
                cancel: {
                    title: 'Cancel editing, discards all changes.',
                    text: 'Cancel'
                }
            },
            buttons: {
                edit: 'Edit layers.',
                editDisabled: 'No layers to edit.',
                remove: 'Delete layers.',
                removeDisabled: 'No layers to delete.'
            }
        },
        handlers: {
            edit: {
                tooltip: {
                    text: 'Drag handles, or marker to edit feature.',
                    subtext: 'Click cancel to undo changes.'
                }
            },
            remove: {
                tooltip: {
                    text: 'Click on a feature to remove'
                }
            }
        }
    }
};

L.Draw = {};

L.Draw.Feature = L.Handler.extend({
    includes: L.Mixin.Events,

    initialize: function (map, options) {
        this._map = map;
        this._container = map._container;
        this._overlayPane = map._panes.overlayPane;
        this._popupPane = map._panes.popupPane;

        // Merge default shapeOptions options with custom shapeOptions
        if (options && options.shapeOptions) {
            options.shapeOptions = L.Util.extend({}, this.options.shapeOptions, options.shapeOptions);
        }
        L.setOptions(this, options);
    },

    enable: function () {
        if (this._enabled) { return; }

        L.Handler.prototype.enable.call(this);

        this.fire('enabled', { handler: this.type });

        this._map.fire('draw:drawstart', { layerType: this.type });
    },

    disable: function () {
        if (!this._enabled) { return; }

        L.Handler.prototype.disable.call(this);

        this._map.fire('draw:drawstop', { layerType: this.type });

        this.fire('disabled', { handler: this.type });
    },

    addHooks: function () {
        var map = this._map;

        if (map) {
            L.DomUtil.disableTextSelection();

            map.getContainer().focus();

            this._tooltip = new L.Tooltip(this._map);

            L.DomEvent.on(this._container, 'keyup', this._cancelDrawing, this);
        }
    },

    removeHooks: function () {
        if (this._map) {
            L.DomUtil.enableTextSelection();

            this._tooltip.dispose();
            this._tooltip = null;

            L.DomEvent.off(this._container, 'keyup', this._cancelDrawing, this);
        }
    },

    setOptions: function (options) {
        L.setOptions(this, options);
    },

    _fireCreatedEvent: function (layer) {
        this._map.fire('draw:created', { layer: layer, layerType: this.type });
    },

    // Cancel drawing when the escape key is pressed
    _cancelDrawing: function (e) {
        if (e.keyCode === 27) {
            this.disable();
        }
    }
});