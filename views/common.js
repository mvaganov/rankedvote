var ByID = function(eid) { return document.getElementById(eid); }
var LOADING_ELEMENT = null;
function showLoadingElement(on_off) {
	if(!document.body){ return setTimeout(function(){showLoadingElement(on_off);},1); }
	if(on_off) {
		if(LOADING_ELEMENT) {
			LOADING_ELEMENT.style.visibility = undefined;
		} else {
			LOADING_ELEMENT = document.createElement('div');
			LOADING_ELEMENT.id = 'loading';
			LOADING_ELEMENT.className = "loading";
			console.log(LOADING_ELEMENT);
			document.body.appendChild(LOADING_ELEMENT);
		}
	} else if(LOADING_ELEMENT) {
		LOADING_ELEMENT.style.visibility = 'none';
	}
}
window.onbeforeunload = function(){ showLoadingElement(true); };