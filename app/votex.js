var SCOPE;

var updateVoteCount_init = function (voteCount){
  SCOPE.state.votes=Array(voteCount);
  console.log(voteCount);
  for(var i=0;i<voteCount;++i){
    SCOPE.state.votes[i] = JSON.parse(JSON.stringify(SCOPE.state.data));
  }  
}

var updateVoteCount = function (voteCount) {
  updateVoteCount_init(voteCount);
  SCOPE.$digest();
}

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
        for(var i=0;i<$scope.state.votes.length;++i) {
          var data = $scope.state.votes[i];
          if(putBackEscapees($scope.required, data.choices, [data.candidates]) > 0){
            setTimeout(function(){
              var list = ByID("userChoices");
              target = list.children[list.children.length-1];
              console.log("bringing back ",[target])
              errorUI(target, "required.", 2000);
            }, .01);
          }
        }
      }
    };
    $scope.updateVoteCount = updateVoteCount;
//    $scope.state = state;
//    loadState(window.location.href, $scope.state);
//    writeStateIntoFields($scope.state);
    if(RankedVote_servedData) {
      $scope.state = RankedVote_servedData;
    } else {
      $scope.state = {
        id: 0,
        createdby: 0,
        title: "some election",
        data:{
      //    imgw: "", imgh: "32px", // uncomment to set image size
          imgdisp: "none", // set to blank to allow images
          prompt: "If your top choice could not possibly win, your vote automatically transfers to the next ranked candidate.",
          choices: [
      // identifier, text, icon url
              ["0", "Choice 0*", "0.png"],
              ["1", "Choice 1*", "1.png"],
              ["2", "Choice 2*", "2.png"],
          ],
          candidates: [
              ["3", "Choice 3", "3.png"],
              ["4", "Choice 4", "4.png"],
              ["5", "Choice 5", "5.png"],
          ],
        }
      };
    }
    // TODO have some smarter variable to determine what is a required choice...
    $scope.required = shallowArrayCopy($scope.state.data.choices);

    console.log(">>>>> "+JSON.stringify($scope.state));
    // if($scope.state.data.rank) {
    //   $scope.state.rank = $scope.state.data.rank;
    //   $scope.state.data.rank = null;
    //   delete $scope.state.data.rank; // removes the element from the object
    // }

    // cookie cached ranking (local to the device) trumps server-stored ranking (if any)
    var cookieTable = parseCookies(document.cookie);
    if(cookieTable.rank) {
      console.log("found ranks! ");
      $scope.state.rank = JSON.parse(cookieTable.rank);
      // "rank" stores the entire vote. isolate the rank from the vote for the UI
      $scope.state.ranks = $scope.state.rank.data.ranks;
    }
    console.log("!!! "+JSON.stringify($scope.state));
    // if this vote is in progress (cached as cookie or rank sent with data)
    if($scope.state.ranks) {
      var setupAccordingToSavedRank = function (index, r, data) {
        var rankedOrder = [];
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
      };
      updateVoteCount_init($scope.state.ranks.length);
      for(var i=0;i<$scope.state.ranks.length;++i) {
        var rank = $scope.state.ranks[i];
        setupAccordingToSavedRank(i, rank, $scope.state.votes[i]);
      }
    }
    // TODO randomize order of candidates, unless choice order is meant to stay unrandomized (make sure that the ranked choices are not randomized!)
    console.log("state at init: ",[$scope.state]);
    // // Save JSON to queryString
    // $scope.save = function () {
    //   console.log([$scope.state]);
    //   saveState($scope.state);
    // };
    $scope.submit = function() {
      var minchoices = $scope.state.data.minchoices;
      if(minchoices != null && minchoices != undefined){
        for(var i=0;i<$scope.state.votes.length;++i){
          var data = $scope.state.votes[i];
          var countChoices = data.choices.length;
          if(countChoices < minchoices){
            var errorMsg = "";
            if(minchoices == data.candidates.length){
              errorMsg = "You must sort all candidates!";
            } else {
              errorMsg = "You must choose at least "+minchoices+" candidate"+((minchoices>1)?"s":"")+"!";
            }
            errorUI(ByID("userChoices"),errorMsg,5000);
            return;
          }
        }
      }
      var lists = [];
      for(var i=0;i<$scope.state.votes.length;++i){
        var data = $scope.state.votes[i];
        lists.push(simplifiedListOfListsToList(data.choices)); // user ranked-vote
      }
      var submissionState = {
        name: $scope.state.title,
        did: $scope.state.id,
        vid: creatorID,
        data: {
          ranks: lists
          // TODO voter commentary possible to submit?
          // TODO write-in candidate possible to submit?
        }
      };
      if($scope.state.dentry) { submissionState['dentry'] = $scope.state.dentry; }
      // include the existing vote id, if there is one.
      if($scope.state.voteID) {
        submissionState.id = $scope.state.voteID;
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
          var response = JSON.parse(xhr.responseText);
          responseElement.innerHTML += '<br>Vote receipt number: '+response.id;
          document.cookie = "rank=";
        }
      };
      xhr.open('post', '');
      var submisison = JSON.stringify(submissionState);
      console.log("submitting "+submisison);
      document.cookie = "rank=" + submisison;
      xhr.send();

      // saveState($scope.state);
      // if($scope.state.id){
      //   var submissionCall = generateSubmissionCall($scope.state.data.gform, [
      //     $scope.state.electionID,$scope.state.id,list]);
      //   console.log(submissionCall);
      //   window.location.href = submissionCall;
      // } else {
      //   errorUI(ByID("STATE_id"), "enter an e-mail address");
      //   // TODO mail results to the given e-mail address
      // }
    }
//    %22id%22%3A%22nobody%22%2C
    if($scope.state.data.candidates.length > 0){
      dragTutorial(ByID("THEMAINLIST"), ByID("userChoices"));
    } else {

    }
  }]);

//function init() { window.init(); }
