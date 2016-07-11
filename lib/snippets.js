var ByID = function(eid) { return document.getElementById(eid); }

function strStartsWith (string, prefix) {
  return string.slice(0, prefix.length) == prefix;
}


var arrayContains = function(needle, arrhaystack) {
  return (arrhaystack.indexOf(needle) > -1);
}

// copy all properties from the source object into the destination object. properties in destination can be overwritte, but not deleted.
var copyObjectProperties = function(srcObj, destObj){
  for(var k in srcObj){
    destObj[k] = srcObj[k];
  }
};

function setStyle(property, value, element_ids) {
  for(var i=0;i<element_ids.length;++i){
    var e = ByID(element_ids[i]);
    e.style[property] = value;
  }
};

function clone(item) {
  if (!item) { return item; } // null, undefined values check
  var types = [ Number, String, Boolean ], result;
  // normalizing primitives if someone did new String('aaa'), or new Number('444');
  types.forEach(function(type) {
    if (item instanceof type) {
      result = type( item );
    }
  });
  if (typeof result == "undefined") {
    if (Object.prototype.toString.call( item ) === "[object Array]") {
      result = [];
      item.forEach(function(child, index, array) { 
        result[index] = clone( child );
      });
    } else if (typeof item == "object") {
      // testing that this is DOM
      if (item.nodeType && typeof item.cloneNode == "function") {
          var result = item.cloneNode( true );    
      } else if (!item.prototype) { // check that this is a literal
        if (item instanceof Date) {
            result = new Date(item);
        } else {
          // it is an object literal
          result = {};
          for (var i in item) {
            result[i] = clone( item[i] );
          }
        }
      } else {
        // depending what you would like here,
        // just keep the reference, or create new object
        if (false && item.constructor) {
          // would not advice to do that, reason? Read below
          result = new item.constructor();
        } else {
          result = item;
        }
      }
    } else {
      result = item;
    }
  }
  return result;
}

