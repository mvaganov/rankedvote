var SCOPE;

function setStyle(property, value, element_ids) {
  for(var i=0;i<element_ids.length;++i){
    var e = ByID(element_ids[i]);
    e.style[property] = value;
  }
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

function generateIdentifiers(state) {
  function generateIDForGroup(list) {
    // clear all of the identifiers first...
    for(var i=0;i<list.length;++i) {
        list[i][0] = '';
    }
    var htmlTagForChoices = [];
    for(var i=0;i<list.length;++i) {
      list[i][0] = generateIdentifier(list[i][1]);
    }
  }
  generateIDForGroup(state.data.candidates);
  generateIDForGroup(state.data.choices);
}

angular.module('vote', ['ng-sortable', 'ngSanitize'])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
    $scope.opts = {
      group: 'choices',
      animation: 150,
    };
    if(typeof RankedVote_servedData !== 'undefined') {
      $scope.state = RankedVote_servedData;
    } else {
      $scope.state = {
        data: {
          candidates: [
      // ["id0", "text", "http://icon.gif"]
              ["c0", "Choice 0", ""],
              ["c1", "Choice 1", ""],
              ["c2", "Choice 2", ""],
          ],
          choices: [], imgdisp:"none", visibility:"private"
        }
      };
    }
    $scope.choiceID = "none";
    // check if there is data in the cookie.
    var cookieTable = parseCookies(document.cookie);
    if(cookieTable.debate) {
      $scope.state = JSON.parse(cookieTable.debate);
    }
    writeStateIntoFields($scope, "SCOPE");
    $scope.refresh = function(){
      var specialCodeInput = ByID("jsoninsert");
      if(specialCodeInput) {
        specialCodeInput.value = JSON.stringify($scope.state, null, 2);
      }
    };
    $scope.refresh();
    $scope.submit = function() {
      var responseElement = ByID("response");
      if(!$scope.state.title || !$scope.state.title.length) {
        responsePulse("missing title","#f00");
        return false;
      }
      if($scope.choiceID == "none") {
        // generate IDs based on descriptions
        generateIdentifiers($scope.state);
      }
      if(!irv_validateCandidates([$scope.state.data.candidates, $scope.state.data.choices],
        function(err){ if(err){responsePulse(err,"#f00");} })) {
        return false;
      }

      var submissionState = JSON.parse(JSON.stringify($scope.state));//clone($scope.state);
      if(submissionState.owner) {
        if(submissionState.owner != creatorID) {
          responsePulse("\n\n\nowner does not match! \n"+submissionState.owner+" !=\n"+creatorID,"#f00");
          return false;
          // submissionState.owner = creatorID; // partial user authentication
        }
      } else {
        submissionState.owner = creatorID; // partial user authentication
      }
      // send the data in the HTTP headers as a cookie
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        // clear the data from the cookie once the data is properly sent.
        if (xhr.readyState == 4 && xhr.status == 200) {
          console.log("sent");
          // hide vote button
          var submitButton = ByID("sbmt");
          // submitButton.disabled = true;
          // submitButton.innerHTML = "Thank you for your vote!";
          // create link to results
          try{
            var response = JSON.parse(xhr.responseText);
            responseElement.innerHTML = '<br>Debate number: '+response.id;
            if(!$scope.state.id) {
              var nextLoc = location.protocol+"//"+window.location.host+"/edit/"+response.id;
              $scope.state.id = response.id;
              window.location = nextLoc;
            } else {
              responsePulse("submission received","#0f0");
            }
          }catch(e){
            responseElement.innerHTML = '<br>'+xhr.responseText;
          }
          document.cookie = "debate=";
        }
      };
      xhr.open('post', '');
      var submisison = JSON.stringify(submissionState);
      document.cookie = "debate=" + submisison;
      // console.log("sending "+submisison);
      xhr.send();
    };
  }]);
var insertJSON = function() {
  var code = ByID("jsoninsert").value;
  if(code) {
    var obj = JSON.parse(code);
    var copyObjectProperties = function(srcObj, destObj){
      for(var k in srcObj){
        destObj[k] = srcObj[k];
      }
    };
    copyObjectProperties(obj, SCOPE.state);
    writeStateIntoFields(SCOPE, "SCOPE");
    SCOPE.$digest();
  }
};
