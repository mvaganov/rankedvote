function getOffset( el ) {
  var p = el, _x = 0, _y = 0;
  while( p && !isNaN( p.offsetLeft ) && !isNaN( p.offsetTop ) ) {
    _x += p.offsetLeft - p.scrollLeft;
    _y += p.offsetTop - p.scrollTop;
    p = p.offsetParent;
  }
  return { left: _x, top: _y, right:_x+el.clientWidth, bottom:_y+el.clientHeight };
};
/**
https://gist.github.com/rgrove/5463265
Returns a bounding rect for _el_ with absolute coordinates corrected for
scroll positions.
The native `getBoundingClientRect()` returns coordinates for an element's
visual position relative to the top left of the viewport, so if the element
is part of a scrollable region that has been scrolled, its coordinates will
be different than if the region hadn't been scrolled.
This method corrects for scroll offsets all the way up the node tree, so the
returned bounding rect will represent an absolute position on a virtual
canvas, regardless of scrolling.
@method getAbsoluteBoundingRect
@param {HTMLElement} el HTML element.
@return {Object} Absolute bounding rect for _el_.
**/

function getAbsoluteBoundingRect (el) {
    var doc  = document,
        win  = window,
        body = doc.body,
        // pageXOffset and pageYOffset work everywhere except IE <9.
        offsetX = win.pageXOffset !== undefined ? win.pageXOffset :
            (doc.documentElement || body.parentNode || body).scrollLeft,
        offsetY = win.pageYOffset !== undefined ? win.pageYOffset :
            (doc.documentElement || body.parentNode || body).scrollTop,
        rect = el.getBoundingClientRect();
    if (el !== body) {
        var parent = el.parentNode;
        // The element's rect will be affected by the scroll positions of
        // *all* of its scrollable parents, not just the window, so we have
        // to walk up the tree and collect every scroll offset. Good times.
        while (parent !== body) {
            offsetX += parent.scrollLeft;
            offsetY += parent.scrollTop;
            parent   = parent.parentNode;
        }
    }
    return {
        bottom: rect.bottom + offsetY,
        height: rect.height,
        left  : rect.left + offsetX,
        right : rect.right + offsetX,
        top   : rect.top + offsetY,
        width : rect.width
    };
}

var vec_magnitude=function(vec) {  return  Math.sqrt(vec.left*vec.left + vec.top*vec.top); };
var vec_divide  =function(vec, scalar){ return {left:vec.left/scalar,top:vec.top/scalar}; };
var vec_multiply=function(vec, scalar){ return {left:vec.left*scalar,top:vec.top*scalar}; };
// rect must have left/top. if rect does not have right/bottom, it must have width/height
var rectLerp = function(obj, rect, endopacity, duration, fps, donefunction){
  // do math to determine how the object rectangle should interpolate
  var delayBetweenFrames = 1000/fps;
  var o = getOffset(obj);
  var whatToDoWhenFinished = function() {
    obj.style.left = rect.left+"px";
    obj.style.top = rect.top+"px";
    obj.style.right = rect.right+"px";
    obj.style.bottom = rect.bottom+"px";
    obj.style.opacity = endopacity;
    if(donefunction){setTimeout(donefunction(), delayBetweenFrames);}
  };
  if(delayBetweenFrames < duration) {
    var frameCount = duration/delayBetweenFrames;
    var TLd = {left:rect.left-o.left, top:rect.top-o.top};
    var BRd = {left:rect.right-o.right, top:rect.bottom-o.bottom};
    if(TLd.left != 0 || TLd.top != 0 || BRd.left != 0 || BRd.top != 0 || endopacity != startopacity) { 
      // determine how far the top-left and bottom-right corners need to move
      var TLmag = vec_magnitude(TLd);
      var TLdir = vec_divide(TLd,TLmag);
      var TLdistEachFrame = TLmag / frameCount;
      var TLmoveEachFrame = vec_multiply(TLdir, TLdistEachFrame);
      var BRmag = vec_magnitude(BRd);
      var BRdir = vec_divide(BRd,BRmag);
      var BRdistEachFrame = BRmag / frameCount;
      var BRmoveEachFrame = vec_multiply(BRdir, BRdistEachFrame);
      var iterations = 0;
      // determine how much the opacity needs to change
      var startopacity = obj.style.opacity;
      var diffOp = (endopacity - startopacity);
      var opacityEachFrame = diffOp / frameCount;
      var lerpMotion= function(){
        o.left += TLmoveEachFrame.left;
        o.top += TLmoveEachFrame.top;
        o.right += BRmoveEachFrame.left;
        o.bottom += BRmoveEachFrame.top;
        obj.style.left = o.left+"px";
        obj.style.top = o.top+"px";
        obj.style.width = (o.right-o.left)+"px";
        obj.style.height = (o.bottom-o.top)+"px";
        var sum = obj.style.opacity+opacityEachFrame;
        obj.style.opacity = parseFloat(obj.style.opacity)+opacityEachFrame;
        iterations++;
        if(iterations < frameCount){
          setTimeout(lerpMotion, delayBetweenFrames);
        } else {
          setTimeout(whatToDoWhenFinished, delayBetweenFrames);
        }
      };
      lerpMotion();
    } else {
        setTimeout(whatToDoWhenFinished, duration);
    }
  } else {
    setTimeout(whatToDoWhenFinished, duration);
  }
};

