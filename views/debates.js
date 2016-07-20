var SCOPE;

function convertToDate(utcTime) {
  var d = new Date(0); // The 0 there is the key, which sets the date to the epoch
  var utcSeconds = Number(utcTime) / 1000;
  d.setUTCSeconds(utcSeconds);
  var str = d.toString();
  var i = str.indexOf("GMT");
  return str.substring(0,i-1);
}

angular.module('vote', [])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
    $scope.convertToDate = convertToDate;
    $scope.state = RankedVote_servedData;
  }]);
