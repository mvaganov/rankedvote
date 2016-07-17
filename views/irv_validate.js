
// MIT license - Michael Vaganov, 2016
(function(globals) {
///////////////////////////////////////////////////////////////////////////////
function irv_validateCandidates(lists, callback) {
  if(callback && typeof callback !== 'function') {
    console.log(JSON.stringify(callback));
    callback(); // force exception for non-function callbacks...
  }
  var allChoices = [];
  var MAX_IDENTIFIER_LENGTH = 32;
  function basicIdentifierValidation(list, out_allChoices, callback) {
    if(list) {
      for(var i=0;i<list.length;++i) {
        var candidateID = list[i][0];
        if(!candidateID || !candidateID.length) { if(callback) { callback("candidate "+i+" missing identifier"); } return false; }
        if(candidateID.length > MAX_IDENTIFIER_LENGTH) {
          if(callback) { callback("candidate "+i+"'s' name is too long:"+candidateID.substring(0,MAX_IDENTIFIER_LENGTH)+"..."); }
          return false;
        }
        if(out_allChoices) { out_allChoices.push(candidateID); }
      }
    }
    return true;
  }
  for(var l=0;l<lists.length;++l){
    if(!basicIdentifierValidation(lists[l], allChoices,callback)) return false;
  }
  // make sure each debate ID is unique
  if(allChoices.length < 1) {
    if(callback) { callback("a debate must have at least one option"); }
    return false;
  }
  for(var i=0;i<allChoices.length;++i) {
    var index = allChoices.indexOf(allChoices[i], i+1);
    if(index >= 0) {
      if(callback) { callback("duplicate candidate: "+allChoices[i]+" and "+allChoices[index]); }
      return false;
    }
  }
  if(callback) { callback(null); }
  return true;
}
///////////////////////////////////////////////////////////////////////////////
  if (typeof define !== 'undefined' && define.amd) { define([], function () { return irv_validateCandidates; }); // RequireJS
  } else if (typeof module !== 'undefined' && module.exports) { module.exports = irv_validateCandidates; // CommonJS
  } else { globals.irv_validateCandidates = irv_validateCandidates; // <script>
  }
})(this);