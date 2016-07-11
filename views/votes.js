var SCOPE;

angular.module('vote', [])
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
  }]);