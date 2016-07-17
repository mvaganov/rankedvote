var SCOPE;

var simplifiedListOfListsToList = function(listOfLists) {
  var result = new Array(listOfLists.length);
  for(var i=0;i<listOfLists.length;++i){
    result[i]=listOfLists[i][0];
  }
  return result;
};

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

angular.module('vote', ['ng-sortable', 'ngSanitize'])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
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
    $scope.state = RankedVote_servedData;
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
    // TODO randomize order of candidates, unless choice order is meant to stay unrandomized (make sure that the ranked choices are not randomized!)
    $scope.submit = function() {
      var minchoices = $scope.state.data.minchoices;
      if(minchoices != null && minchoices != undefined){
        var countChoices = $scope.state.data.choices.length;
        if(countChoices < minchoices){
          var errorMsg = "";
          if(minchoices == $scope.state.data.candidates.length){
            errorMsg = "You must sort all candidates!";
          } else {
            errorMsg = "You must choose at least "+minchoices+" candidate"+
            ((minchoices>1)?"s":"")+"!";
          }
          errorUI(ByID("userChoices"),errorMsg,5000);
          return;
        }
      }
      var list = simplifiedListOfListsToList($scope.state.data.choices); // user ranked-vote
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
      if(!creatorID || creatorID == "0") {
        var submitButton = ByID("sbmt");
        submitButton.disabled = true;
        submitButton.innerHTML = "You must login to vote!";
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
          var submitButton = ByID("sbmt");
          submitButton.disabled = true;
          submitButton.innerHTML = "Thank you for your vote!";
          // create link to results
          var responseElement = ByID("response");
          try{
            var response = JSON.parse(xhr.responseText);
            responseElement.innerHTML += '<br>Vote receipt number: '+response.id;
          }catch(e){
            responseElement.innerHTML += '<br>'+xhr.responseText;
          }
          document.cookie = "rank=";
        }
      };
      xhr.open('post', '');
      var submisison = JSON.stringify(submissionState);
      document.cookie = "rank=" + submisison;
      xhr.send();
    }
    if($scope.state.data.candidates.length > 0){
      setTimeout(function(){
      dragTutorial(ByID("THEMAINLIST"), ByID("userChoices"), ByID("hand"), ByID("demotag"));
      },10);
    } else {

    }
  }]);
