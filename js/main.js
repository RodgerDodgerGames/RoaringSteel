var Stamen_TerrainBackground = L.tileLayer('http://stamen-tiles-{s}.a.ssl.fastly.net/terrain-background/{z}/{x}/{y}.{ext}', {
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        minZoom: 4,
        maxZoom: 18,
        ext: 'png',
        bounds: [[22, -132], [70, -56]]
    }),
    Stamen_TonerLabels = L.tileLayer('http://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.{ext}', {
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        minZoom: 0,
        maxZoom: 20,
        ext: 'png'
    }),

    map = new L.Map('map', {
        layers: [Stamen_TerrainBackground, Stamen_TonerLabels],
        center: new L.LatLng(38.221863, -104.780391),
        zoom: 10
    });
//map.addControl(new L.Control.Scale());

/*******************Start measuring button***************/
var measuringTool;
var optionsMeasureLabel = {
    minWidth: 50,
    autoPan: false,
    closeButton: false,
    className: 'measuring-label'
};

// $('#measuring-tool').click(function() {
//     if ($(this).hasClass('active')) {
//         $(this).removeClass('active');
//         if (measuringTool) {
//             measuringTool.disable();
//         }
//     } else {
//         // only 1 option can be active
//         $('.btn.btn-primary.active').click();

//         $(this).addClass('active');
//         if (!measuringTool) {
//             measuringTool = new L.MeasuringTool(map);
//         }
//         measuringTool.enable();
//     }
// });

// /*******************Different drag icons***************/
// var mtDrag, dragIconStart, dragIconEnd;
// var optionsDrag = {
//     lineClassName: 'measuring-line-not-doted'
// };

// $('#mt-drag-icons').click(function() {
//     if ($(this).hasClass('active')) {
//         $(this).removeClass('active');
//         if (mtDrag) {
//             mtDrag.disable();
//         }
//     } else {
//         // only 1 option can be active
//         $('.btn.btn-primary.active').click();

//         $(this).addClass('active');
//         if (!mtDrag) {
//             dragIconStart = new L.Icon({ iconUrl: 'http://leaflet.cloudmade.com/docs/images/leaf-orange.png'});

//             dragIconEnd = new L.Icon({ iconUrl: 'http://leaflet.cloudmade.com/docs/images/leaf-green.png'});
//             mtDrag = new L.MeasuringTool(map, optionsDrag, dragIconStart, dragIconEnd);
//         }
//         mtDrag.enable();
//     }
// });


/*******************Different tooltip look***************/
var mtTooltip;
var optionsTooltip = {
    displayTotalDistance: false,
    displayPartialDistance: true,
    className: 'measuring-label-tooltip',
    lineClassName: 'measuring-line-for-look'
};

// $('#mt-tt-look').click(function() {
//     if ($(this).hasClass('active')) {
//         $(this).removeClass('active');
//         if (mtTooltip) {
//             mtTooltip.disable();
//         }
//     } else {
//         // only 1 option can be active
//         $('.btn.btn-primary.active').click();

//         $(this).addClass('active');
        if (!mtTooltip) {
            mtTooltip = new L.MeasuringTool(map, optionsTooltip);
        }
        mtTooltip.enable();
    // }
// });