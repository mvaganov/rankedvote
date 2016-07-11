//add functionality to the String implementation...
(function () {
  "use strict";
  if (typeof String.prototype.startsWith !== 'function') {
    String.prototype.startsWith = function (str) {
      return this.substring(0, str.length) === str; //this.slice(0, str.length) === str;
    }
  }
  if (typeof String.prototype.replaceAll !== 'function') {
    /**
     * @param {string} str1
     * @param {string} str2
     * @param {(boolean|null)} ignore ignore case?
     * @return {string} a new string, a copy of this one, with all instances of str1 replaced with str2.
     */
    String.prototype.replaceAll = function(str1, str2, ignore) {
      return this.replace(new RegExp(
        str1.replace(
          /([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g, "\\$&"
        ),
        (ignore?"gi":"g")),
        (typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2
      );
    }
  }
  if (typeof String.prototype.indexOfOneOfThese !== 'function') {
    /**
     * @param {Array<String>} listOfDelimeters possible string delimeters that are being sought after
     * @param {number=} start where to start looking in the string
     * @return {Array<number>} [index that has one of these first, which delimeter was actually found here]. 
     * if none of these exist, returns [this.length, -1]
     * return[0] is the index
     * return[1] is the index of the delimeter that was found
     */
    String.prototype.indexOfOneOfThese = function (listOfDelimeters, start) {
      var bestIndex = this.length;
      var foundDelimeter = -1;
      if(start == null || start == undefined) start = 0;
      for(var i = 0; i < listOfDelimeters.length; ++i) {
        var index = this.indexOf(listOfDelimeters[i], start);
        if(index >= 0 && index < bestIndex) {
          foundDelimeter  = i;
          bestIndex = index;
        }
      }
      return [bestIndex, foundDelimeter];
    }
  }
  if (typeof String.prototype.splitByOneOfThese !== 'function') {
    /**
     * @param {Array<String>} listOfDelimeters possible string delimeters that are being sought after
     * @param {Number} maxSplits how many times to split. will split from left to right. -1 means no limit
     * @return {Array<String>} as split, except with multiple delimeter tokens
     */
    String.prototype.splitByOneOfThese = function (listOfDelimeters, maxSplits) {
      if(maxSplits == null) maxSplits = -1;
      var splitted = [], index = 0, whereToSplit, segment, splitCount = 0;
      for(var i = 0; index < this.length; ++i) {
        if(maxSplits >= 0 && splitCount >= maxSplits) {
          whereToSplit = [this.length, -1];
        } else {
          whereToSplit = this.indexOfOneOfThese(listOfDelimeters, index);
        }
        segment = this.slice(index, whereToSplit[0]);
        //console.log("("+index+", "+whereToSplit[0]+"... "+whereToSplit[1]+") ="+segment);
        splitCount++;
        if(segment.length > 0) {
          splitted.push(segment);
        }
        index = whereToSplit[0];
        if(whereToSplit[1] != -1) {
          index += listOfDelimeters[whereToSplit[1]].length;
        }
      }
      return splitted;
    }
  }
  if (typeof String.prototype.splitIntoTable !== 'function') {
    /**
     * @param {Array<String>} listOfEntryDelimeters example: {@code ["{", "}", ","]}
     * @param {Array<String>} listOfAssignmentDelimeters example: {@code ["=",":"]}
     * @return {Object<String,String>} a key/value pair table. see {@link String#prototype#parseCookies} as an example
     */
    String.prototype.splitIntoTable = function (listOfEntryDelimeters, listOfAssignmentDelimeters) {
      // first, split by entry delimeters
      var entries = this.splitByOneOfThese(listOfEntryDelimeters);
      // then split in half by the assignment delimeter
      var table = {};
      for(var i = 0; i < entries.length; ++i) {
        var pair = entries[i].splitByOneOfThese(listOfAssignmentDelimeters, 1);
        if(pair.length > 1) {
          table[pair[0].trim()] = pair[1].trim();
        } else {
          table[pair[0].trim()] = null;
        }
      }
      return table;
    }
  }
})();
/**
 * @return {Map<String,String>} a table of cookies parameters, assuming this is formatted like an html cookie.
 */
function parseCookies(str) { return str.splitIntoTable([";"], ["=", ":"]); }