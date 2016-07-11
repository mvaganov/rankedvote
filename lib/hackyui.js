
var pulse = function(obj, times, duration){
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

var errorUI = function(objectOfInterest, text, duration){
  pulse(objectOfInterest, 3, 1000);
  validationPopup(objectOfInterest, text, duration);
}

var destroyLineage = function(button, parentCount){
    var offender = button;
    for(var i=0;i<parentCount;++i){
      offender = offender.parentNode;
    }
    if(offender.parentNode)
      offender.parentNode.removeChild(offender);
};
function getOffset( el ) {
  var p = el, _x = 0, _y = 0;
  while( p && !isNaN( p.offsetLeft ) && !isNaN( p.offsetTop ) ) {
    _x += p.offsetLeft - p.scrollLeft;
    _y += p.offsetTop - p.scrollTop;
    p = p.offsetParent;
  }
  return { left: _x, top: _y, right:_x+el.clientWidth, bottom:_y+el.clientHeight };
};

var createCloseButton = function(parentPanel) {
  var xb = document.createElement('button');
  xb.innerText= "X";
  var s = xb.style;
  s.position = "absolute";
  s.right = "2px";
  s.top = "2px";
  s.padding = "1px 4px";
  s.backgroundColor = "transparent";
  s.borderColor = "#f00";
  s.color = "#f00";
  s.borderWidth = "1px";
  s.borderRadius = "10px";
  xb.onclick = function(){destroyLineage(parentPanel, 0);}
  return xb;
}

var createPopup = function(obj, text, maxWidth){
  // TODO find an easy way to use styles from a stylesheet in code?
  var pup = document.createElement('div');
  var s = pup.style;
  s.borderStyle = "solid";
  s.borderWidth = "1px";
  s.verticalAlign = "top";
  s.backgroundColor = "#fff";
  if(maxWidth){ s.maxWidth = maxWidth+"px"; }
  var rootparent = null;
  if(obj){
    s.position = "absolute";
    s.top = (obj.offsetTop + obj.offsetHeight) + "px";
    s.left = obj.offsetLeft + "px";
    rootparent = obj.parentNode;
    while(rootparent && rootparent.parentNode != document.body
    && rootparent.style.position != "fixed"
    && rootparent.style.overflow != "scroll"){
      rootparent = rootparent.parentNode;
//      console.log([rootparent.style],[rootparent])
    }
  }
//  console.log([rootparent.style])
  if(!rootparent){
    rootparent = document.body;
    s.position = "relative";
  }
  rootparent.appendChild(pup);
  var rect = obj.getBoundingClientRect();
  var altPos = getOffset( obj );
  altPos.y += obj.clientHeight;
//objectLerp(obj,altPos,2000,20);
//console.log([obj], ":::", s.left,s.top, ";", rect.left, rect.top, rect.right, rect.bottom, ";", altPos.left, altPos.top);

  var xb = document.createElement('button');
  xb.innerText= "X";
  //s = xb.style;
  //s.position = "absolute";
  //s.right = "2px";
  //s.top = "2px";
  //s.padding = "1px 4px";
  //s.backgroundColor = "transparent";
  //s.borderColor = "#f00";
  //s.color = "#f00";
  //s.borderWidth = "1px";
  //s.borderRadius = "10px";
  //xb.onclick = function(){destroyLineage(pup, 0);}
  //pup.appendChild(xb);
  pup.appendChild(createCloseButton(pup,0));
  //console.log([xb]);

  if(text){
    var mbx = document.createElement('p');
    s = mbx.style;
    mbx.innerHTML= text;
    s.margin = "10px";
    s.marginTop = "0px";
    s.verticalAlign = "top";
    pup.appendChild(mbx);
    //console.log(obj.offsetTop + " " + obj.offsetLeft + " " + obj.offsetHeight);
  }
  return pup;
};

var validationPopup = function(obj, message, maxduration){
  var pup = createPopup(obj, '&#x21e7;'+"<br>"+message, 500);
  if(maxduration >= 0){
    setTimeout(function(){ if(pup){destroyLineage(pup, 0);} }, maxduration);
  }
  if(maxduration >= 500){
    setTimeout(function(){pulse(pup, 1, 1000);}, maxduration-500);
  }
  return pup;
}
var centerPopup = function(text) {
  var pup = createPopup(null, text, 500);

}
