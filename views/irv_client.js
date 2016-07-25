
// MIT license - Michael Vaganov, 2016
(function(globals) {
///////////////////////////////////////////////////////////////////////////////
var IRV_EX; // exhausted ballot token

/**
 * client-side visualization
 * @param serialized json describing an IRV bloc diagram
 * @param x offset
 * @param y offset
 * @param width how wide to make the image
 * @param height how tall to make the image (will auto-calc if -1)
 * @param graphicOutput what DOM element to put the graphic into
 */
var IRV_deserializeVisualizationBlocData = function (serialized, x, y, width, height, graphicOutput) {
  var deserialized;
  if(typeof serialized === 'string') {
    eval("deserialized ="+serialized); // TODO safer javascript evaluation?
  } else { deserialized = serialized; }
  IRV_EX = deserialized.candidates[0];
  deserialized.colorMap = {};
  for(var i=0;i<deserialized.candidates.length;++i) {
    deserialized.colorMap[deserialized.candidates[i]] = deserialized.colors[i];
  }
  IRV_convertVisualizationBlocIds(deserialized.data, deserialized.candidates);
  if(height < 0) height = deserialized.data.length*30;
  IRV_createVisualizationView(deserialized.data, deserialized.colorMap, deserialized.numVotes, 
    0, 0, width, height, graphicOutput);
};

/**
 * client-side visualization
 * filter the visualization bloc object data. allows size reduction
 * @param allVisBlocsStates
 * @param conversionTable if not null, used to replace ids with an alternate value
 * @param out_conversionMade if not null, counts how many times any id was replaced
 */
var IRV_convertVisualizationBlocIds = function (allVisBlocsStates, conversionTable, out_conversionsMade) {
  for(var s=0;s<allVisBlocsStates.length;++s) {
    var state = allVisBlocsStates[s];
    for(var b=0;b<state.length;++b){
      var bloc = state[b];
      if(out_conversionsMade) {out_conversionsMade[bloc.C] = (out_conversionsMade[bloc.C])?(out_conversionsMade[bloc.C]+1):1;}
      if(conversionTable) {bloc.C = conversionTable[bloc.C];}
      var nextList = bloc.n;
      if(nextList) {
        for(var n=0;n<nextList.length;++n) {
          var nextEntry = nextList[n];
          if(out_conversionsMade) {out_conversionsMade[nextEntry.D] = (out_conversionsMade[nextEntry.D])?(out_conversionsMade[nextEntry.D]+1):1;}
          if(conversionTable) {nextEntry.D = conversionTable[nextEntry.D];}
        }
      }
    }
  }
};

/**
 * client-side visualization
 * @param visBlocs bloc visualization data, as calculated by IRV_calculateVisualizationModel
 * @param color table for candidates
 * @param countBallots how many total ballots are in the system
 * @param x x-offset of image
 * @param y y-offset of image
 * @param width size of output graphic
 * @param height size of output graphic
 * @param destinationForGraphic where in the DOM to add the output graphic
 * @param out_components {labels:{},blocs:[],transitions:[]} (optional) put drawn two.js components someplace for easy access
 */
var IRV_createVisualizationView = function(visBlocs, colorMap, countBallots, x, y, width, height, destinationForGraphic, out_components) {
  if(!destinationForGraphic) destinationForGraphic = document.body;
  if(typeof destinationForGraphic === 'string') destinationForGraphic = document.getElementById(destinationForGraphic);
  if(!destinationForGraphic) throw "valid destination object required";
  var two = new Two({ width: width, height: height }).appendTo(destinationForGraphic);
  var cursorx = x, cursory = y
  var rowHeight = height / visBlocs.length;
  var cursorHeight = rowHeight / 2, cursorWidth = width / countBallots;
  var vSpace = rowHeight - cursorHeight;
  if(out_components) {
    out_components.labels = {};
    out_components.blocs = [];
    out_components.transitions = [];
  }
  var hMargin = 4, hM = 2;
  if(cursorWidth < 4) { hMargin = 0; hM = 0; }
  for(var state=0;state<visBlocs.length;++state) {
    if(out_components) { out_components.blocs.push({}); out_components.transitions.push({}); }
    var hasNext = false;
    for(var b=0;b<visBlocs[state].length;++b) {
      var bloc = visBlocs[state][b];
      if(bloc.C == IRV_EX) continue; // don't draw exhausted ballots
      var diesHere = true;
      if(bloc.n) {
        hasNext = true;
        for(var n=0;n<bloc.n.length;++n) {
          if(bloc.n[n].D == bloc.C) {
            diesHere = false;
            break;
          }
        }
      }
      var rWidth = cursorWidth*bloc.v;
      var r = two.makeRectangle(cursorx+rWidth/2, cursory+cursorHeight/2, rWidth-4, cursorHeight);
      r.fill = "#"+colorMap[bloc.C];
      //r.opacity = 0.5;
      r.noStroke();
      if(out_components) out_components.blocs[state][bloc.C] = r;

      if(diesHere) {
        var align = 'left';
        var xPos = cursorx;
        if(cursorx > width/2) {
          align = 'right';
          xPos = cursorx + rWidth;
        }
        var label = new Two.Text(bloc.C, xPos, cursory+cursorHeight/2);
        label.alignment = align;
        label.stroke = "#000";
        label.linewidth = 3;
        two.add(label);
        var labelW = new Two.Text(bloc.C, xPos, cursory+cursorHeight/2);
        labelW.alignment = align;
        labelW.fill = "#fff";
        two.add(labelW);
        if(out_components) { out_components.labels[bloc.C] = [label, labelW]; }
      }
      cursorx += rWidth;
    }
    var nextY = cursory + rowHeight;
    cursory += cursorHeight;
    if(hasNext) {
      for(var b=0;b<visBlocs[state].length;++b) {
        var bloc = visBlocs[state][b];
        if(bloc.n) {
          for(var n=0;n<bloc.n.length;++n) {
            if(bloc.n[n].D == IRV_EX) { continue; } // don't show shifts to exhaustion.
            var fromMin = x+hM+cursorWidth * bloc.n[n].f;
            var fromMax = x-hM+cursorWidth *(bloc.n[n].f+bloc.n[n].v);
            var toMin = x+hM+cursorWidth * bloc.n[n].t;
            var toMax = x-hM+cursorWidth *(bloc.n[n].t+bloc.n[n].v);
            var curveWeightY = 1, curveWeightX = 3;
            var blarg = Math.abs(bloc.n[n].f-bloc.n[n].t);//hMargin;
            if(blarg > hMargin) blarg = hMargin;
            var curve = two.makePath(
              fromMin, cursory,
              fromMin, cursory,
              fromMin+curveWeightX, cursory+curveWeightY,
              (fromMin*2+toMin)/3+curveWeightX*2, (cursory*2+nextY)/3-blarg,
              // (fromMin+toMin)/2+curveWeightX*2, (cursory+nextY)/2,
              (fromMin+toMin*2)/3+curveWeightX*2, (cursory+nextY*2)/3-blarg,
              toMin+curveWeightX, nextY-curveWeightY,
              toMin, nextY, toMin, nextY,
              toMax, nextY,
              toMax, nextY,
              toMax-curveWeightX, nextY-curveWeightY,
              (fromMax+toMax*2)/3-curveWeightX*2, (cursory+nextY*2)/3+blarg,
              // (fromMax+toMax)/2-curveWeightX*2, (cursory+nextY)/2,
              (fromMax*2+toMax)/3-curveWeightX*2, (cursory*2+nextY)/3+blarg,
              fromMax-curveWeightX, cursory+curveWeightY,
              fromMax, cursory, fromMax, cursory,
              true);
            curve.fill = "#"+colorMap[bloc.n[n].D];
            curve.noStroke();
            curve.opacity = 0.75;
            if(out_components) out_components.transitions[state][bloc.n[n].D] = curve;
          }
        }
      }
    }
    cursory = nextY;
    cursorx = x;
  }
  two.update();
};
///////////////////////////////////////////////////////////////////////////////
  if (typeof define !== 'undefined' && define.amd) { define([], function () { return IRV_deserializeVisualizationBlocData; }); // RequireJS
  } else if (typeof module !== 'undefined' && module.exports) { module.exports = IRV_deserializeVisualizationBlocData; // CommonJS
  } else { globals.IRV_deserializeVisualizationBlocData = IRV_deserializeVisualizationBlocData; // <script>
  }
})(this);