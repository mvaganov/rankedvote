// MIT license - Michael Vaganov, 2016
(function(globals) {
///////////////////////////////////////////////////////////////////////////////

function isObject(val) { return val && ( (typeof val === 'function') || (typeof val === 'object') ); }


var IRV_out = function(msg) {
  if(IRV_output) {
    IRV_output.innerHTML += msg;
  } else {
    throw "IRV_output never specified... IRV_calc should be run before output";
  }
}
var IRV_err = function(msg) {
  IRV_out(msg);
  console.error(msg);
}

var IRV_EX = "`"; // exhausted ballot token. regenerated to ensure no collision with candidate names
var IRV_EX_color = "eee"; // should never print, but just in case...
var IRV_colorList = [
  "f00", "0f0", "00f", //"888",
  "ff0", "0ff", "f0f", //"222",
  "800", "afa", "008", //"666", 
  "ffa", "088", "faf", //"444", 
  "880", "aff", "808", //"aaa",
  "faa", "080", "aaf", //"000",
  "f80", "0f8", "80f", //"ccc",
  "f08", "8f0", "08f", //"fff",
  "480", "048", "804"  //"aaa"  
];


/**
* <pre>
* {@code
* var counted = 0;
* tryEveryString(function(str){console.log(str); return counted++ < 500;});
* }
* </pre>
* @param returnsTrueToContinue {function} callback that takes in a single string, each iteration. should return true to keep iterating.
* @param minchar {?Number} minimum character keycode to iterate through
* @param maxchar {?Number} maximum character keycode (inclusive)
*/
var tryEveryString = function(returnsTrueToContinue, minchar, maxchar) {
  if(!minchar) minchar = 32; if(!maxchar) maxchar = 126;
  var replaceAt=function(s, i, c){return s.substr(0,i)+c+s.substr(i+c.length);}
  var nextCharAtIndex=function(s, i){return replaceAt(s,i,String.fromCharCode(s.charCodeAt(i)+1));}
  var collision, test=String.fromCharCode(minchar);
  do{
    collision = returnsTrueToContinue(test);
    if(collision) {
      var index = 0;
      do{
        test = nextCharAtIndex(test, index);
        var v = test.charCodeAt(index);
        if(v >= maxchar) {
          test = replaceAt(test, index,' ');
          index++;
          while(index >= test.length) { test += ' '; }
        }
      }while(v >= maxchar);
    }
  } while(collision);
};

var IRV_ensure_EX_code = function(listOfCandidates) {
  tryEveryString(function(str){IRV_EX=str;return listOfCandidates.indexOf(IRV_EX) >= 0;});
}

var IRV_createColorMapLookupTable = function(listing) {
  var colorMap = {};
  var colorindex = 0;
  var startingIndex = 0;
  for(var i=startingIndex;i<listing.length;++i) {
    var k = listing[i];
    var colorHex = IRV_colorList[(colorindex++) % IRV_colorList.length];
    colorMap[k] = colorHex;
    //IRV_out("<div class=\"m\" style=\"border-color:#"+colorHex+";\">"+k+"</div>");
  }
  return colorMap;
};

/**
 * @param tally table of tallied votes
 * @param tieBreakerData how to break ties
 * @param allChoicesPossible if true, will include all ranked choices, even those not at the front of the tally
 * @return list of choices from the tally, ordered by weight in the tally
 */
var IRV_orderChoices = function(tally, tieBreakerData, allChoicesPossible, forceTieBreakerDataAsOrder) {
  var order = [];
  for(k in tally) { order.push(k); }
  order.sort(function(a,b){
    var diff = tally[b].length - tally[a].length
    if(forceTieBreakerDataAsOrder || diff == 0) {
      diff = tieBreakerData[b] - tieBreakerData[a];
    }
    return diff;
  });
  if(allChoicesPossible) {
    // go through all of the votes and put non-first-order candidates in there too.
    for(k in tally) {
      var ballots = tally[k];
      for(var v=0;v<ballots.length;++v) {
        var possibleChoices = ballots[v].vote;
        for(var c=0;c<possibleChoices.length;++c) {
          var possibleChoice = possibleChoices[c];
          if(order.indexOf(possibleChoice) < 0) {
            order.push(possibleChoice);
          }
        }
      }
    }
  }
  // ensure that exhausted candidates appear at the end
  if(order[order.length-1] != IRV_EX) {
    var exhaustedIndex = order.indexOf(IRV_EX);
    if(exhaustedIndex >= 0) {
      order.splice(exhaustedIndex, 1);
      order.push(IRV_EX);
    }
  }
  return order;
}

var IRV_whoVotedMoreThanOnce = function(allBallots) {
  // TODO if allBallots is very large, use a different algorithm. this is O(n^2).
  function _indexOfVoter(list, voterID, start, end) {
    if(list) { for(var i=start;i<end;++i) { if(list[i].id == voterID) { return i; } } }
    return -1;
  }
  //var hasVote = [];
  for(var i=0;i<allBallots.length;++i){
    // if(hasVote.indexOf(allBallots[i].id) < 0) {
    //   hasVote.push(allBallots[i].id);
    // } else {
    if(_indexOfVoter(allBallots, allBallots[i].id, i+1, allBallots.length) >= 0) {
      return allBallots[i].id;
    }
  }
  return null;
}

/**
 * used to convert string IDs into numeric indices, for compression purposes.
 * @param candidateWeight how to order the candidates
 * @param out_indexToId {Array} provide a clean array, it will come out a lookup table
 * @param out_idToIndex {Object} provide a clean object, it will come out a lookup table
 */
var IRV_createLookupTable = function(candidateWeight, out_indexToId, out_idToIndex) {
  var candidateList = [];
  for(var k in candidateWeight) {
    candidateList.push(k);
  }
  candidateList = candidateList.sort(function(a,b){
    var diff = candidateWeight[b] - candidateWeight[a];
    return diff;
  });
  if(out_indexToId) {
    Array.prototype.push.apply(out_indexToId, candidateList);
  }
  if(out_idToIndex) {
    for(var i=0;i<out_indexToId.length;++i) {
      out_idToIndex[out_indexToId[i]] = i;
    }
  }
}

/**
 * @param out_visBlocs where to append the visualization model.
 * Each visualiation block explains which block moved from where to where.
 * Every block exists at some index in a number line, and is the size of it's number of votes
 * @param colorMap a mapping of the colors of each candidate choice
 * @param voteStateHistory the state of the votes at each step
 * @param voteMigrationHistory how the votes moved each state
 * @param candidateWeight the weight of each bloc, used to sort blocks of the same size (tie breaking)
 */
var IRV_calculateVisualizationModel = function(out_visBlocs, voteStateHistory, voteMigrationHistory, candidateWeight) {
  var blocsThisState = [];
  var blocsLastState = null;

  // to make the visualization more coherent, calculate the order in which candidates are exhausted, and weight them visually that way
  var weightsForThisVisualization = {};
  for(var s=0;s<voteStateHistory.length;++s) {
    var state = voteStateHistory[s];
    for(var c in state) {
      var val = weightsForThisVisualization[c];
      if(!val) {
        val = state[c].length;
      } else {
        val += state[c].length;
      }
      weightsForThisVisualization[c] = val;
    }
  }
  console.log(JSON.stringify(weightsForThisVisualization));
  candidateWeight = weightsForThisVisualization;

  var calculateBlocs = function(sorted, voteState, candidateWeight) {
    var blocsThisState = [];
    var cursor = 0;
    for(var s=0;s<sorted.length;++s) {
      var thisGuysVotes = voteState[sorted[s]];
      if(thisGuysVotes && thisGuysVotes.length != 0) {
        var bloc = {
          C:sorted[s], // candidate
          s:cursor, // start
          v:thisGuysVotes.length // vote count
        };
        blocsThisState.push(bloc);
        cursor += thisGuysVotes.length;
      }
    }
    return blocsThisState;
  };

  for(var stateIndex=0;stateIndex<voteStateHistory.length;++stateIndex) {
    // sort the candidates based on who is likely to win right now
    var sorted = IRV_orderChoices(voteStateHistory[stateIndex], candidateWeight, false, true);
    // organize those candidates into blocs, and put all those blocs into a list. this is a vote state
    blocsThisState = calculateBlocs(sorted, voteStateHistory[stateIndex], candidateWeight);
    // add the vote state to a list of vote states
    out_visBlocs.push(blocsThisState);
    // if we can discover how the last vote state turned into this one
    if(blocsLastState) {
      var lastStateBlocsAccounted = {};
      /** finds where a bloc is in a given bloc bloc state */
      var findBlocIndex = function(candidateName, blocList) {
        for(var i=0;i<blocList.length;++i) {
          if(blocList[i].C == candidateName) { return i; }
        }
        return -1;
      }
      // for each block in the current state
      for(var c=0;c<blocsThisState.length;++c) {
        var thisBloc = blocsThisState[c];
        var thisBlocName = thisBloc.C;
        if(thisBlocName == IRV_EX) continue; // don't describe exhausted ballot continuation
        // find where it was in the previous state
        var oldBlocIndex = findBlocIndex(thisBlocName, blocsLastState);
        var lastBloc;
        var delta = thisBloc.v;
        if(oldBlocIndex != -1){
          lastBloc = blocsLastState[oldBlocIndex];
          if(lastBloc.C != thisBlocName) {
            return IRV_err("we got a naming and/or searching problem...");
          }
          delta = thisBloc.v - delta;
        }
        // if the size is the same, do an easy shift.
        if(delta == 0) {
          lastBloc.n = [{ // next
            D:thisBloc.C, // destination
            v:lastBloc.v, // vote count
            f:lastBloc.s, // index From
            t:thisBloc.s // index To
          }];
        }
      }
      // the complex shifts were not calculated in the last forloop. but they were calculated in voteMigrationHistory
      var thisTransition = voteMigrationHistory[stateIndex-1];
      var lastStateBlocAcct = {}, thisStateBlocAcct = {}; // keeps track of how much is being transfer from/to
      for(k in thisTransition) { // from
        var lastBloc = blocsLastState[findBlocIndex(k, blocsLastState)];
        if(!lastStateBlocAcct[lastBloc.C]) lastStateBlocAcct[lastBloc.C] = 0;
        for(n in thisTransition[k]) { // to
          var thisBloc = blocsThisState[findBlocIndex(n, blocsThisState)];
          if(!thisStateBlocAcct[thisBloc.C]) {
            var lastThisBloc = blocsLastState[findBlocIndex(n, blocsLastState)];
            if(lastThisBloc) {
              thisStateBlocAcct[thisBloc.C] = lastThisBloc.v;
            } else {
              thisStateBlocAcct[thisBloc.C] = 0;
            }
          }
          var movingVotes = thisTransition[k][n];
          if(!lastBloc.n) lastBloc.n = [];
          lastBloc.n.push({ // next
            D:thisBloc.C, // destination
            v:movingVotes.length, // vote count
            f:lastBloc.s + lastStateBlocAcct[lastBloc.C], // index From
            t:thisBloc.s + thisStateBlocAcct[thisBloc.C] // index To
          });
          lastStateBlocAcct[lastBloc.C] = lastStateBlocAcct[lastBloc.C] + movingVotes.length;
          thisStateBlocAcct[thisBloc.C] = thisStateBlocAcct[thisBloc.C] + movingVotes.length;
        }
      }
    }
    blocsLastState = blocsThisState;
  }
};

var IRV_serializeVisualizationBlocData = function (visBlocs, candidatesListing, colorMap, voteCount, title) {
  // create a lookup table for unique IDs to reduce serialized data. only use IDs that are in this bloc visualization.
  var actuallyNeeded = {}, idToIndexInUse = {}, colorListToSend = [], indexToIdToSend = [];
  actuallyNeeded[IRV_EX]=1; // make sure IRV_EX is in the list (will be first if it is).
  IRV_convertVisualizationBlocIds(visBlocs, null, actuallyNeeded);
  for(var i=0;i<candidatesListing.length;++i) {
    if(actuallyNeeded[candidatesListing[i]]) {
      idToIndexInUse[candidatesListing[i]] = indexToIdToSend.length;
      indexToIdToSend.push(candidatesListing[i]);
      colorListToSend.push(colorMap[candidatesListing[i]]);
    }
  }
  IRV_convertVisualizationBlocIds(visBlocs, idToIndexInUse);
  var serializedCalculations = JSON.stringify(visBlocs).replace(/"/g, '');
  var serialized = "{numVotes:"+voteCount+","+
  "candidates:"+JSON.stringify(indexToIdToSend)+","+ // slice off the __EXHAUSTED__ candidates
  "colors:"+JSON.stringify(colorListToSend)+","+
  "title:\'"+title+"\',"+"data:"+serializedCalculations+"}";
  return serialized;
};

/**
 * @param dataStructure {Object} complex multie-tiered data structure
 * @param propertiesToConvert {Array} if a property with this name is found... 
 * @param conversionTable {Map} if not null, used to replace properties with an alternate value
 * @param out_conversionMade {Map} if not null, counts how many times a value from the property is/would-be replaced
 * @param in_traversedPath {Array} keeps track of dataStructure traversal to prevent recursion.
 * unused, because the special-case function is faster, and also helps inform others of the structure of visualization bloc data
 * convertVisualizationBlocIds could just be: convertPropertyValues(allVisBlocsStates, ['C', 'D'], conversionTable, out_conversionsMade);
 */
function convertPropertyValues(dataStructure, propertiesToConvert, conversionTable, out_conversionsMade, in_traversedPath) {
  if(!in_traversedPath) { in_traversedPath = [dataStructure]; }
  else if(in_traversedPath.indexOf(dataStructure) >= 0) { "//silently ignore recursion"; return; }
  else { in_traversedPath = in_traversedPath.concat([dataStructure]); }
  if(dataStructure.constructor === Array) {
    for(var i=0;i<dataStructure.length;++i) {
      convertPropertyValues(dataStructure[i], propertiesToConvert, conversionTable, out_conversionsMade, in_traversedPath);
    }
  } else if(isObject(dataStructure)) {
    for(var k in dataStructure) {
      var val = dataStructure[k];
      if (isObject(val)) {
        convertPropertyValues(dataStructure[k], propertiesToConvert, conversionTable, out_conversionsMade, in_traversedPath);
      } else if(propertiesToConvert.indexOf(k) >= 0) {
        if(out_conversionsMade) {out_conversionsMade[val] = (out_conversionsMade[val])?(out_conversionsMade[val]+1):1; }
        if(conversionTable) { dataStructure[k] = conversionTable[val]; }
      }
    }
  }
}

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

var IRV_standardOutput = function(results, graphicOutput) {
  if(IRV_deserializeVisualizationBlocData) {
    for(var i=0;i<results.length;++i){
      IRV_deserializeVisualizationBlocData(results[i].showme, 0, 0, 500, -1, graphicOutput);
    }
  } else {
    throw "Include irv_client.js please!";
  }
}

var IRV_calc = function(allBallots, outputContainer, maxWinnersCalculated, cb) {
  if(!maxWinnersCalculated) { maxWinnersCalculated = -1; }
  if(!cb) {
    cb = function(results){
      // console.log(JSON.stringify(results));
      IRV_standardOutput(results, outputContainer);
    }
  }
  var doHtmlOutput = false;
  var originalBallots = allBallots; // save original data
  // heavy clone operation. will fail if ballots reference each other.
  allBallots = JSON.parse(JSON.stringify(allBallots));
  var out = null;
  if(outputContainer) {
    out = document.getElementById(outputContainer);
    IRV_output = out;
    out.innerHTML = "";
  }
  // ensure votes are all in the proper format
  if(allBallots.constructor != Array){
    return IRV_err("votes must be a list of ballots");
  }
  // convert array ballots for OO format
  for(var i=0;i<allBallots.length;++i) {
    var ballot = allBallots[i];
    if(ballot.constructor == Array) {
      ballot = {id:ballot[0], vote:ballot[1]};
      allBallots[i] = ballot;
    }
    if(!ballot.id || !ballot.vote) {
      return IRV_err("incorrectly formatted ballot "+JSON.stringify(ballot));
    }
  }

  // if anyone voted more than once...
  var votedMoreThanOnce = IRV_whoVotedMoreThanOnce(allBallots);
  if(votedMoreThanOnce){
    return irv_error(votedMoreThanOnce+" voted more than once."); // stop the whole process. one bad vote invalidates everything.
    // TODO do some logic to pick which vote is the correct one and remove the others?
  }
  var winners = []; // simple list of candidates who have won
  var results = []; // detailed results: {r:Number (rank),C:String||Array (winning candidates),v:Number (vote count),showme:String (how the results were developed visual)
  var place = 0; // keeps track of which rank is being calculated right now
  var best = null; // the most recent best candidate(s)
  var candidateWeight = IRV_weightedVoteCalc(allBallots); // do a simple guess of who will win using a weighted vote algorithm
  var indexToId = [], idToIndex = {}; // lookup tables used in serialization/deserialization, ordered by weighted-vote weight
  IRV_createLookupTable(candidateWeight, indexToId, idToIndex);
  IRV_ensure_EX_code(indexToId);
  var colorMap = IRV_createColorMapLookupTable(indexToId); // master color lookup table. will be rebuilt for each visualization
  indexToId.splice(0,0,IRV_EX);
  colorMap[IRV_EX] = IRV_EX_color;

  var calcIteration = function(cb) {
    var exhastedCandidates = winners.slice(0); // start with the winners from the system. they can't win again.
    var voteStateHistory = []; // how votes move during the instant-runoff-vote
    var voteMigrationHistory = []; // array of rounds, each round has an array of shifts, each shift is an array with the voter ID and the choice.
    // do process!
    best = IRV_calcBestFrom(exhastedCandidates, allBallots, candidateWeight, voteStateHistory, voteMigrationHistory);

    if(best) {
      var visBlocs = []; // array of voting blocs {candidate:id, indexRange:[#,#], color:"#XXXXXX", votes:[]}
      // create serializable easily expression of the Instant Run-off Vote
      IRV_calculateVisualizationModel(visBlocs, voteStateHistory, voteMigrationHistory, candidateWeight);
      var serialized = IRV_serializeVisualizationBlocData(visBlocs, indexToId, colorMap, allBallots.length,'rank'+place);

      // IRV_out(place+ "> "+best.winner);
      results.push({
        r:place, // rank
        C:best.winner, // candidate identifier(s)
        v:best.count, // vote count
        showme:serialized // what to share with people who want to see how the results were developed
      });
      if(best.winner.constructor === Array) {
        place += best.winner.length-1; // the -1 is because place gets an automatic ++ in the main loop
        // IRV_out(" <-- ");
        // if(best.winner.length > 2){ IRV_out(best.winner.length+" way "); }
        // IRV_out("TIE");
        winners = winners.concat(best.winner);
      } else {
        winners.push(best.winner);
      }
      // IRV_out("<br>");
    }
    place++;
    if(best && (maxWinnersCalculated < 0 || place < maxWinnersCalculated)) {
      setTimeout(function(){calcIteration(cb)}, 0);
    } else {
      if(cb) { cb(results); }
    }
  };
  setTimeout(function(){ calcIteration(cb); }, 0);
}

/** @return table of weighted scores. used for tie-breaking when multiple candidates are about to be removed */
var IRV_weightedVoteCalc = function(ballots){
  // calculate a weighted score, which is a simpler algorithm than Instant Runoff Voting
  var weightedScore = {};
  for(k in ballots){
    var voterRanks = ballots[k].vote;
    for(var i=0;i<voterRanks.length;++i){
      weightedScore[voterRanks[i]] = 0;
    }
  }
  var max = 0;
  var totalCandidateCount = Object.keys(weightedScore).length;
  for(k in ballots){
    var voterRanks = ballots[k].vote;
    for(var i=0;i<voterRanks.length;++i){
      var candidate = voterRanks[i];
      var score = (totalCandidateCount-i);
      weightedScore[candidate] += 1/(i+1);//score / totalCandidateCount;
      if(weightedScore[candidate] > max) max = weightedScore[candidate];
    }
  }
  return weightedScore;
};

/** @return a clone of the given table of lists. used to store logs of vote state */
var IRV_cloneTableOfLists = function(tally) {
  var cloned = {};
  for(k in tally) {
    cloned[k] = tally[k].slice(0);
  }
  return cloned;
}

/** 
 * @param exhastedCandidates who is not allowed to be counted as a winner (because they're already ranked as winners, or they currently have no chance)
 * @param allBallots all of those votes, as an array of ballots. It's a list of votes, where each vote is a voter [id], the ranked [vote] (another list). ballot:{id:String, vote:Array}
 * @param out_voteState if not null, make it a list of vote states, where each state is "the name of the choice":"the votes for that choice"
 * @param out_voteMigrationHistory if not null, make a list of voting rounds, where each round has a table of vote shifts, and each vote shift is a {[key] choice that was displaced and [value] a table of {[key] choices that votes moved to and [value] votes that made it there}}
 * @return [countOfVotes, winner(could be an array if tied)]
 */
var IRV_calcBestFrom = function(exhastedCandidates, allBallots, tieBreakerData, out_voteState, out_voteMigrationHistory) {
  var doHtmlOutput = false;
  var tally = {}; // the table of votes per candidate
  // do an initial count, to find out how things rank
  IRV_tallyVotes(allBallots, exhastedCandidates, tally);
  var iterations = 0;
  var winner = null;
  var mostVotes;
  var expectedMaxVoteCount = -1;
  if(out_voteState){
    out_voteState.push(IRV_cloneTableOfLists(tally))
  }
  do{
    // find out how many total votes there are (to determine majority)
    var sumVotes = 0;
    for(k in tally) {
      if(k==IRV_EX) continue;
      sumVotes += tally[k].length;
    }
    if(expectedMaxVoteCount >= 0 && sumVotes > expectedMaxVoteCount) {
      IRV_err("votes added? ... was "+expectedMaxVoteCount+", and is now "+sumVotes);
    }
    expectedMaxVoteCount = sumVotes;
    // if there are no votes to count, stop!
    if(sumVotes == 0) { break; }
    // if majority is the same value as all votes, the algorithm will exhaust all votes to determine total support
    var majority = sumVotes; // (sumVotes / 2) +1; // 

    // check if any unexhausted choice got a clear majority
    for(k in tally) {
      if(k==IRV_EX) continue; // ignore exhausted ballots
      if(tally[k].length >= majority) {
        winner = k;
        mostVotes = tally[k].length;
      }
    }

    // if there no clear winner, we about to drop some logic.
    if(!winner) {
      // see who has the least votes
      var leastVotes = Number.MAX_VALUE; // how many votes the fewest vote candidate has
      mostVotes = 0;       // how many votes the leader has (used to check for tie)
      for(k in tally) {
        if(k==IRV_EX) continue; // ignore exhausted ballots
        var len = tally[k].length;
        if (len > 0) {
          if (len < leastVotes) { leastVotes = len; }
          if (len > mostVotes) { mostVotes = len; }
        }
      }
      // check for ties, which are a tricky thing in instant-runoff-voting. ties are when *every* candidate has the same number of votes
      var tie = null;
      if(mostVotes == leastVotes){ tie = []; }

      // find out which candidate gets exhausted this round
      var displacedVotes = {}; // identify which ballots need to be recalculated
      var losers = []; // the list of losing candidates
      for(k in tally) {
        if(k==IRV_EX) continue; // the exhausted candidate is already lost, no need to use them in logic
        if(tally[k].length == leastVotes) {
          if(tie) { tie.push(k); }
          losers.push(k);
          if(k == "null") { return IRV_err("why is null losing?..."); }
        }
      }     
      if(losers.length > 0) {
        losers = IRV_untie(losers, tieBreakerData, true);
        // disqualify candidate and displace the candidate's ballots
        for(var i=losers.length-1;i>=0;--i) {
          var k = losers[i];
          exhastedCandidates.push(k); // needs to be disqualified now, because ties are reprocessed otherwise...
          // move them to a list of uncounted votes
          displacedVotes[k] = tally[k];
          tally[k] = [];
        }
        
        // if there was a tie, but not all of them were losers
        if(tie && tie.length != losers.length) {
          tie = null; // there is no tie, because ties can only exist with complete equality
        }
      }
      if(tie) {
        // if there is only one, then there is no tie.
        if(tie.length == 1){
          winner = tie[0];
        } else {
          winner = tie;
        }
      } else {
        var votingRoundAdjust;
        if(out_voteMigrationHistory){
          votingRoundAdjust = {};
        }
        for(k in displacedVotes){
          // do standard logic to find out where to put displaced votes, who's current best choices have been disqualified
          var reassignedVotes = {};
          IRV_tallyVotes(displacedVotes[k], exhastedCandidates, reassignedVotes);

          if(doHtmlOutput) IRV_out("moved "+displacedVotes[k].length+" votes from "+k+" ("+tieBreakerData[k]+") to: ");
          if(out_voteMigrationHistory){
            votingRoundAdjust[k] = reassignedVotes
          }
          // move the displaced votes to their new tally location
          for(newchoice in reassignedVotes){
            if(doHtmlOutput) IRV_out(reassignedVotes[newchoice].length+": "+newchoice+", ");
            if(!tally[newchoice]) {tally[newchoice]=[];}
            tally[newchoice] = tally[newchoice].concat(reassignedVotes[newchoice]);
          }
          if(doHtmlOutput) IRV_out("<br>\n");
        }
        if(doHtmlOutput) IRV_out("--<br>\n");
        if(out_voteMigrationHistory){
          out_voteMigrationHistory.push(votingRoundAdjust);
        }
      }
      if(out_voteState) {
        out_voteState.push(IRV_cloneTableOfLists(tally))
      }
    } // if(!winner)
    iterations++;
    if(iterations > 50){
      IRV_err("too many iterations");
      break;
    }
  }while(!winner);
  return (winner)?{count:mostVotes, winner:winner}:undefined;
}

/**
 * @param tied the list of tied candidates
 * @param tieBreakerData a table giving a score to compare for each tied member
 * @param wantLowest if false, will return lowest-scoring-member(s) of the tie. otherwise, returns highest.
 */
var IRV_untie = function(tied, tieBreakerData, wantLowest) {
  var setApart = []; // who has broken the tie
  var dividingScore = tieBreakerData[tied[0]];
  // find out what the differentiating score is in the group
  for(var i=1;i<tied.length;++i) {
    var score = tieBreakerData[tied[i]];
    // XOR would simplify this if statement to: (wantLoser ^ tieBreakerData[tied[i]] > dividingScore)
    if((wantLowest && score < dividingScore) ||(!wantLowest && score > dividingScore)) {
      dividingScore = score;
    }
  }
  // once the superaltive score is known, add the member(s) to the setApart list
  for(var i=0;i<tied.length;++i) {
    if(tieBreakerData[tied[i]] == dividingScore) setApart.push(tied[i]);
  }
  return setApart;
}

/**
 * @param list of choices, ranked by priority
 * @param exhastedCandidates which choices are disqualified, prompting the next choice to be taken
 * @return the index of the highest priority choice from list, with choices eliminated if they are in the exhastedCandidates list. -1 if no valid choices exist, identifying an exhausted ballot.
 */
var IRV_getBestChoice = function(ballot, exhastedCandidates) {
  var list = ballot.vote;
  if(list) {
    for(var i=0;i<list.length;++i) {
      if(exhastedCandidates.indexOf(list[i]) < 0) {
        return i;
      }
    }
  }
  return -1;
}

/** 
 * @param votes a list of ballots. A ballot is a {id:"unique voter id", vote:["list","of","candidates","(order","matters)"]}
 * @param exhastedCandidates list of which candidates should not count (move to the next choice in the vote's ranked list)
 * @param out_tally a table of all of the votes, seperated by vote winner. {<candidate name>: [list of ballots]}
 */
var IRV_tallyVotes = function(ballots, exhastedCandidates, out_tally) {
  for(var i=0;i<ballots.length;++i) {
    var b = ballots[i];
    var choiceIndex = IRV_getBestChoice(b, exhastedCandidates);
    var bestChoice = (choiceIndex != -1)?b.vote[choiceIndex]:IRV_EX;
    var supportForChoice = out_tally[bestChoice];
    if(!supportForChoice) {
      supportForChoice = [];
      out_tally[bestChoice] = supportForChoice;
    }
    supportForChoice.push(b);
  }
};

///////////////////////////////////////////////////////////////////////////////
  if (typeof define !== 'undefined' && define.amd) { define([], function () { return IRV_calc; }); // RequireJS
  } else if (typeof module !== 'undefined' && module.exports) { module.exports = IRV_calc; // CommonJS
  } else { globals.IRV_calc = IRV_calc; // <script>
  }
})(this);