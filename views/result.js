var SCOPE;

var show = function(elementIndex) {
  // check if this image has already been generated
  if(SCOPE.generated[elementIndex]) {
    // if it has, toggle hide/show
    var vis = SCOPE.generated[elementIndex].style.display;
    SCOPE.generated[elementIndex].style.display = (!vis || vis!='none')?'none':'inline';
  }
  // if it has not
  else {
    // get the element "e$index"
    SCOPE.generated[elementIndex] = ByID("e"+elementIndex);
    if(SCOPE.generated[elementIndex]){
      // append the image generated from $scope.result[index] to it
      IRV_deserializeVisualizationBlocData(SCOPE.state.result[elementIndex].showme, 0, 0, 500, -1, SCOPE.generated[elementIndex]);
    }
  }
}

angular.module('vote', ['ngSanitize'])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
    $scope.show = show;
    $scope.state = RankedVote_servedData;
    $scope.generated = {};
    var deserialized;
    for(var i=0;i<$scope.state.result.length;++i) {
      eval("deserialized="+$scope.state.result[i].showme);
      $scope.state.result[i].showme = deserialized;
    }
    setTimeout(function(){show(0)},0);
  }]);
