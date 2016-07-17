var SCOPE;

function setStyle(property, value, element_ids) {
  for(var i=0;i<element_ids.length;++i){
    var e = ByID(element_ids[i]);
    e.style[property] = value;
  }
};

function generateIdentifiers(state) {
  function generateIDForGroup(list) {
    var MAX_ID_LENGTH = 32;
    var htmlTagForChoices = [];
    function truncateText(text, MAX_ID_LENGTH) {
      var chopIndex = text.indexOf('\n');
      if(chopIndex >= 0) {
        text = text.substring(0, chopIndex);
      }
      if(text.length > MAX_ID_LENGTH) {
        chopIndex = MAX_ID_LENGTH;
        for(var j=MAX_ID_LENGTH;j>=0;--j){
          if(' \t\r'.indexOf(text[j]) >= 0) {
            chopIndex = j;
            break;
          }
        }
        text = text.substring(0, chopIndex);
      }
      return text;
    }
    for(var i=0;i<list.length;++i) {
      var choiceHtmlTags = [];
      var text = separateTextAndHtml(list[i][1], choiceHtmlTags);
      if(text) {
        text = truncateText(text, MAX_ID_LENGTH);
        list[i][0] = text;
      }
      htmlTagForChoices.push(choiceHtmlTags);
    }
    function getBestNameFrom(listOfElements) {
      var bestNamePropertyOrder = ["alt", "title", "text", "name", "value", "id", "src", "href", "class", "style", "type"];
      var name = null;
      console.log("~~~"+JSON.stringify(listOfElements));
      for(var i=0;i<listOfElements.length;++i) {
        for(var j=0;j<bestNamePropertyOrder.length;++j){
          var prop = bestNamePropertyOrder[j];
          if(listOfElements[i][ prop ]) {
            name = listOfElements[i][ prop ];
            name.trimTokens([" ","\n","\r","\t"]);
          }
          if(name) { break; }
        }
        if(name) { break; }
      }
      return name;
    }
    // var newIDs = Array(list.length);
    for(var i=0;i<list.length;++i) {
      if(!list[i][0] || list[i][0].length == 0) {
        if(htmlTagForChoices[i] && htmlTagForChoices[i].length) {
          console.log("TODO: element "+i+" should be named with "+JSON.stringify(htmlTagForChoices[i]));
          // newIDs[i]
          list[i][0] = getBestNameFrom(htmlTagForChoices[i]);
          // console.log("BESTNAME: "+list[i][0]);
        }
      }
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
      specialCodeInput.value = JSON.stringify($scope.state, null, 2);
    };
    $scope.refresh();
    $scope.submit = function() {
      if(!$scope.state.title || !$scope.state.title.length) {
        console.log("missing title");
        return false;
      }
      if($scope.choiceID == "none") {
        // generate IDs based on descriptions
        generateIdentifiers($scope.state);
      }
      if(!irv_validateCandidates([$scope.state.data.candidates, $scope.state.data.choices],
        function(err){if(err){console.warn(err);}})) {
        console.log("failed validation");
        return false;
      }

      var submissionState = JSON.parse(JSON.stringify($scope.state));//clone($scope.state);
      if(submissionState.owner) {
        if(submissionState.owner != creatorID) {
          console.log("\n\n\nowner does not match! \n"+submissionState.owner+" !=\n"+creatorID);
          return false;
          // console.log("forcing to correct user.");
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
          submitButton.disabled = true;
          submitButton.innerHTML = "Thank you for your vote!";
          // create link to results
          var responseElement = ByID("response");
          try{
            var response = JSON.parse(xhr.responseText);
            responseElement.innerHTML += '<br>Debate number: '+response.id;
          }catch(e){
            responseElement.innerHTML += '<br>'+xhr.responseText;
          }
          document.cookie = "debate=";
        }
      };
      xhr.open('post', '');
      var submisison = JSON.stringify(submissionState);
      document.cookie = "debate=" + submisison;
      console.log("sending "+submisison);
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
