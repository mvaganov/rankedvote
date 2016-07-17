/**
 * @param out_state where to write the values of every HTML element with an ID that starts with ${STATE_PREFIX}
 * @param STATE_PREFIX a string that each element, whose state should be saved, starts with. Example: "STATE_"
 */
var writeFieldsIntoState = function(out_state, STATE_PREFIX) {
  if(!out_state){console.warn("null passed in as state"); return;}
  var allElements = document.getElementsByTagName("*");
  for (var i = 0, n = allElements.length; i < n; ++i) {
    var el = allElements[i];
    if (strStartsWith(el.id, STATE_PREFIX)){
      var completePath = el.id.slice(STATE_PREFIX.length).split('.');
      cursor = out_state;
      for(var i=0;i<completePath.length-1;++i) {
        if(!cursor.hasOwnProperty(completePath[i])) {
          cursor[completePath[i]] = {};
        }
        cursor = cursor[completePath[i]];
      }
      cursor[completePath[completePath.length-1]] = el.value;
    }
  }
}

/**
 * @param state list of values to give every named variable that starts with ${STATE_PREFIX}
 * @param STATE_PREFIX a string that each element, whose state should be saved, starts with. Example: "STATE_"
 */
var writeStateIntoFields = function(state, STATE_PREFIX) {
  function containerSearch(dataSource, path, visitOnce) {
    if(visitOnce.indexOf(dataSource) >= 0) { return; }
    visitOnce.push(dataSource);
    if(visitOnce.length > 1000) { console.log("too many visits...\n"+visitOnce); return; }
    if(dataSource && typeof dataSource === 'object' && dataSource.constructor !== Array) {
      for (var key in dataSource) {
        if (key[0] != '$' && dataSource.hasOwnProperty(key)) {
         containerSearch(dataSource[key], path+"."+key, visitOnce);
        }
      }
    }
    //else {
      var el = ByID(path);
      if(el) {
        //console.log("SETTING "+path+".value to "+JSON.stringify(dataSource));
        el.value = (typeof dataSource !== 'object') ? dataSource : JSON.stringify(dataSource);
      }
      //else { console.log("missing "+path+" element"); }
    //}
  }
  var visitOnce = [];
  containerSearch(state, STATE_PREFIX, visitOnce);
  // for (var key in state) {
  //   if (state.hasOwnProperty(key)) {
  //     var el = ByID(STATE_PREFIX+key);
  //     if(el){
  //       //console.log("setting "+STATE_PREFIX+key+".value to "+state[key]);
  //       el.value = state[key];
  //     }
  //   }
  // }
}

/** 
 * @param location the URL of the webpage (uses window.location.href if null)
 * @param existingStateToWriteInto if not null, also writes the state (loaded from the URL) into this table
 */
var loadState = function(location, existingStateToWriteInto){
  // console.log("loc "+location);
  if(!location){location = window.location.href; }
  try {
    var query = location.toString().split('#').pop();
    var decoded = decodeURIComponent(query);
    var state = JSON.parse(decoded);
    // if there is compressed data "!" and a key "*"
    console.log([state]);
    if(state["*"] && state["!"]){
      decoded = unfilter(state["*"], state["!"]);
      console.log(decoded);
      state = JSON.parse(decoded);
    }
    writeStateIntoFields(state);
    if(existingStateToWriteInto){
      for(var key in state){
        existingStateToWriteInto[key] = state[key];
      }
    }
    return state;
  } catch (err) { }
  return null;
}

var getSaveStateURL = function(state){
  writeFieldsIntoState(state);
  var json = JSON.stringify(state);
  var compress = attemptToCompressURLData(json);
  if(compress){
    var compressor = {
      "!":compress[0], // dictionary
      "*":compress[1], // data
    };
    var containerJSON = JSON.stringify(compressor);
    return encodeURIComponent(containerJSON);
  }else{
    return encodeURIComponent(json);
  }
};

var saveState = function(state){
  location.hash = getSaveStateURL(state);
};

var zeroOut = function(arr){
  for(var i=0;i<arr.length;++i)
    arr[i]=0;
  return arr;
}

