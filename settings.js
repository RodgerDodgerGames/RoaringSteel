// settings, ie. config file

var settings = {
    costLayers : {
        landCover : {
            url : "https://raster.nationalmap.gov/arcgis/rest/services/LandCover/USGS_EROS_LandCover_NLCD/MapServer",
            layerID : 6,
            title : "Land Cover",
            valueType : 'distinct',
            costField : 'Pixel Value',
            valueMap: {
                // water
                "[11,12]" : 999,
                // developed
                "[21,22,23,24]" : 50,
                // barren
                "[31]" : 2,
                // forest
                "[41,42,43]" : 25,
                // shrubland
                "[51,52]" : 4,
                // herbaceous
                "[71,72,73,74]" : 3,
                // cultivated
                "[81,82]" : 15,
                // wetlands
                "[90,95]" : 35,
            }
        },
        slope : {
            url : "https://landfire.cr.usgs.gov/arcgis/rest/services/Landfire/US_other/MapServer",
            layerID : 16,
            title : "Slope",
            valueType : 'scale',
            costField : 'Pixel Value',
            valueMap: {
                type : d3.scaleLinear(),
                domain : [0,90],
                range : [1,1000]
            }
        }
    }
};

