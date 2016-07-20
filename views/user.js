var SCOPE;

angular.module('vote', [])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
    $scope.state = RankedVote_servedData;
  }]);