// turn a raw string into a URL safe string filtered by a simple replacement cipher
// @returns [filteredString, replacementCipher]
var attemptToCompressURLData = function(originalString) {
  var allowedSpecialCharacters = "-._!*'()";
  console.log(encodeURIComponent(allowedSpecialCharacters));
  var spec = new Array(allowedSpecialCharacters.length);
  for(var i=0;i<spec.length;++i)spec[i]=allowedSpecialCharacters.charCodeAt(i);
  var lowercaseUsed=zeroOut(new Array(26)); 
  var uppercaseUsed=zeroOut(new Array(26));
  var numericUsed = zeroOut(new Array(10));
  var specialUsed = zeroOut(new Array(allowedSpecialCharacters.length));
  var unsafeChars = [];
  var unsafeUsed = [];
  var n0 = "0".charCodeAt(0), n9 = "9".charCodeAt(0), 
      na = "a".charCodeAt(0),
      nz = "z".charCodeAt(0),
      nA = "A".charCodeAt(0),
      nZ = "Z".charCodeAt(0);
  var idx;
  for(var i=0;i<originalString.length;++i){
    var c = originalString.charCodeAt(i);
    if (c >= n0 && c <= n9){
      numericUsed[c-n0]++;
    } else if (c >= na && c <= nz) {
      lowercaseUsed[c-na]++;
    } else if (c >= nA && c <= nZ) {
      uppercaseUsed[c-nA]++;
    } else if ( (idx = spec.indexOf(c)) >= 0){
      specialUsed[idx]++;
    } else {
      idx = unsafeChars.indexOf(c);
      if(idx < 0){
        unsafeChars.push(c);
        unsafeUsed.push(1);
      } else {
        unsafeUsed[idx]++;
      }
    }
  }
  var forEachZero = function(arr, whatToDo) {
    for(var i=0;i<arr.length;++i) {
      if(arr[i] === 0){
        whatToDo(i);
      }
    }
  };
  var unusedCharacters = "";
  forEachZero(uppercaseUsed, function(i){unusedCharacters += String.fromCharCode(nA+i);});
  forEachZero(lowercaseUsed, function(i){unusedCharacters += String.fromCharCode(na+i);});
  forEachZero(numericUsed, function(i){unusedCharacters += String.fromCharCode(n0+i);});
  forEachZero(specialUsed, function(i){unusedCharacters += String.fromCharCode(spec[i]);});
  if(unusedCharacters.length==0){
    return null;
  }
  console.log("unused:",unusedCharacters);
  unsafeSorted = clone(unsafeChars);
  var lookupTable = {};
  for(var i=0;i<unsafeChars.length;++i){
    lookupTable[unsafeChars[i]] = unsafeUsed[i];
  }
  unsafeSorted.sort(function(a,b){
    return lookupTable[b]-lookupTable[a]; // most common first
  });
  for(var i=0;i<unsafeSorted.length;++i){
    console.log("\""+String.fromCharCode(unsafeSorted[i])+"\"",lookupTable[unsafeSorted[i]]);
  }
  var delim = unusedCharacters[0];
  unusedCharacters = unusedCharacters.substring(1);
  var replacementCipher = "";
  var tokensUsed = 0;
  var searchReplace = {};
  for(var i=0; i<unusedCharacters.length && i < unsafeChars.length; ++i){
    searchReplace[unsafeChars[i]] = unusedCharacters[i];
    replacementCipher += delim + unusedCharacters[i] + 
      unsafeChars[i].toString(16).toUpperCase();
      //String.fromCharCode(unsafeChars[i]);
    tokensUsed++;
  }
  unusedCharacters = unusedCharacters.substring(tokensUsed);
  console.log(replacementCipher);
  console.log([searchReplace]);
  var filteredString = "";
  for(var i=0;i<originalString.length;++i){
    var c = originalString.charCodeAt(i);
    var r = searchReplace[c];
    if(r){
      filteredString += r;
    }else{
      filteredString += String.fromCharCode(c);
    }
  }
  return [filteredString, replacementCipher];
};

// get raw text out of URL-safe string
var unfilter = function(filter, filteredString){
  // create the lookup table from the filter
  var k = {};
  var delim = filter[0];
  for(var i=1;i<filter.length;++i){
    var c = filter[i];
    i++;
    var replacement = "";
    while(filter[i] != delim && i < filter.length){
      var hexNum = "";
      hexNum += filter[i+0];
      hexNum += filter[i+1];
      i+=2;
      replacement += String.fromCharCode(parseInt(hexNum, 16));
    }
    k[c] = replacement;
  }
  // filter the string using the lookup table
  var unfiltered = "";
  var r;
  for(var i=0;i<filteredString.length;++i) {
    r = k[filteredString[i]];
    if(r){
      unfiltered += r;
    }else{
      unfiltered += filteredString[i];
    }
  }
  return unfiltered;
};
