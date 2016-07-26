var SCOPE;

var simplifiedListOfListsToList = function(listOfLists) {
  var result = new Array(listOfLists.length);
  for(var i=0;i<listOfLists.length;++i){
    result[i]=listOfLists[i][0];
  }
  return result;
};

var toggleUserChoices = function() {
  var list = SCOPE.state.data.addedCandidate;
  if(!list) return;
  if(SCOPE.userChoicesOn) {
    function removeAddedCandidateFrom(clist) {
      for(var i=clist.length-1;i>=0;--i) {
        if(clist[i][2] && clist[i][2] != '') { // if it is user created
          clist.splice(i,1); // remove it from this list
        }
      }
    }
    // go through each candidate or choice, and remove ones that are in the list
    removeAddedCandidateFrom(SCOPE.state.data.candidates);
    removeAddedCandidateFrom(SCOPE.state.data.choices);
    SCOPE.userChoicesOn = false;
  } else {
    var toPullFrom = JSON.parse(JSON.stringify(list));
    // put user choices into the choices list first, in the order defined by the rank
    var rank = SCOPE.state.rank;
    if(rank) {
      for(var i=0;i<rank.length;++i) {
        var whatIndexInList = -1;
        for(var j=0;j<toPullFrom.length;++j) { if(toPullFrom[j][0] == rank[i]) {whatIndexInList = j; break; } }
        if(whatIndexInList >= 0) {
          var item = toPullFrom[whatIndexInList];
          toPullFrom.splice(whatIndexInList,1);
          SCOPE.state.data.choices.splice(i,0,item);
        }
      }
    }
    // put whatever choices are left at the end of the candidates
    for(var i=0;i<toPullFrom.length;++i) {
      SCOPE.state.data.candidates.push(toPullFrom[i]);
    }
    SCOPE.userChoicesOn = true;
  }
}

var moveElementFromAtoB = function(Element, index, A, B){
  A.splice(index,1);
  B.push(Element);
};
var putBackEscapees = function(listOfRestricted, imprisoned, allOthers){
  //$scope.required, $scope.state.data.choices, [$scope.state.data.candidates]
  var escapeesDiscovered = 0;
  for(var c=0;c<allOthers.length;++c){
    var inspectedLocation = allOthers[c];
    for(var i=0;i<inspectedLocation.length;++i){
      var interviewee = inspectedLocation[i];
      if(listOfRestricted.indexOf(interviewee) >= 0){
        moveElementFromAtoB(interviewee,i,inspectedLocation,imprisoned);
        --i;
        escapeesDiscovered++;
      }
    }
  }
  return escapeesDiscovered;
};

var shallowArrayCopy = function(arr) {
  var copy = new Array(arr.length); var i=arr.length;
  while(i--){ copy[i]=arr[i]; }
  return copy;
};

function elementPulse(obj, times, duration){
  var count = 0;
  var delay = 100; //(duration / times) * absOpacityStep;
  var absOpacityStep = delay / (duration / (2*times));//.25;
  obj.style.opacity = 1.0;
  var opacityStep = -absOpacityStep;
  var minOpacity = 1/1024.0;
  var visibility = 1;
  var blinker = function(){
    if(obj.style.opacity <= minOpacity){ opacityStep = absOpacityStep; }
    if(obj.style.opacity >= 1){ opacityStep = -absOpacityStep; }
    visibility += opacityStep;
    obj.style.opacity = visibility;
    count+= (0.5 * absOpacityStep);
    if(count >= times){
      obj.style.opacity = "";
    } else {
      setTimeout(blinker, delay); 
    }
  };
  blinker();
};

function responsePulse(text, color) {
  var responseElement = ByID("response");
  var pre = "", post = "";
  if(color) { pre="<span style=\"color:"+color+"\">"; post="</span>"; }
  responseElement.innerHTML = pre+text+post;
  elementPulse(responseElement, 3, 1000);
}

function log(str) {
  // console.log(str);
}

