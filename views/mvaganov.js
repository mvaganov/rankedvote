/**
 * Custom functionality written by Michael Vaganov, while learning Node.js and JavaScript
 * MIT License.
 * @module mvaganov
 */
// var mvaganov = require("./mvaganov");
 
var url = require("url");

if (!Date.now) {
    Date.now = function() { return new Date().getTime(); }
}

/**
 * add functionality to the String implementation.... pretty sweet that JavaScript can do this
 */
function addToStrings() {
	"use strict";
	if (typeof String.prototype.startsWith !== 'function') {
		String.prototype.startsWith = function (str) {
			return this.substring(0, str.length) === str; //this.slice(0, str.length) === str;
		}
	}
	if (typeof String.prototype.replaceAll !== 'function') {
		/**
		 * @param {string} str1
		 * @param {string} str2
		 * @param {(boolean|null)} ignore ignore case?
		 * @return {string} a new string, a copy of this one, with all instances of str1 replaced with str2.
		 */
		String.prototype.replaceAll = function(str1, str2, ignore) {
			return this.replace(new RegExp(
				str1.replace(
					/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g, "\\$&"
				),
				(ignore?"gi":"g")),
				(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2
			);
		}
	}
	if (typeof String.prototype.indexOfOneOfThese !== 'function') {
		/**
		 * @param {Array<String>} listOfDelimeters possible string delimeters that are being sought after
		 * @param {number=} start where to start looking in the string
		 * @return {Array<number>} [index that has one of these first, which delimeter was actually found here]. 
		 * if none of these exist, returns [this.length, -1]
		 * return[0] is the index
		 * return[1] is the index of the delimeter that was found
		 */
		String.prototype.indexOfOneOfThese = function (listOfDelimeters, start) {
			var bestIndex = this.length;
			var foundDelimeter = -1;
			if(start == null || start == undefined) start = 0;
			for(var i = 0; i < listOfDelimeters.length; ++i) {
				var index = this.indexOf(listOfDelimeters[i], start);
				if(index >= 0 && index < bestIndex) {
					foundDelimeter  = i;
					bestIndex = index;
				}
			}
			return [bestIndex, foundDelimeter];
		}
	}
	if (typeof String.prototype.splitByOneOfThese !== 'function') {
		/**
		 * @param {Array<String>} listOfDelimeters possible string delimeters that are being sought after
		 * @param {Number} maxSplits how many times to split. will split from left to right. -1 means no limit
		 * @return {Array<String>} as split, except with multiple delimeter tokens
		 */
		String.prototype.splitByOneOfThese = function (listOfDelimeters, maxSplits) {
			if(maxSplits == null) maxSplits = -1;
			var splitted = [], index = 0, whereToSplit, segment, splitCount = 0;
			for(var i = 0; index < this.length; ++i) {
				if(maxSplits >= 0 && splitCount >= maxSplits) {
					whereToSplit = [this.length, -1];
				} else {
					whereToSplit = this.indexOfOneOfThese(listOfDelimeters, index);
				}
				segment = this.slice(index, whereToSplit[0]);
				//console.log("("+index+", "+whereToSplit[0]+"... "+whereToSplit[1]+") ="+segment);
				splitCount++;
				if(segment.length > 0) {
					splitted.push(segment);
				}
				index = whereToSplit[0];
				if(whereToSplit[1] != -1) {
					index += listOfDelimeters[whereToSplit[1]].length;
				}
			}
			return splitted;
		}
	}
	if (typeof String.prototype.splitIntoTable !== 'function') {
		/**
		 * @param {Array<String>} listOfEntryDelimeters example: {@code ["{", "}", ","]}
		 * @param {Array<String>} listOfAssignmentDelimeters example: {@code ["=",":"]}
		 * @return {Object<String,String>} a key/value pair table. see {@link String#prototype#parseCookies} as an example
		 */
		String.prototype.splitIntoTable = function (listOfEntryDelimeters, listOfAssignmentDelimeters) {
			// first, split by entry delimeters
			var entries = this.splitByOneOfThese(listOfEntryDelimeters);
			// then split in half by the assignment delimeter
			var table = {};
			for(var i = 0; i < entries.length; ++i) {
				var pair = entries[i].splitByOneOfThese(listOfAssignmentDelimeters, 1);
				var key = pair[0].trim();
				if(pair.length > 1) {
					table[key] = pair[1].trim();
				} else {
					if(!table[key]) { // don't overwrite good values with bad ones.
						table[key] = null;
					}
				}
			}
			return table;
		}
	}
	if (typeof String.prototype.parseCookies !== 'function') { // TODO make a seperate function, not attached to String
		/** @return {Map<String,String>} a table of cookies parameters, assuming this is formatted like an html cookie. */
		String.prototype.parseCookies = function () {
			return this.splitIntoTable([";"], ["=", ":"]);
		}
	}
	if (typeof String.prototype.getTimestamp !== 'function') { // TODO make a seperate function, not attached to String
		String.prototype.getTimestamp = function() {
			return new Date(parseInt(this.toString().slice(0,8), 16)*1000);
		}
	}
}
addToStrings();

/** debug function */
function printPropertiesOf(obj) {
  for (var k in obj) { if(obj.hasOwnProperty(k)) { log(k+" ("+typeof(obj[k])+"): "+obj[k]); } }
}

/** a list of all of the modules this machine can access, built by the command line "npm ls --json" */
var npmListing = null;
var processStarted = false;
function gatherNpmListing(cb) {
	var callbackTime = 30000; // 30 seconds to attempt the "npm ls --json" call
	setTimeout(function(){
		if(callbackTime) {
			callbackTime = false;
			return cb("'npm ls --json' timed-out");
		}
	}, callbackTime);
	// try to get other installed modules from the npm command line tool
	require("child_process").exec("npm ls --json", function(err, stdout, stderr) {
		if (err) {
			if(callbackTime) {
				callbackTime = false;
				return cb("mvaganov.gatherNpmListing: "+err);
			}
		}
		var npmListing = JSON.parse(stdout);
		var //providesFor = {}, dependsOn = {}, 
		  simpleList = [];
		var nodes = {};
		function addToList(treeNode, dependentName) {
			var dep = treeNode.dependencies;
			// dependsOn[dependentName] = [];
			if(!nodes[dependentName]) {
				nodes[dependentName] = {needs:[], gives:[]};
			}
			if(simpleList.indexOf(dependentName) < 0) { simpleList.push(dependentName); }
			if(dep) {
				for(n in dep){
					if(simpleList.indexOf(n) < 0) { simpleList.push(n); }
					var nod = nodes[dependentName];
					if(nod.needs.indexOf(n) < 0) { nod.needs.push(n); }
					var other = nodes[n];
					if(!other){
						nodes[n] = other = {needs:[], gives:[]};
					}
					if(other.gives.indexOf(dependentName) < 0) { other.gives.push(dependentName); }
					addToList(dep[n], n);
				}
			}
		}
		addToList(npmListing, npmListing.name);

		simpleList.sort(function(a, b) {
			var v = nodes[a].gives.length - nodes[b].gives.length;
			return (v?v:(nodes[b].needs.length - nodes[a].needs.length)); });
		var sortedProvidesFor = {};
		simpleList.forEach(function(item){sortedProvidesFor[item]=nodes[item];});

		simpleList.sort(function(a, b) {
			var v = nodes[a].needs.length - nodes[b].needs.length;
			return (v?v:(nodes[b].gives.length - nodes[a].gives.length)); });
		var sortedDependsOn = {};
		simpleList.forEach(function(item){sortedDependsOn[item]=nodes[item];});

		if(callbackTime) {
			callbackTime = false;
			cb(err, sortedProvidesFor, sortedDependsOn);
		}
	});
}

/** @param {Object} obj print an object as a JSON string, including function code */
function toJSONWithFuncs(obj) {
	Object.prototype.toJSON = function() {
		var sobj = {}, i;
		for (i in this) 
			if (this.hasOwnProperty(i))
				sobj[i] = typeof this[i] == 'function' ? this[i].toString() : this[i];
		return sobj;
	};
	var str = JSON.stringify(obj);
	delete Object.prototype.toJSON;
	return str;
}

/** how deep a tree to show when including the HTML traversal of JavaScriptObjects @type Number */
var maxIndentLevel = 0;
/** if true, will spam the server's console whenever {@link #createReflectedHtmlForJso} is called @type Boolean */
var printInConsole = false;//true;
var showPrivateVariables = true;
var javaScriptObjectTraversalParameter = "jso";

/**
 * creates a simple directory traversal interface using anchor tags 
 * @param {?} obj which object is being traversed (can be any type, including null)
 * @param {?String=} pathStr the path (through parent objects) taken to get here (optional, can be null)
 * @param {Number=} indentLevel used to properly indent, and prevent infinite recursion. limited by {@link #maxIndentLevel} (optional)
 * @return {String} the HTML script that will allow traversal. the key parameter is {@link javaScriptObjectTraversalParameter}
 */
function createReflectedHtmlForJso(obj, pathStr, indentLevel) {
	"use strict";
	var indentation = "", i = 0, j = 0, props = [], functions = [], childText = [], nChildTexts = 0, key, strResult = "";
	// default arguments
	if ( typeof pathStr === 'undefined')		pathStr = "";
	if ( typeof indentLevel === 'undefined')	indentLevel = 0;
	// write the "path" at the top
	if(indentLevel == 0)
	{
		strResult = "\n<h1>@ ";
		var arr = pathStr.split(".");
		for(i = 0; i < arr.length; ++i)
		{
			if(i > 0) strResult += ".";
			strResult += "<a href=\"/?"+javaScriptObjectTraversalParameter+"=";
			for(j = 0; j < i; ++j)
			{
				strResult += arr[j] + ".";
			}
			strResult += arr[i] + "\">"+arr[i]+"</a>";
		}
		strResult += "</h1>\n";
	}
	// for debug output in the console...
	if(printInConsole)
		for(i=0; i < indentLevel; i++)
			indentation = indentation.concat("    ");
	// reflect a JS functions
	if(typeof obj === 'function')
	{
		strResult += "<pre>"+obj.toString()+"</pre>";
		if(printInConsole) console.log(obj.toString());
	}
	// reflect simple types
	else if(typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean')
	{
		strResult += "<b>"+(typeof obj)+"</b> = "+obj+"\n";
		if(printInConsole) console.log((typeof obj)+" = "+obj);
	}
	// reflect objects
	else if(typeof obj === 'object')
	{
		// null objects don't need all of this processing
		if(obj != null)
		{
			// link to the prototype
			if(obj.__proto__) { props.push('__proto__'); }
			if(obj.prototype) { props.push('prototype'); }
			// asks an object for all of it's members
			for(key in obj)
			{
				if(obj.hasOwnProperty(key) && (showPrivateVariables || !key.startsWith('_')))
				{
					if(typeof obj[key] !== 'function')
					{
						if(printInConsole) console.log(indentation+key+" : "+typeof obj[key]+" = "+obj[key]);
						props.push(key);
						if(typeof obj[key] === 'object' 
						&& indentLevel < maxIndentLevel)
						{
							var childStr;
							if(obj[key] == null)
								childStr = "";
							else
								childStr = createReflectedHtmlForJso(obj[key], pathStr+"."+key, indentLevel+1);
							if(indentLevel < maxIndentLevel)
							{
								childText[nChildTexts] = childStr;
								nChildTexts += 1;
							}
						}
					}
					else
					{
						functions.push(key);
					}
				}
			}
			strResult += "<ul>"
			j = 0;
			// print child elements
			for(i = 0; i < props.length; ++i)
			{
				key = props[i];
				strResult += "<li><a href=\"/?"+javaScriptObjectTraversalParameter+"="+pathStr+"."+key+"\">"+key+"</a> : <b>"+(typeof obj[key])+"</b> = <i>"+obj[key]+"</i>";
				// include members from the first tier of child objects
				if(typeof obj[key] === 'object' && obj[key] != null)
				{
					strResult += "["+Object.keys(obj[key]).length+"]";
					if(indentLevel < maxIndentLevel)
					{
						strResult += childText[j];
						j++;
					}
				}
				strResult += "\n";
			}
			for(i = 0; i < functions.length; ++i)
			{
				key = functions[i];
				var codestr = obj[key].toString();
				codestr = codestr.slice(0, codestr.indexOf('{'));
				if(printInConsole) console.log(indentation+key+" : "+typeof obj[key]+" = "+codestr);
				codestr = codestr.replaceAll(" ", "&nbsp");
				codestr = codestr.replaceAll("\n", "<br>");
				strResult += "<li><a href=\"/?"+javaScriptObjectTraversalParameter+"="+pathStr+"."+key+"\">"+key+"</a> : <font face=\"courier\">"+codestr+"</font>\n";
			}
			strResult += "</ul>";
		}
		else
		{
			strResult += "<b>null</b>";
		}
	}
	else
	{
		strResult += "unknown JavaScriptObject<pre>"+obj+"</pre>";
		if(printInConsole) console.log("unknown type ("+(typeof obj)+"): "+obj);
	}
	return strResult;
}

/**
 * @nosideeffects
 * @param {?Object=} obj what object to print out
 * @param {?String=} name how to label this object when printing in the console
 * @param {Number=} depth how many children deep to print out. if null, {@link #maxIndentLevel} is used.
 */
function printReflectionInConsole(obj, name, depth)
{
	if(name != null) {
		console.log("[["+name+"]]");
	}
	var oldMax = maxIndentLevel;
	if(depth != null) {
		maxIndentLevel = depth;
	}
	printInConsole = true;
	createReflectedHtmlForJso(obj);
	printInConsole = false;
	if(oldMax != maxIndentLevel)
	{
		maxIndentLevel = oldMax;
	}
}

function jsoNavigation(nameToEvaluate, localVariables)
{
	var whatObjectToLookAt = null;
	var explicitlyNull = false;
	var strOutput = "";
	var jso = localVariables;
	if(nameToEvaluate != null && nameToEvaluate !== "") {
		try {
			//whatObjectToLookAt = eval(nameToEvaluate); // breaks if member has a strange character in the name
			var p = nameToEvaluate.split('.');
			var cursor = eval(p[0]);
			for(var i = 1; i < p.length; ++i)
			{
				cursor = cursor[p[i]];
			}
			whatObjectToLookAt = cursor;
			//console.log("found <"+nameToEvaluate+">");
			explicitlyNull = true;
		}catch(err){
			console.log("couldn't parse \""+nameToEvaluate+"\" : "+err);
		}
	}
	//console.log(whatObjectToLookAt+" "+explicitlyNull)
	if(whatObjectToLookAt == null && !explicitlyNull)
	{
		strOutput += "<a href=\"/?"+javaScriptObjectTraversalParameter+
			"=jso\">jso</a><br>\n";
		//console.log(strOutput);
	}
	else
	{
		var reflectedString = createReflectedHtmlForJso(whatObjectToLookAt, nameToEvaluate);
		strOutput += reflectedString;
	}
	return strOutput;
}

 /**
 * @param request {HTTPRequest} the HTTP request
 * @param request {HTTPResponse} the HTTP response
 */
function jsoNavHtml(request, response, extraVariableTable)
{
	extraVariables = ["./mvaganov"//, "./router", "./helloserver", "./requesthandler", "./db",
		// "formidable", "express"
		// "http", "fs", "sys", "util", "querystring" // these are in process.moduleLoadList
		];
	// get native modules from 'process'
	var i;
	var loadListModules = process.moduleLoadList;
	var nativeModleLabel = "NativeModule ";
	var entry;
	for(i = 0; i < loadListModules.length; ++i)
	{
		entry = loadListModules[i];
		if(entry.startsWith(nativeModleLabel))
		{
			extraVariables.push(entry.slice(nativeModleLabel.length, entry.length));
		}
	}
	// load the basic (known) modules up...
	var localVariables = {};
	for(i = 0; i < extraVariables.length; ++i)
	{
		var str = extraVariables[i];
		var name = str;
		if(name.startsWith("./"))
		{
			name = name.slice(2, name.length);
		}
		var loadedModule;
		try
		{
			loadedModule = require(str);
		}
		catch(err)
		{
			loadedModule = "ERROR: could not load module."
		}
		localVariables[name] = loadedModule;
	}
	// add the global process, and the request/response of this HTTP event
	localVariables["process"] = process;
	localVariables["request"] = request;
	localVariables["response"] = response;

	if(extraVariableTable) {
		for(var n in extraVariableTable) {
			localVariables[n] = extraVariableTable[n];
		}
	}

	//var q = querystring.parse(request.url);
	var parsedURL = url.parse(request.url);
	var fullpath = parsedURL.path;
	var argsIndex = fullpath.indexOfOneOfThese(['?', '&'])[0];
	//var pathname = fullpath.slice(0, argsIndex);
	var pathargs = fullpath.slice(argsIndex+1, fullpath.length);
	var arguments = pathargs.splitIntoTable(["&", "?"], ["="]);
	//printReflectionInConsole(arguments, "---ARGUMENTS---");
	var nameToEvaluate = arguments[javaScriptObjectTraversalParameter];
//	if(nameToEvaluate != null)
	{
		return jsoNavigation(nameToEvaluate, localVariables);
	}
	return "";
}

/** usage: app.get('/', function(res,req){mvaganov.jsoNav(res,req); res.end();}); // only works at the root. TODO get it working in subdirs. */
function jsoNav(request, response, next)
{
	var htmlOutput = jsoNavHtml(request, response);
	if(htmlOutput && htmlOutput.length > 0)
	{
		//response.setHeader("Content-Type", "text/html");
		response.write(htmlOutput);
		//response.end();
	}
	else
	{
		next();
	}
}

function getIP(req) {
	var ip = req.headers['x-forwarded-for'] || 
	req.connection.remoteAddress || 
	req.socket.remoteAddress ||
	req.connection.socket.remoteAddress;
	return ip;
}

function getLocalServerIP() {
	var os = require('os');
	var ifaces = os.networkInterfaces();
	var data = {};
	Object.keys(ifaces).forEach(function (ifname) {
	  var alias = 0;
	  var addresses = [];
	  ifaces[ifname].forEach(function (iface) {
	    if (//'IPv4' !== iface.family || 
	    	iface.internal !== false) {
	      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
	      return;
	    }
	    addresses.push(iface.address);
	    // if (alias >= 1) {
	    //   // this single interface has multiple ipv4 addresses
	    //   console.log(ifname + ':' + alias, iface.address);
	    // } else {
	    //   // this interface has only one ipv4 adress
	    //   console.log(ifname, iface.address);
	    // }
	    // ++alias;
	  });
	  if(addresses.length) { data[ifname] = addresses; }
	});
	return data;
}

/**
 * @param options {Object} keepWhitespace:(if not true will trim lines),
 */
function serveFileByLine(filepath, options, lineCallback, finalCallback) {
	if(typeof finalCallback !== 'function'){
		console.log("......oh noes..... finalCallback is "+JSON.stringify(finalCallback));
		console.trace("problem with final callback...");
	}
	const fs = require('fs');
	fs.lstat(filepath, function(err, stats) {
		if(err) { 
			console.log("mvaganov.serveFileByLine error "+err); 
			return callback(err);
		}
		function lineReading() {
			var lineReader = require('readline').createInterface({ input: fs.createReadStream(filepath) });
			lineReader.on('line', function (line) {
				if(!options || !options.keepWhitespace) { line = line.trim(); }
				lineCallback(line+((options && options.keepWhitespace)?'\n':'') );
			}).on('close', function() { return finalCallback(null); }).on('error', finalCallback);
		};
		if(stats.isDirectory()) {
			filepath += "/index.html";
	 		lineReading();
		} else if (stats.isFile()) {
			lineReading();
		}
	});
}

/** 
 * app.get('/', 
 	mvaganov.replaceFileTemplate('your/public/html/repo', 
 	{"//TextStartingInlineToReplace": "important text that should be here instead"}, 
 	{
 		maxReplacements:1, // will only do this many search/replaces. if less than 0, there is no limit. default -1.
 		tokenAnywhereInLine:true, // if true, will do search/replace within a line. otherwise, will look for a line starting with a key, and replaces it with it's corresponding value. default false.
 		keepWhitespace:true, // if false, will remove whitespace from beginning and end of lines. default false.
 		callback:null // what callback to run when done. default is function(err) { if(err) throw err; response.end(); }
 	}));
 */
function lineReplaceTemplate(filepath, findReplaceTable, options) {
	var maxReplacements = -1;
	var tokenAnywhereInLine = false;
	var callback = function(err) { if(err) throw err; response.end(); };
	if(options) {
		if(options.maxReplacements) maxReplacements = options.maxReplacements;
		if(options.tokenAnywhereInLine) tokenAnywhereInLine = options.tokenAnywhereInLine;
		if(options.callback) callback = options.callback;
	}
	return function (request, response, next) {
		var replacementCount = 0;
		serveFileByLine(filepath, options, function(line) {
			if(maxReplacements < 0 || replacementCount < maxReplacements) {
				// if a table member is in the line
				for(k in findReplaceTable) {
					var replacement = null;
					var index = -1;
					do {
						if(tokenAnywhereInLine) { index = line.indexOf(k); }
						else if(line.startsWith(k)) { index = 0; }
						//replace it with it's corresponding value
						if(index >= 0) {
							if(!replacement) { replacement = findReplaceTable[k]; }
							if(tokenAnywhereInLine) {
								line = line.substring(0, index) + replacement + line.substring(index+k.length);
							} else {
								line = replacement;
								break;
							}
							replacementCount++;
							if(maxReplacements > 0 && replacementCount >= maxReplacements) break;
						}
					} while(index >= 0);
				}
			}
			// write each line to the response, one line at a time
			response.write(line);
		}, callback);
	};
}

function CachedMadlibs(){}
CachedMadlibs.prototype.initialize = function(fulldata, variableList) {
	var whichVariable = -1, whereIsIt, cursor = 0;
	var  parseData;
	this.parsedData = [];
	var commentTypes = [{start:"<!--", end:"-->"}, {start:"/*",end:"*/"}];
	for(var i=0;i<commentTypes.length;++i) {
		var commentStart = commentTypes[i].start, commentEnd = commentTypes[i].end;
		// if this starts with a comment...
		var firstCommentIndex = fulldata.indexOf(commentStart);
		// console.log("first comment index: "+firstCommentIndex+" for "+this.filepath);
		if(firstCommentIndex == 0) {
			// find the end of the comment and remove it
			var commentEndIndex = fulldata.indexOf(commentEnd);
			// parse that comment as JSON metadata
			var metadata = fulldata.substring(commentStart.length, commentEndIndex);
			try{
				// console.log("FOUND METADATA: "+metadata);
				var result; eval("result="+metadata); this.meta = result;
				// console.log("PARSED METADATA:\n"+JSON.stringify(this.meta, null, 2));
			}catch(err){
				console.log("FAILED TO PARSE METADATA\n"+err+"\n"+metadata);
			}
			// pull the metadata out of the fulldata
			fulldata = fulldata.substring(commentEndIndex+commentEnd.length);
			break;
		}
	}
	if(!variableList) {
		variableList = this.meta.variables;
		if(typeof variableList === 'string') { variableList = [variableList]; }
		if(variableList && variableList.constructor !== Array) {
			variableList = [];
			for(var k in this.meta.variables) { variableList.push(this.meta.variables[k]); }
		}
		self.variableList = variableList;
	}
	if(!variableList) {
		this.parsedData.push(fulldata);
	} else
	// separate out the text from the variables
	do{
		parseData = fulldata.indexOfOneOfThese(variableList, cursor);
		whereIsIt = parseData[0];
		whichVariable = parseData[1];
		if(whichVariable >= 0) {
			var v = variableList[whichVariable];
			var literalText = fulldata.substring(cursor, whereIsIt);
			cursor = whereIsIt+v.length;
			this.parsedData.push(literalText);
			this.parsedData.push(v);
		} else {
			var literalText = fulldata.substring(cursor, fulldata.length);
			this.parsedData.push(literalText);
		}
	} while(whichVariable >= 0);
};
/**
 * @param options {Object} as in #{serveFileByLine}
 */
CachedMadlibs.prototype.initFromFile = function(filepath, variableList, options, callback) {
	var self = this;
	self.filepath = filepath;
	const fs = require('fs');
	fs.lstat(self.filepath, function(err, stats) {
		if(stats) {
			self.mtime = stats.mtime;
			self.variableList = variableList;
			self.options = options;
			var filedata = "";
			serveFileByLine(filepath, options, function(line) {
				filedata+=line; // per line
			}, function(err) {
				if(err) throw err; // on end (or error)
				self.initialize(filedata, variableList);
				if(callback) callback(err);
			});
		} else { callback(err); }
	});
}

CachedMadlibs.prototype.fillOut = function(variables, onComponent, cb) {
	var self = this; // export this to callbacks
	function reloadFileIfNeeded(callback) {
		if(self.mtime || self.filepath) { // if this should be mirroring a file, check if the file has changed.
			const fs = require('fs');
			fs.lstat(self.filepath, function(err, stats) {
				var now = stats.mtime.toString(), then = (self.mtime)?self.mtime.toString():null;
				if(now != then) { // if the file changed, load up the new file, so that next time, this is accurate.
					// console.log("                     RELOADING "+self.filepath);
					self.initFromFile(self.filepath, self.variableList, self.options, callback);
				} else { return callback(null); }
			});
		} else { callback(null); }
	}
	var i=0;
	function writeMadlibs(err) {
		if(err) { return cb(err); }
		do{
			if(i>=self.parsedData.length) { return cb(null); }
			onComponent(self.parsedData[i]);
			i++;
			if(i < self.parsedData.length) {
				var v = self.parsedData[i];
				var result = variables[v];
				i++;
				if(typeof result === 'function') {
					return result(function(err, output){
						if(err) { cb(err); }
						onComponent(output);
						setTimeout(writeMadlibs, 0);
					});
				} else {
					if(!result && typeof result !== 'string') { result = "ERROR: \""+v+"\""; }
					onComponent(result);
				}
			}
		}while(true);
	};
	reloadFileIfNeeded(writeMadlibs);
}

/** TODO reasearch the following

* for a game loop on the server: http://nodejs.org/api/globals.html#globals_settimeout_cb_ms

* for heavy lifty C code, call exec:
function execCbPageTest()
{
	var exec = require("child_process").exec;
	exec("dir", 
		function resultCallBack(error, stdout, stderr)
		{
			if (error !== null) {
				console.log('exec error: ' + error);
			}
			stdout = stdout.toString();
			stdout = stdout.replaceAll("<", "&lt");
			stdout = stdout.replaceAll(">", "&gt");
			response.writeHead(200, {"Content-Type": "text/html"});
			response.write("<pre>"+stdout+"</pre>");
			router.writeHtmlComponents(response, htmlComponentsToAdd);
			response.end();
		}
	);
}

* learn more about Express via this tutorial: http://expressjs.com/guide.html

* define object prototypes by using the prototype keyword, or __proto__ (would that work?)

* events, and event emitters http://www.sitepoint.com/nodejs-events-and-eventemitter/

* https://npmjs.org/browse/keyword/middleware/0/
  * gauth Middleware component to authenticate users through their Google account
  * authenticated ensure a request is authenticated

* JSDocs used by Google:
  https://developers.google.com/closure/compiler/docs/js-for-compiler#tags
  http://google-styleguide.googlecode.com/svn/trunk/javascriptguide.xml?showone=Comments#Comments

  
* modules to check out
  socket.io - real-time network communication
  request - simplified http reqeust client. has authentication, and other cool stuff?
  grunt - large scale automation
  mocha - testing framework
  async - more powerful asynchronous tools & structures for node.js
  mongoose - ORM (object relational managed) database
  passport - simple authentication for node.js

* modules that seem bad
  redis - big fancy data structure store... like a global variables crutch?
*/
exports.jsoNav = jsoNav;
exports.jsoNavHtml = jsoNavHtml; // TODO make a more modular explorer of this. maybe just a big branching table?

exports.jsoNavigation = jsoNavigation; // TODO remove exposure of this
exports.createReflectedHtmlForJso = createReflectedHtmlForJso; // TODO remove exposure of this

exports.gatherNpmListing = gatherNpmListing;

exports.printReflectionInConsole = printReflectionInConsole;
exports.logjso = printReflectionInConsole;
exports.toJSONWithFuncs = toJSONWithFuncs;
exports.getIP = getIP;
exports.lineReplaceTemplate = lineReplaceTemplate;
exports.CachedMadlibs = CachedMadlibs;
exports.printPropertiesOf = printPropertiesOf;
exports.serveFileByLine = serveFileByLine;
exports.getLocalServerIP = getLocalServerIP;
