var SCOPE;

function setStyle(property, value, element_ids) {
  for(var i=0;i<element_ids.length;++i){
    var e = ByID(element_ids[i]);
    e.style[property] = value;
  }
};

angular.module('vote', ['ng-sortable'])
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
    // check if there is data in the cookie.
    var cookieTable = parseCookies(document.cookie);
    if(cookieTable.debate) {
      $scope.state = JSON.parse(cookieTable.debate);
    }
    writeStateIntoFields($scope.state, "STATE");
    $scope.refresh = function(){
      var specialCodeInput = ByID("jsoninsert");
      specialCodeInput.value = JSON.stringify($scope.state, null, 2);
    };
    $scope.refresh();
    $scope.submit = function() {
      // TODO logic to ensure IDs are unique, and less than 16 characters long.
      var submissionState = clone($scope.state);
      if(submissionState.owner) {
        if(submissionState.owner != creatorID) {
          console.log("\n\n\nowner does not match! \n"+submissionState.owner+" !=\n"+creatorID);
          console.log("forcing to correct user.");
          submissionState.owner = creatorID; // partial user authentication
        }
      } else {
        console.log("brand new entry!");
        submissionState.owner = creatorID; // partial user authentication
      }
      // send the data in the HTTP headers as a cookie
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        // clear the data from the cookie once the data is properly sent.
        if (xhr.readyState == 4 && xhr.status == 200) { document.cookie = "debate="; }
      };
      xhr.open('post', '');
      var submisison = JSON.stringify(submissionState);
      document.cookie = "debate=" + submisison;
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
    writeStateIntoFields($scope.state, "STATE");
    SCOPE.$digest();
  }
};