function candidateNameFrom(htmlText) {
  return generateIdentifier(htmlText);
  //return htmlText.substring(0,Math.min(32,htmlText.length));
}

angular.module('vote', ['ng-sortable', 'ngSanitize'])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
    $scope.creatorID = creatorID;
    $scope.state = RankedVote_servedData;
    $scope.log = log;
    $scope.toggleUserChoices = toggleUserChoices;
    $scope.canAddCandidate = function(){
      return $scope.state.data.userSuggestion=='open'
      || ($scope.state.data.userSuggestion=='once' && (function countMyOptions(){
        var count = 0;
        for(var i=0;i<$scope.state.data.candidates.length;++i) { if($scope.state.data.candidates[i][2]==creatorID) count++; }
        for(var i=0;i<$scope.state.data.choices.length;++i) { if($scope.state.data.choices[i][2]==creatorID) count++; }
        if($scope.state.data.addedCandidate) {
          for(var i=0;i<$scope.state.data.addedCandidate.length;++i) { if($scope.state.data.addedCandidate[i][2]==creatorID) count++; }
        }
        return count;
      })() < 1);
    };
    $scope.addCandidate = function() {
      $scope.state.data.choices.splice(0,0,[undefined,"",creatorID]);
    };
    $scope.editOption = function(listname, index) {
      component = $scope.state.data[listname][index];
      var readyForUse = component[0] !== undefined;
      if(!readyForUse) {
        if(!component[1] || !component[1].length) {
          $scope.state.data[listname].splice(index,1);
          for(var i=$scope.state.data.addedCandidate.length-1;i>=0;--i) {
            if($scope.state.data.addedCandidate[i][2]==creatorID) { $scope.state.data.addedCandidate.splice(i,1); }
          }
        } else {
          var idText = candidateNameFrom(component[1]);
          log("NEW ID: \'"+idText+"\'");
          component[0] = idText;
        }
      } else {
        component[0] = undefined;
      }
    };
    if($scope.state.data.votability!='closed') {
      $scope.opts = {
        group: 'choices',
        animation: 150,
        onEnd: function(evt){
          if(putBackEscapees($scope.required, $scope.state.data.choices, [$scope.state.data.candidates]) > 0){
            setTimeout(function(){
              var list = ByID("userChoices");
              target = list.children[list.children.length-1];
            }, .01);
          }
        }
      };
    }
    // TODO have some smarter variable to determine what is a required choice...
    $scope.required = shallowArrayCopy($scope.state.data.choices);

    // cookie cached ranking (local to the device) trumps server-stored ranking (if any)
    var cookieTable = parseCookies(document.cookie);
    if(cookieTable.rank) {
      $scope.state.rank = JSON.parse(cookieTable.rank);
      // "rank" stores the entire vote. isolate the rank from the vote for the UI
      $scope.state.rank = $scope.state.rank.data.rank;
    }
    // if this vote is in progress (cached as cookie or rank sent with data)
    if($scope.state.rank) {
      var rankedOrder = [];
      var r = $scope.state.rank;
      var data = $scope.state.data;
      // go through the rank
      for(var i=0;i<r.length;++i) {
        // find the choices (and candidates)
        for(var j=0;j<data.choices.length;++j){
          // set those in the correct order
          if(data.choices[j][0] == r[i]){
            rankedOrder.push(data.choices[j]);
            // remove the ranked elements from the choices and candidates
            data.choices.splice(j, 1);
          }
        }
        for(var j=0;j<data.candidates.length;++j){
          // set those in the correct order
          if(data.candidates[j][0] == r[i]){
            rankedOrder.push(data.candidates[j]);
            // remove the ranked elements from the choices and candidates
            data.candidates.splice(j, 1);
          }
        }
        // add any remaining choices into the unselected candidates
        data.candidates.concat(data.choices);
        // set the choices to the ranked order
        data.choices = rankedOrder;
      }
    }
    // make user created choices available
    toggleUserChoices();
    // TODO randomize order of candidates, unless choice order is meant to stay unrandomized (make sure that the ranked choices are not randomized!)
    $scope.submit = function() {
      var minchoices = $scope.state.data.minchoices;
      if(minchoices != null && minchoices != undefined) {
        var countChoices = $scope.state.data.choices.length;
        if(countChoices < minchoices){
          var errorMsg = "";
          if(minchoices == $scope.state.data.candidates.length){
            errorMsg = "You must sort all candidates!";
          } else {
            errorMsg = "You must choose at least "+minchoices+" candidate"+
            ((minchoices>1)?"s":"")+"!";
          }
          responsePulse(errorMsg, '#f00');
          //errorUI(ByID("userChoices"),errorMsg,5000);
          return;
        }
      }
      var list = simplifiedListOfListsToList($scope.state.data.choices); // user ranked-vote
      // validate list
      for(var i=0;i<list.length;++i) {
        if(!list[i] || !list[i].length) {
          responsePulse('bad entry at index '+i+': '+JSON.stringify(list), '#f00');
          return;
        }
      }
      var submissionState = {
        name: $scope.state.title,
        did: $scope.state.id,
        vid: creatorID,
        data: {
          "rank": list
          // TODO voter commentary possible to submit?
          // TODO write-in candidate possible to submit?
        }
      };
      if($scope.state.dentry) { submissionState['dentry'] = $scope.state.dentry; }
      // include the existing vote id, if there is one.
      if($scope.state.voteID) {
        submissionState.id = $scope.state.voteID;
      }
      // find the candidates or choices are a user generated option
      var found = [];
      function checkListForOptionFrom(list, voterid, out_found) {
        for(var i=0;i<list.length;++i) { if(list[i][2] == voterid) { out_found.push(list[i]); } }
      }
      checkListForOptionFrom($scope.state.data.candidates, creatorID, found);
      checkListForOptionFrom($scope.state.data.choices, creatorID, found);
      // isolate that data
      if(found.length > 0 || ($scope.state.data.addedCandidate && $scope.state.data.addedCandidate.length == 0)) {
        if(!submissionState.data) {submissionState.data={};}
        // put it into the submission state as an addedCandidate
        for(var i=found.length-1;i>=0;--i) {
          var suggestion = found[i];
          var foundIndex = -1;
          for(var j=0;j<i;++j) { if(found[j][0] == found[i][0]) { foundIndex = j; break; } }
          if(foundIndex >= 0) { log("removing duplicate "+found[foundIndex]); found.splice(foundIndex,1); }
        }
        submissionState.data.addedCandidate = found;
      }
      if(!creatorID || creatorID == "0") {
        responsePulse('You must login to vote!', '#f00');
      }
      // TODO validate voter id
      // TODO validate debate id matches the last part of the URL

      // TODO submit $scope.state with this user ID
      // send the data in the HTTP headers as a cookie
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        // clear the data from the cookie once the data is properly sent.
        if (xhr.readyState == 4 && xhr.status == 200) {
          // hide vote button
          // create link to results
          try{
            var response = JSON.parse(xhr.responseText);
            responsePulse('Vote receipt number: '+response.id, '#0f0');
          }catch(e){
            var redirectHead = "redirect:";
            if(xhr.responseText.startsWith(redirectHead)) {
              window.location = xhr.responseText.substring(redirectHead.length);
              return;
            }
            responsePulse(xhr.responseText, '#f00');
          }
          document.cookie = "rank=";
        }
      };
      xhr.open('post', '');
      var submisison = JSON.stringify(submissionState);
      document.cookie = "rank=" + submisison;
      xhr.send();
    }
    if($scope.state.data.candidates.length > 0 && $scope.state.data.votability!='closed' && !$scope.state.rank){
      setTimeout(function(){
      dragTutorial(ByID("THEMAINLIST"), ByID("userChoices"), ByID("hand"), ByID("demotag"));
      },10);
    } else {

    }
  }]);
