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
    $scope.state = RankedVote_servedData;
    var v = $scope.state.debates;
    for(var i=0;i<v.length;++i){
      if(!(v[i].name)) {
        v[i].name = v[i].did;
      }
    }
    if(!creatorID || creatorID == "0") {
      console.log("!!!");
      var newDeb = ByID("newdebates");
      newDeb.style.visibility = 'none';
    }
    // console.log("??? "+JSON.stringify($scope.state, null, 2));
  }]);
