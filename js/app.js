var width = 960,
  height = 500;

var svg = d3.select("#map").append("svg")
  .attr("width", width)
  .attr("height", height);

var g = svg.append("g");

// produce a range of points
var x = d3.range(42,50,1);
var y = d3.range(-88,-96,-1);
var features = x.map( function(d, i) {
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [d,y[i]]
      }
    };
  });

var basePoints = {
  type: "FeatureCollection",
  features: features
};

var projection = d3.geoAlbers()
  // .translate([width/2, height/2])
  // .center([46,-92]);
  // .scale([1000]);    // translate to center of screen;
  .fitSize([width, height], basePoints);
var geopath = d3.geoPath(projection);
var active = d3.select(null);
var quadtree;
var qtreeExent = [
  // [44,89],
  // [48,96]
  [0,0],
  [500,500]
];

// add points to map
g.selectAll('path')
  .data(basePoints.features)
  .enter().append('path')
    .attr('class', 'point')
    .attr('d', geopath);

var svgPoints = basePoints.features.map( function(d) {
  return geopath.centroid(d);
});

quadtree = d3.quadtree()
  .addAll(svgPoints);


g.selectAll(".node")
  .data(nodes(quadtree))
  .enter().append("rect")
  .attr("class", "node")
  .attr("x", function(d) { return d.x; })
  .attr("y", function(d) { return d.y; })
  .attr("width", function(d) { return d.width; })
  .attr("height", function(d) { return d.height; });

// Collapse the quadtree into an array of rectangles.
function nodes(quadtree) {
  var nodes = [];
  quadtree.visit(function(node, x1, y1, x2, y2) {
    nodes.push({x: x1, y: y1, width: x2 - x1, height: y2 - y1});
    if (!node.length) {
      console.log(node);
    }
  });
  return nodes;
}

// // Find the nodes within the specified rectangle.
// function search(quadtree, x0, y0, x3, y3) {
//   var validData = [];
//   quadtree.visit(function(node, x1, y1, x2, y2) {
//     var p = node.point;
//     if (p) {
//       p.selected = (p[0] >= x0) && (p[0] < x3) && (p[1] >= y0) && (p[1] < y3);
//       if (p.selected) {
//         validData.push(p);
//       }
//     }
//     return x1 >= x3 || y1 >= y3 || x2 < x0 || y2 < y0;
//   });
//   return validData;
// }

// var clusterPoints = [];
// var clusterRange = 45;

// for (var x = 0; x <= width; x += clusterRange) {
//   for (var y = 0; y <= height; y+= clusterRange) {
//     var searched = search(quadtree, x, y, x + clusterRange, y + clusterRange);

//     var centerPoint = searched.reduce(function(prev, current) {
//       return [prev[0] + current[0], prev[1] + current[1]];
//     }, [0, 0]);

//     centerPoint[0] = centerPoint[0] / searched.length;
//     centerPoint[1] = centerPoint[1] / searched.length;
//     centerPoint.push(searched);

//     if (centerPoint[0] && centerPoint[1]) {
//       clusterPoints.push(centerPoint);
//     }
//   }
// }

// g.selectAll(".centerPoint")
//   .data(clusterPoints)
//   .enter().append("circle")
//   .attr("class", function(d) {return "centerPoint"})
//   .attr("cx", function(d) {return d[0];})
//   .attr("cy", function(d) {return d[1];})
//   .attr("fill", '#FFA500')
//   .attr("r", 6)
//   .on("click", function(d, i) {
//     console.log(d);
//   });
