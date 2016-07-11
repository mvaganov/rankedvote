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
            console.log("bringing back ",[target])
            errorUI(target, "required.", 2000);
          }, .01);
        }
      }
    };
//    $scope.state = state;
//    loadState(window.location.href, $scope.state);
//    writeStateIntoFields($scope.state);
    if(RankedVote_servedData) {
      $scope.state = RankedVote_servedData;
    } else {
      $scope.state = {
        votes : [
          {id:"0", did:"3", vid:"0", data:{rank:["0","1","2"]}, name:"test"},
          {id:"1", did:"4", vid:"0", data:{rank:["0","1","2"]}, name:"another vote"},
          {id:"2", did:"5", vid:"0", data:{rank:["0","1","2"]}},
          {id:"3", did:"6", vid:"0", data:{rank:["0","1","2"]}}
        ]
      };
    }
    console.log(">>>>> "+JSON.stringify($scope.state));
    var v = $scope.state.votes;
    for(var i=0;i<v.length;++i){
      if(!(v[i].name)) {
        v[i].name = v[i].did;
      }
    }
    console.log("!!! "+JSON.stringify($scope.state));
  }]);
