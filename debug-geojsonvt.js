var baseDataCoords = [
        [48.76343113791796, -86.737060546875],
        [45.01918507438176, -98.272705078125]
    ],
    baseData = new L.polyline(baseDataCoords,{}),
    data = baseData.toGeoJSON(),

    // create geojsonvt
    tileIndex = geojsonvt(data, {
        maxZoom: 14,  // max zoom to preserve detail on
        tolerance: 3, // simplification tolerance (higher means simpler)
        extent: 4096, // tile extent (both width and height)
        buffer: 64,   // tile buffer on each side
        debug: 2,      // logging level (0 to disable, 1 or 2)

        indexMaxZoom: 4,        // max zoom in the initial tile index
        indexMaxPoints: 100000, // max number of points per tile in the index
        solidChildren: false    // whether to include solid tile children in the index
    });



