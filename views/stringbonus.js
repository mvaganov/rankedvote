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
  if (typeof String.prototype.hasAt !== 'function') {
    String.prototype.hasAt = function (token, index) {
      if(token.length+index > this.length) { return false; }
      for(var i=0;i<token.length;++i) {
        if(token[i] !== this[i+index]) {
          return false;
        }
      }
      return true;
    }
  }
  if (typeof String.prototype.trimTokens !== 'function') {
    String.prototype.trimTokens = function (tokens) {
      // from front
      for(var i=0;i<tokens.length;++i) {
        if(this.hasAt(tokens[i], 0)) {
          console.log("@BEG "+this);
          this.splice(0,tokens[i].length);
          i=0;
        }
      }
      // from back
      for(var i=0;i<tokens.length;++i) {
        var index = this.length-tokens[i].length;
        if(this.hasAt(tokens[i], index)) {
          console.log("@END "+this);
          this.splice(index,tokens[i].length);
          i=0;
        }
      }
      return this;
    }
  }
  if (typeof String.prototype.splitByOneOfThese !== 'function') {
    /**
     * @param {Array<String>} listOfDelimeters possible string delimeters that are being sought after
     * @param {Number} maxSplits how many times to split. will split from left to right. -1 means no limit
     * @return {Array<String>} as split, except with multiple delimeter tokens
     */
    String.prototype.splitByOneOfThese = function (listOfDelimeters, maxSplits, listOfDelimetersToInclude, respectStringLiterals) {
      if(maxSplits == null) maxSplits = -1;
      var splitted = [], index = 0, whereToSplit, segment, splitCount = 0;
      for(var i = 0; index < this.length; ++i) {
        if(maxSplits >= 0 && splitCount >= maxSplits) {
          whereToSplit = [this.length, -1];
        } else {
          var cursor = index;
          var doneLooking;
          do {
            var literalStart = null;
            var literalEnd = null;
            if(respectStringLiterals) {
              var literalDelims = ["\"","\'"];
              literalStart = this.indexOfOneOfThese(literalDelims, cursor);
              if(literalStart[1] != -1) {
                // console.log("0found "+literalDelims[literalStart[1]]+" at "+literalStart[0]+".");
                var cursor = literalStart[0];
                do {
                  cursor += 1;
                  literalEnd = this.indexOfOneOfThese([literalDelims[literalStart[1]]], cursor);
                  // console.log("ending "+[literalDelims[literalStart[1]]]+" at "+literalEnd[0]+"?");
                  if(this[literalEnd[0]-1] == '\\'){
                    cursor = literalEnd[0]+1;
                  }
                } while(literalEnd[1] >= 0 && this[literalEnd[0]-1] == '\\');
                // console.log("1found ending "+[literalDelims[literalStart[1]]]+" at "+literalEnd[0]+". ("+this[literalEnd[0]-1]+")");
              } 
              // else { console.log("no literals found past "+cursor); }
            }
            cursor = index; // start over, before the string literal was found.
            doneLooking = true;
            whereToSplit = this.indexOfOneOfThese(listOfDelimeters, cursor);
            // console.log("2found \'"+listOfDelimeters[whereToSplit[1]]+"\' at "+whereToSplit[0]+".");
            // if(literalStart && literalEnd) console.log("????"+whereToSplit[1]+" != -1 && "+whereToSplit[0]+" > "+literalStart[0]+" && "+whereToSplit[0]+" < "+literalEnd[0]);
            if(literalStart && literalEnd && whereToSplit[1] != -1 && whereToSplit[0] > literalStart[0] && whereToSplit[0] < literalEnd[0]) {
              // console.log("---the break is in the literal. keep looking, past the literal!");
              cursor = literalEnd[0]+1;
              index = cursor;
              doneLooking = false;
              segment = this.substring(literalStart[0], literalEnd[0]+1);
              // console.log("adding string literal "+segment);
              splitCount++;
              if(segment.length > 0) {
                splitted.push(segment);
              }
            }
          } while(!doneLooking);
        }
        segment = this.slice(index, whereToSplit[0]);
        //console.log("("+index+", "+whereToSplit[0]+"... "+whereToSplit[1]+") ="+segment);
        splitCount++;
        if(segment.length > 0) {
          splitted.push(segment);
        }
        index = whereToSplit[0];
        var whichDelimeterWasSplitOn = listOfDelimeters[whereToSplit[1]];
        if(whichDelimeterWasSplitOn && listOfDelimetersToInclude && listOfDelimetersToInclude.indexOf(whichDelimeterWasSplitOn) >= 0) {
          splitted.push(whichDelimeterWasSplitOn);
        }
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

/**
* @param text {String} text to parse
* @param out_htmlTags {?Array<Object>} where to put HTML tags discovered in the parsing. each tag will have a 'tagName'
* @return text without HTML in it
*/
function separateTextAndHtml(text, out_htmlTags) {
  function stripOutHtmlTags(text) {
    var resultText = "";
    var cursor = 0;
    do {
      var index = text.indexOf("<", cursor);
      if(index >= 0) {
        resultText += text.substring(cursor, index);
        var endIndex = text.indexOf(">", index+1);
        if(endIndex >= 0) {
          cursor = endIndex+1;
          if(out_htmlTags) {
            var subtext = text.substring(index, endIndex);
            var tokens = subtext.splitByOneOfThese([" ","=","<",">","\n","\t","\r"], -1, ["="], true);
            var tag = {};
            if(tokens.length >= 1) {
              tag.tagName = tokens[0];
            }
            for(var i=1;i<tokens.length;++i){
              if(tokens[i+1] == "=") {
                var val = tokens[i+2];
                if((val[0] == '\"' && val[val.length-1] == '\"') || (val[0] == '\'' && val[val.length-1] == '\'')) {
                  val = val.substring(1, val.length-1);
                }
                tag[tokens[i]] = val;
                i+=2;
              } else {
                tag[tokens[i]] = undefined;
              }
            }
            out_htmlTags.push(tag);
            if(tag.tagName == "br" || tag.tagName == "hr") {
              resultText += "\n";
            }
          }
        } else {
          cursor = text.length;
        }
      } else {
        resultText += text.substring(cursor, text.length);
        cursor = text.length;
      }
    } while(cursor < text.length);
    return resultText;
  }
  var str = stripOutHtmlTags(text);
  var trimmed = str.trimTokens([" ","\n","\r","\t"])
  // console.log(str+" --trim-> "+trimmed);
  return trimmed;
}
