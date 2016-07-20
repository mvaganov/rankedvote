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
  }]);