var isRunningDragTutorial = false;
/**
* @param choiceSource the container of options to select
* @param choiceDestination where options go to be selected (and sorted)
* @param hand the element with the hand icon
* @param demotag the element that will be the wireframe demonstration
*/
var dragTutorial = function(choiceSource, choiceDestination, hand, demotag) {
  // if the animation is already running, or either param is null, return
  if(isRunningDragTutorial || !choiceSource || !choiceDestination || !choiceSource.childNodes.length) return;
  isRunningDragTutorial = true;
  // find the location of the choice destination, that is the destination rectangle
  var destRect = getAbsoluteBoundingRect(choiceDestination);
  console.log(choiceSource.childNodes);
  // find the first element in choiceSource
  var i=0;
  while(!choiceSource.childNodes[i] || !choiceSource.childNodes[i].getBoundingClientRect) {i++;}
  var firstElement = choiceSource.childNodes[i];
  // that is the moved-element rectangle
  var rectStart = getAbsoluteBoundingRect(firstElement);
  // calculate the rectangle at the top of the destination rectangle that is the height of the source rectangle
  var rectFinal = {top:destRect.top, left:destRect.left, right:destRect.right,
    bottom:destRect.top+rectStart.height, width:destRect.width, height:rectStart.height};
  // interpolate...
  var cStart = {x:(rectStart.left+rectStart.right)/2, y:(rectStart.top+rectStart.bottom)/2};
  var cFinal = {x:(rectFinal.left+rectFinal.right)/2, y:(rectFinal.top+rectFinal.bottom)/2};
  var delta = {x:cFinal.x-cStart.x,y:cFinal.y-cStart.y};
  var rectEnd = {
    bottom: rectStart.bottom + delta.y,
    height: rectStart.height,
    left  : rectStart.left + delta.x,
    right : rectStart.right + delta.x,
    top   : rectStart.top + delta.y,
    width : rectStart.width
  };
  var relPtr = {x:.40,y:.05};
  var hSize = {w:400,h:400};
  var hPtrOffset = {
    left:-hSize.w*relPtr.x,
    right:hSize.w*(1-relPtr.x),
    top:-hSize.h*relPtr.y,
    bottom:hSize.h*(1-relPtr.y)
  };
  var s = hand.style;
    s.left="0px";
    s.top="-100px";
    s.width="1000px";
    s.height="1000px";
    s.display="inline";
    s.opacity=0;
  s = demotag.style;
    s.left = rectStart.left+"px";
    s.top = rectStart.top+"px";
    s.width = rectStart.width+"px";
    s.height = rectStart.height+"px";
    s.opacity=0;
    s.display="inline";
  var handStart = {
    left:cStart.x+hPtrOffset.left,
    right:cStart.x+hPtrOffset.right,
    top:cStart.y+hPtrOffset.top,
    bottom:cStart.y+hPtrOffset.bottom
  };
  var handFinish = {
    left:cFinal.x+hPtrOffset.left,
    right:cFinal.x+hPtrOffset.right,
    top:cFinal.y+hPtrOffset.top,
    bottom:cFinal.y+hPtrOffset.bottom
  };
  rectLerp(hand, handStart, .9,1000,40,function() {
      rectLerp(demotag,rectStart,1,400,40,null);
      var dragTime = 1000;
      setTimeout(function(){
          rectLerp(hand,handFinish,.9,dragTime,40,null);
          rectLerp(demotag,rectEnd,1,dragTime,40,function(){
            rectLerp(demotag,rectFinal,1,200,40,function(){
              rectLerp(hand,{left:-400,top:100,right:1000,bottom:1500},0,400,40,function(){
                rectLerp(demotag,rectFinal,0,200,40,function(){
                  hand.style.display="none";
                  demotag.style.display="none";
                  isRunningDragTutorial = false;
                });
              });
            });
          });
        }, 500
      );
  });
};
