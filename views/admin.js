var SCOPE;

function convertToDate(utcTime) {
  var d = new Date(0); // The 0 there is the key, which sets the date to the epoch
  var utcSeconds = Number(utcTime) / 1000;
  d.setUTCSeconds(utcSeconds);
  var str = d.toString();
  var i = str.indexOf("GMT");
  return str.substring(0,i-1);
}

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

angular.module('vote', [])
  .controller('voteController', ['$scope', function ($scope) {
    SCOPE = $scope;
    $scope.convertToDate = convertToDate;
    $scope.state = RankedVote_servedData;
    $scope.beUser = function (vid) {
      console.log("VID: "+vid);

      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        // clear the data from the cookie once the data is properly sent.
        if (xhr.readyState == 4 && xhr.status == 200) {
          // hide vote button
          // create link to results
          try{
            //var response = JSON.parse(xhr.responseText);
            responsePulse(xhr.response, '#000');
          }catch(e){
            // var redirectHead = "redirect:";
            // if(xhr.responseText.startsWith(redirectHead)) {
            //   window.location = xhr.responseText.substring(redirectHead.length);
            //   return;
            // }
            // responsePulse(xhr.responseText, '#f00');
          }
          // document.cookie = "rank=";
        }
      };
      var posturl = '/admin/'+vid;
      console.log("posting to "+posturl);
      xhr.open('post', posturl);
      // var submisison = JSON.stringify(submissionState);
      // document.cookie = "rank=" + submisison;
      xhr.send();
    };
  }]);
