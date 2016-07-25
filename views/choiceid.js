
// MIT license - Michael Vaganov, 2016
(function(globals) {
///////////////////////////////////////////////////////////////////////////////
function truncateText(text, MAX_ID_LENGTH) {
  var chopIndex = text.indexOf('\n');
  if(chopIndex >= 0) { text = text.substring(0, chopIndex); }
  if(text.length > MAX_ID_LENGTH) {
    chopIndex = MAX_ID_LENGTH;
    for(var j=MAX_ID_LENGTH;j>=0;--j) {
      if(' \t\r'.indexOf(text[j]) >= 0) {
        chopIndex = j;
        break;
      }
    }
    text = text.substring(0, chopIndex);
  }
  return text;
}

function getBestNameFrom(listOfHtmlElements) {
  var bestNamePropertyOrder = ["alt", "title", "text", "name", "value", "id", "src", "href", "class", "style", "type"];
  var name = null;
  // console.log("~~~"+JSON.stringify(listOfHtmlElements));
  for(var i=0;i<listOfHtmlElements.length;++i) {
    for(var j=0;j<bestNamePropertyOrder.length;++j){
      var prop = bestNamePropertyOrder[j];
      if(listOfHtmlElements[i][ prop ]) {
        name = listOfHtmlElements[i][ prop ];
        name.trimTokens([" ","\n","\r","\t"]);
      }
      if(name) { break; }
    }
    if(name) { break; }
  }
  return name;
}

function generateIdentifier(inputtext) {
  var choiceHtmlTags = [];
  var text = separateTextAndHtml(inputtext, choiceHtmlTags);
  if(text) {
    var MAX_ID_LENGTH = 32;
    text = truncateText(text, MAX_ID_LENGTH);
  }
  if(!text || text.length == 0) {
    if(choiceHtmlTags && choiceHtmlTags.length) {
      // console.log("TODO: element "+i+" should be named with "+JSON.stringify(htmlTagForChoices[i]));
      text = getBestNameFrom(choiceHtmlTags);
    }
  }
  return text;
}
///////////////////////////////////////////////////////////////////////////////
  if (typeof define !== 'undefined' && define.amd) { define([], function () { return generateIdentifier; }); // RequireJS
  } else if (typeof module !== 'undefined' && module.exports) { module.exports = generateIdentifier; // CommonJS
  } else { globals.generateIdentifier = generateIdentifier; // <script>
  }
})(this);