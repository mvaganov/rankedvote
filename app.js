// Apache 2.0 License - 2016, Michael Vaganov
// author: mvaganov@shschools.org
// Based on work by Google, Inc at https://github.com/GoogleCloudPlatform/nodejs-getting-started.git
'use strict';

var express = require('express');
var app = express();
var config = require('./config');

var IS_DEBUG = config.get('rankedvote_debug') == true;

var path = require('path');
var session = require('express-session');
var passport = require('passport');
var waterfall = require('async-waterfall');
var irv = require('./views/irv');
var irv_validateCandidates = require('./views/irv_validate');
var mvaganov = require('./views/mvaganov');

var MemcachedStore = require('connect-memcached')(session);
var gcloud = require('gcloud');
var ds = gcloud.datastore({ projectId: config.get('GCLOUD_PROJECT') });


var MUST_HAVE_VAR_GROUP = {};
function MUST_HAVE_VAR(varname, varGroup, cb) {
  if(!cb) { cb = function(err) { if(err) { console.log("ERROR MUST_HAVE_VAR: "+JSON.stringify(err)); } } }
  var result = config.get(varname);
  if(!result || !result.length) {
    cb("app.js requires config.json contain '"+varname+"'");
  }
  if(varGroup){
    if(!MUST_HAVE_VAR_GROUP[varGroup]) {
      MUST_HAVE_VAR_GROUP[varGroup] = [];
    } else if(MUST_HAVE_VAR_GROUP[varGroup].indexOf(result) >= 0) {
      cb("'"+varname+" must have a unique value. '"+result+"' already taken.");
    }
    MUST_HAVE_VAR_GROUP[varGroup].push(result);
  }
  cb(null, result);
  return result;
}

var variablesOutput = "";
function gatherVariablesOutput(err) {if(err){variablesOutput+='\n'+err;} }

var T_VOTE = MUST_HAVE_VAR('TABLE_VOTE','db',gatherVariablesOutput);
var T_VOTER = MUST_HAVE_VAR('TABLE_VOTER','db',gatherVariablesOutput);
var T_DEBATE = MUST_HAVE_VAR('TABLE_DEBATE','db',gatherVariablesOutput);
var T_DEBATE_ENTRY = MUST_HAVE_VAR('TABLE_DEBATE_ENTRY','db',gatherVariablesOutput);
var T_DEBATE_RESULT = MUST_HAVE_VAR('TABLE_DEBATE_RESULT','db',gatherVariablesOutput);

function log(str) { if(IS_DEBUG) console.log(str); }

app.disable('etag');
//app.set('views', path.join(__dirname, 'app'));
app.set('trust proxy', true);

var memStore = null; // what memory store is being used to cache datastore queries
// [START session]
// Configure the session and session storage.
var sessionConfig = {
  resave: false,
  saveUninitialized: false,
  secret: config.get('SECRET'),
  signed: true
};

if (config.get('NODE_ENV') === 'production' ) {
  var memcachedAddr = process.env.MEMCACHE_PORT_11211_TCP_ADDR || 'localhost';
  var memcachedPort = process.env.MEMCACHE_PORT_11211_TCP_PORT || '11211';
  var memcacheCon = memcachedAddr + ':' + memcachedPort;
  log("connecting to memcache at "+memcacheCon);
  memStore = new MemcachedStore({ hosts: memcacheCon });
  sessionConfig.store = memStore;
}

if(IS_DEBUG) app.use(function (req,res,next){
  if(req.url.indexOf("_ah") < 0) { // hide noisy health checks
    log("["+req.method+"] "+req.url);
  }
  next();
});
function addSpecialOutputFails(res, fail) {
  if(!res.specialOutput.fails)
    res.specialOutput.fails = [];
  res.specialOutput.fails.push(fail);
}
var TIMEOUT_WATCHER = null;
function timedRouter(router, routerCode, maxTimeout) {
  maxTimeout = maxTimeout || 7000;
  return function (req,res,next) {
    var startTime = Date.now();
    TIMEOUT_WATCHER = routerCode;
    setTimeout(function() {
      if(TIMEOUT_WATCHER == routerCode) {
        addSpecialOutputFails(res, "router: "+routerCode);
        log("router '"+routerCode+"' failed to finish in "+maxTimeout+"ms");
        TIMEOUT_WATCHER = null;
        next();
      }
    }, maxTimeout);
    router(req,res,function(){
      var elapsed = Date.now() - startTime;
      if(TIMEOUT_WATCHER == routerCode) { TIMEOUT_WATCHER = null; next(); } else {
        log("finished '"+routerCode+"' after "+elapsed+"ms, for "+req.url+". ignored.");
      }
    });
  }
}

function END(req,res, resEnd) {
  // TODO if the error massage for elapsed database token is received, trace up, find out where it is found, and put a refreshDEBAuthIfNeeded there.
  log("[/"+req.method+"] "+req.url+(resEnd?(" "+JSON.stringify(resEnd)):""));
  if(resEnd && typeof resEnd !== 'string') {
    resEnd = JSON.stringify(resEnd);
  }
  res.end(resEnd);
}

// what to do with google health checks? ignore them?
app.get('/_ah/health', function(req,res,next){ END(req,res); });
app.get('/_ah/start', function(req,res,next){ END(req,res); });

function FILE (req, res, next) {
  // file serve ONLY. if the file isn't there, just end the connection.
  express.static('views')(req,res,function (){END(req,res);})
}

// reasy stuff to handle
app.get('/*.js', FILE);
app.get('/*.css', FILE);
app.get('/*.png', FILE);
app.get('/*.jpg', FILE);
app.get('/*.ico', FILE);
app.get('/*.gif', FILE);
// stuff to ignore
//app.get('/*.js.map', express.static('views'));
app.get('/*.js.map', function(req,res,next){END(req,res);});
app.get(['*{{*', '*%7b%7b*'], function(req,res, next){ log("angular variable bug..."); END(req,res); })

// prep for special output
app.use(function(req,res,next){res.specialOutput={};next();});

var rand_memcache;
function GetMemCache() {
  if(!rand_memcache) {
    var memcachedAddr = process.env.MEMCACHE_PORT_11211_TCP_ADDR || 'localhost';
    var memcachedPort = process.env.MEMCACHE_PORT_11211_TCP_PORT || '11211';
    var Memcached = require('memcached');
    rand_memcache = new Memcached(memcachedAddr + ':' + memcachedPort);
  }
  return rand_memcache
}
app.get('/rand', function (req, res, next) {
  var mem = GetMemCache();
  mem.get('foo', function (err, value) {
    if (err) { return next(err); }
    if (value) { return res.status(200).send('Value: ' + value); }
    mem.set('foo', Math.random(), 10, function (err) {
      if (err) { return next(err); }
      return res.redirect('/rand');
    });
  });
});

app.use(
  timedRouter(
    session(sessionConfig)
  ,"session(config)")
);
// [END session]

// OAuth2 --THANKS GOOGLE!
app.use(
  timedRouter(
    passport.initialize()
  ,"passport.initialize")
);
app.use(
  timedRouter(
    passport.session()
  ,"passport.session")
);

// TODO cache the require call?
app.use(
  timedRouter(
    require('./lib/oauth2').router
  ,"lib/oauth2")
); // handle the authentication heavy lifting plz k thx

function refreshDBAuthIfNeeded(req, res, cb) {
  if(req.session && !req.session.dbAuthExpire) {
    req.session.dbAuthExpire = Date.now() + 60000;
    cb();
  } else if(req.session && req.session.dbAuthExpire < Date.now()) {
    // log("DB AUTH IN "+(req.session.dbAuthExpire - Date.now()));
    //DS_refreshSession(function(){next()});
    // making any database call after the auth expires will reset the auth token for the database
    GetVoter(req,res,function () {
      req.session.dbAuthExpire = Date.now() + 60000;
      cb();
    }, true); // force voter pull from database
  } else { cb(); }
}

function DS_ensureSession(callback) {
  var failCount = 0;
  var errorCheck = function(err) {
    failCount++;
    // on a 503 error, try again. at least once.
    if(typeof err === 'object' && err.code == 503 && failCount <= 1) {
      setTimeout(function(){callback(errorCheck);},1);
      return true;
    }
    return false;
  };
  callback(errorCheck);
} // <-- TODO use this instead?
app.use(function (req,res,next) { refreshDBAuthIfNeeded(req,res, next); });

/** @return the user ID from the OAuth2 passport, null if not logged in */
function GetUserID(req) {
  if(req.session && req.session.passport && req.session.passport.user && req.session.passport.user.id)
    return req.session.passport.user.id.toString();
  return null;
}
function getForcedLoginUrl(req) { return "/auth/login?return="+encodeURIComponent(req.originalUrl); }
/** redirects the user to login using google OAuth2 */
function forceUserLogin(req, res) {
  // login, and return to this page when finished.
  res.redirect(getForcedLoginUrl(req));
}
/** */
function ensureLoginGET(req, res) {
  var gid = GetUserID(req);
  if(gid == null) { return forceUserLogin(req, res); }
  return gid;
}

function GetVoter_Filter(err, voterEntry, cb, getTrueVoter) {
  if(voterEntry.data.admin && !getTrueVoter) {
    if(typeof voterEntry.data.admin === 'object') {
      return cb(err, voterEntry.data.admin);
    }
  }
  return cb(err, voterEntry);
}

/** 
 * @param cb {function(err, voterRecord)}
 * @param FORCED if true, will force a database call
 */
function GetVoter(req, res, cb, FORCED, getTrueVoter) {
  var userID = GetUserID(req);
  if(!userID) {return cb(null,null);}
  if(!req.session) {return cb("missing session");}
  if(!req.session.rankedvote) { req.session.rankedvote = {}; }
  if(req.session.rankedvote.voter && !FORCED
  && req.session.rankedvote.voter.email == req.session.passport.user.email) {
    return GetVoter_Filter(null, req.session.rankedvote.voter, cb, getTrueVoter); // cached voter
  }
  //log("getting voter ID for "+userID);
  if(userID !== null) {
    var filter = {'email': req.session.passport.user.email};
    if(FORCED) { filter.FORCED = true; }
    DS_listBy (T_VOTER, filter, 1, null, function (err, entities, cursor) {
      if (err) { log("GetVoter Error: "+err); return cb(err, null); }
      if(!entities || entities.length == 0) {
        //log("voter record for "+userID+" does not exist. creating...");
        var dat = {
          gid: userID,
          email: req.session.passport.user.email,
          name: req.session.passport.user.displayName,
          data: {pic:req.session.passport.user.image}, // TODO timestamp vote (timestamp+1m), debate (timestamp+1h), edit debate (timestamp+1m), user update (timestamp+1m)
        };
        DS_update(T_VOTER, null, dat, function (err, entity) {
          req.session.rankedvote.voter = entity;
          return GetVoter_Filter(err, entity, cb, getTrueVoter);
        });
      } else {
        var err = null;
        if(entities.length != 1) err = entities.length+" records for "+userID;
        req.session.rankedvote.voter = entities[0];
        return GetVoter_Filter(err, entities[0], cb, getTrueVoter);
      }
    });
  }
}

function GetDebateEntry(did_or_debateEntity, cb, cachedLifetime) {
  var did, debateEntity;
  if(typeof did_or_debateEntity === 'string') {
    did = did_or_debateEntity; debateEntity = null;
  } else {
    debateEntity = did_or_debateEntity; did = debateEntity.id;
  }
    var scope={};
  if(debateEntity && debateEntity.dentry) { // if the debate is known, and it knows it's entry
    DS_read(T_DEBATE_ENTRY, debateEntity.dentry, function(err, entryData) { // find it.
      if(!entryData) { // if it isn't there, forget about that old entry and try this again.
        debateEntity.dentry = undefined; GetDebateEntry(debateEntity, cb, cachedLifetime);
      } else { cb(err, entryData); }
    }, cachedLifetime);
  } else { // if the debate is not here...
    // find the debate entry if possible.
    var filter = {'did':did};
    if(cachedLifetime <= 0) { filter.FORCED = true; }
    DS_listBy(T_DEBATE_ENTRY, filter, 1, null, function (err, entryData, cursor) {
      if(entryData && entryData.length && entryData[0].did == did) {
        scope.dentry = entryData[0];
      }
      if(debateEntity){ // if there is a debate entry
        // but the debate entry is not complete...
        if(!(debateEntity.data && debateEntity.title && debateEntity.owner
        && debateEntity.created && debateEntity.modified && debateEntity.id)) {
          debateEntity = null; // the debate entry is invalid. this will load the correct one
        }
      }
      // if there isn't a debate entry, we need to make one...
      waterfall([ function getTheDebate(callback) {
        if(!debateEntity) { // if the debate isn't known, find it
          DS_read(T_DEBATE, did, function(err, data) { debateEntity = data; callback(err); });
        } else { callback(null); }
      }, function createNewDebateEntry(callback) {
        if(!scope.dentry) { // if there is no debate entry, create one
          if(!debateEntity) {
            log("WOAH THERE!!!\n\n");
            return cb("ERROR missing debate "+did, debateEntity);
          }
          // make the debate entry
          var de = {
            did: debateEntity.id,
            name: debateEntity.title,
            owner:debateEntity.owner,
            vis:(debateEntity.data.visibility || 'private'),
            vot:(debateEntity.data.votability || 'anyone'),
            data: {}
          };
          log("DEBATE ENTITY ("+debateEntity.id+"): "+JSON.stringify(debateEntity));
          DS_update(T_DEBATE_ENTRY, de.id, de, function (err, entity) { scope.dentry = entity; callback(null); });
        } else { callback(null); }
      },function updateDebate(callback) { // update the debate to reference the debate entry
        if(debateEntity.dentry != scope.dentry.id) {
          debateEntity.dentry = scope.dentry.id;
          DS_update(T_DEBATE, debateEntity.id, debateEntity, function (err, entity) { debateEntity = entity; callback(null); });
        } else { callback(null); }
      }],function error(err){ cb(err, scope.dentry); }
      );
    }, cachedLifetime);
  }
}

/** debug function */
function printPropertiesOf(obj) {
  if(IS_DEBUG) { mvaganov.printPropertiesOf(obj); }
}

const vm = require('vm'); // for running possibly unsafe code
function saferParse(jsonText) {
  var sandbox = {};
  try{
  // "use strict;" should prevent arguments.callee.caller from breaking encapsulation
  vm.runInNewContext("\"use strict\"; var dat = "+jsonText, sandbox);
  }catch(err){
    console.log("FAILED SAFERPARSE: "+err+"\n-------------------------\n"+jsonText+"\n-------------------------");
  }
  return sandbox.dat;
}

var cachedHeader = null;
//var headerVariables = {title:"&title", code:"//@", includes:"&includes", passport:"&passport"};
var writeWebpageHeader = function(req, res, title, includesPath, includes, codeToInsert, cb) {
  var _writeWebpageHeader = function(err) {
    if(err) {return cb(err);}
    var includeHtml = "";
    if(includes){
      for(var i=0;i<includes.length;++i) {
        includeHtml += '<script src="'+((includes[i].startsWith("http"))?"":includesPath)+includes[i]+'"></script>';
      }
    }
    var passportHtml;
    if(req.session && req.session.passport && req.session.passport.user) {
      var user = req.session.passport.user;
      passportHtml = '<table><tr><td><img src="'+
      user.image+'" height="48" class="img-circle"></td><td><a href=\"/user\">'+
      user.displayName+'</a><br><a href=\"/auth/logout?return='+
      encodeURIComponent(req.originalUrl)+'\">(logout)</a></td></tr></table>';
    } else {
      passportHtml = '<a href=\"/auth/login?return='+
      encodeURIComponent(req.originalUrl)+'\""><img src=\"'+
      'https://developers.google.com/identity/images/btn_google_signin_light_normal_web.png'
      //'https://developers.google.com/identity/images/btn_google_signin_dark_normal_web.png'
      +'\"></a>';
    }
    if(!cachedHeader.meta){
      return END(req, res, cachedHeader.filepath+" missing metadata");
    }
    var hv = cachedHeader.meta.variables;
    var fillVariables = {};
    var t, heading;
    if(title && title.constructor === Array) {
      t = title[0];
      heading = title[1%title.length];
    }
    fillVariables[hv.title] = t || title;
    fillVariables[hv.heading] = heading || title;
    if(codeToInsert) { codeToInsert = "<script>"+codeToInsert+"</script>"; } else { codeToInsert=""; }
    fillVariables[hv.code] = codeToInsert;
    fillVariables[hv.includes] = includeHtml;
    fillVariables[hv.passport] = passportHtml;
    cachedHeader.fillOut(fillVariables, function(str){ res.write(str); }, cb);
  };
  if(!cachedHeader) {
    cachedHeader = new mvaganov.CachedMadlibs();
    //var values = []; for(var k in headerVariables) { values.push(headerVariables[k]); }
    cachedHeader.initFromFile("views/header.html", null, {keepWhitespace:false}, _writeWebpageHeader);
  } else {
    _writeWebpageHeader(null);
  }
}
var cachedFooter = null;
var footerVariables = {info:"<!--info-->"};
var SERVER_IP_INFO = null;
var writeWebpageFooter = function (req, res, cb) {
  if(!SERVER_IP_INFO) {
    var os = require('os');
    var ifaces = mvaganov.getLocalServerIP();//os.networkInterfaces();
    SERVER_IP_INFO = JSON.stringify(ifaces);
    const fs = require('fs');
    fs.lstat(__filename, function(err, stats) {
      SERVER_IP_INFO = stats.mtime+" "+SERVER_IP_INFO;
    });
  }
  function _writeWebpageFooter (err) {
    if(err) { log("_writeWebpageFooter error: "+err); return cb(err);}
    var fillVariables = {};
    fillVariables[footerVariables.info] = SERVER_IP_INFO+
      ((res.specialOutput && Object.keys(res.specialOutput).length)?"<br>"+JSON.stringify(res.specialOutput):"")+
      "<br>Send bugs and feature requests to 'mvaganov' at hotmail";
    cachedFooter.fillOut(fillVariables, function(str) {
      res.write(str);
    }, cb);
  };
  if(!cachedFooter) {
    cachedFooter = new mvaganov.CachedMadlibs();
    var values = [];
    for(var k in footerVariables) { values.push(footerVariables[k]); }
    cachedFooter.initFromFile("views/footer.html", values, {keepWhitespace:false}, _writeWebpageFooter);
  } else {
    _writeWebpageFooter(null);
  }
}

function async_waterfall_error(err, req, res, result, scope) {
  if(result || err) { log(":"+req.url+" scope: "+JSON.stringify(scope)); }
  if(result) { log(":"+req.url+" results:"+JSON.stringify(result)); }
  if(err) { log(":"+req.url+" ERROR:"+err);
    if(res && !res.finished) { END(req,res,err); }
  }
}
var cachedWebpageBodies = {};
function getCacheWebpageBody(filepath, cb) {
  var cachedBody = cachedWebpageBodies[filepath];
  if(!cachedBody) {
    cachedBody = new mvaganov.CachedMadlibs();
    return cachedBody.initFromFile(filepath, null, null, function(err){
      if(!err){ cachedWebpageBodies[filepath] = cachedBody; }
      cb(err, cachedBody);
    });
  } else { return cb(null, cachedBody); }
}
function writeWebpageBody(req, res, filedata, cb) {
  function _writeWebpageBody (err, cachedBody) {
    if(err) { log("_writeWebpageBody ("+cachedBody.filepath+") error: "+err); return cb(err);}
    cachedBody.fillOut(null, function(str) { res.write(str); }, cb);
  }
  if(typeof filedata === 'string') {
    getCacheWebpageBody(filedata, _writeWebpageBody);
  } else {
    _writeWebpageBody(null, filedata);
  }
}

app.get(['/edit/:did','/edit'], function (req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  var did = req.params.did?req.params.did.toString():null;
  var isPublic = false;
  if(did == 'public') {
    isPublic = true;
    did = undefined;
  } else if(did) {
    for(var i=0;i<did.length;++i) {
      if(did[i] < '0' || did[i] > '9') {
        return END(req,res,"can't edit non-debate \""+did+"\"");
      }
    }
  }
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebate(callback) {
      if(did) {
        DS_read(T_DEBATE, req.params.did, function(err, debate) {
          scope.debate=debate; if(!debate) { res.redirect('/edit'); } else { callback(err); }
        });
      } else { scope.debate=null; callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/edit.html', function (err, cachedBody) { scope.cachedBody = cachedBody; callback(err); });
    }, function writeHeader(callback) {
      var debateData;
      if(scope.debate) {
        debateData = JSON.stringify(scope.debate);
      } else {
        debateData = "{data:{candidates:["+
        // "['','<img src=\"optional_image.jpg\" alt=\"option text\">',''],"+
        // "['','<img src=\"one.jpg\" alt=\"the number 1\">',''],"+
        // "['','<img src=\"two.jpg\" alt=\"the number 2\">','']],choices:[],imgdisp:'none',"+
        "['','choice',''],"+
        "['','option',''],"+
        "['','alternative','']"+
        "],choices:[],imgdisp:'none',"+
        "prompt:\"\""+//\"If your best choice could not possibly win, your vote transfers to your next choice.\""+
        ((isPublic)?",visibility:'public'":"")+"},title:\"\"};";
      }
      var voterID = (scope.voter)?scope.voter.id:0;
      var canPostPublic = Voter_CanPostPublic(scope.voter);
      var codeToInsert="var RankedVote_servedData="+ debateData + ";var creatorID=\'"+voterID+"\';var canPostPublic="+canPostPublic+";";
      writeWebpageHeader(req, res, (((did)?'Edit':'New')+' Debate'), "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

function Voter_CanPostPublic(voter) {
  return voter.data && (voter.data.canPostPublic || (voter.data.admin !== undefined && voter.data.admin !== null && voter.data.admin !== false));
}

app.get('/about.html', function (req, res, next) {
  var scope = {};
  waterfall([
    function getBody(callback) { getCacheWebpageBody('views/about.html', function (err, cachedBody) { scope.cachedBody = cachedBody; callback(err); });
    }, function writeHeader(callback) { writeWebpageHeader(req, res, scope.cachedBody.meta.title, "../", scope.cachedBody.meta.includes, null, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

app.get('/delete/:did', function (req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  var did = req.params.did?req.params.did.toString():null;
  if(did) {
    for(var i=0;i<did.length;++i) {
      if(did[i] < '0' || did[i] > '9') {
        did = undefined;
        return END(req,res,"can't delete non-debate \'"+did+"\'");
      }
    }
  }
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebate(callback) {
      if(did) {
        DS_read(T_DEBATE, req.params.did, function(err, debate) {
          scope.debate=debate; if(!debate) { res.redirect('/vote'); } else { callback(err); }
        });
      } else { scope.debate=null; callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/delete.html', function (err, cachedBody) { scope.cachedBody = cachedBody; callback(err); });
    }, function writeHeader(callback) {
      var debateData;
      if(scope.debate) {
        debateData = JSON.stringify(scope.debate);
      } else {
        return END(req,res,"can't edit non-debate \""+did+"\"");
      }
      var voterID = (scope.voter)?scope.voter.id:0;
      var codeToInsert="var RankedVote_servedData="+ debateData + ";var creatorID=\'"+voterID+"\';";
      writeWebpageHeader(req, res, scope.cachedBody.meta.title, "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

// called if it's discovered that more than one debateEntry points at the same debate TODO determine if this is still needed, and possibly eliminate the code path...
function cleanupExtraEntries(req,res, entries, allCurrentDebates, cb) {
  var scope = {};
  waterfall([function getDebate(callback) { // get the debate
    DS_read(T_DEBATE, entries[0].did, function(err, debate) { scope.debate=debate; callback(err); });
  }, function sortOutExtras(callback) {
    // check which entry is the real one
    var realIndex = -1;
    if(!scope.debate.dentry) {
      var errorMsg = "uhhh.... debate \""+scope.debate.title+"\" ("+scope.debate.id+") has no known debate entry...";
      log(errorMsg);
      //return callback(errorMsg);
      return GetDebateEntry(scope.debate.id, function(){  res.redirect("/vote"); })
    }
    for(var i=0;i<entries.length;++i) {
      if(entries[i].id == scope.debate.dentry) {
        if(realIndex != -1) { return callback("uhhh.... multiple debate entries have the same id..."); }
        realIndex = i;
      }
    }
    if(realIndex == -1) { return callback("uhhh.... none of these debate entries have the correct id..."); }
    // put all of the other ones into a listToRemove.
    var listToRemove = entries.filter(function(item, indx, arr){return indx != realIndex;});
    // remove all the listToRemove from the allCurrentDebates list
    for(var i=allCurrentDebates.length-1;i>=0;--i) {
      if(listToRemove.indexOf(allCurrentDebates[i]) >= 0) {
        allCurrentDebates.splice(i,1);
      }
    }
    scope.listToRemove = listToRemove;
    callback(null);
  }, function removeExtrasFromDatabase(callback) {
    // start the database calls to remove all listToRemove!
    log("TODO delete some entries: "+JSON.stringify(scope.listToRemove));
    var indexToDelete = 0;
    function release_me() {
      log("ABOUT TO DELETE "+JSON.stringify(scope.listToRemove[indexToDelete]));
      DS_delete(T_DEBATE_ENTRY, scope.listToRemove[indexToDelete].id,
        function next(err) {
          if(err) { return callback(err); }
          indexToDelete++;
          if(indexToDelete >= scope.listToRemove.length) {
            callback(null);
          } else { setTimeout(release_me, 0); }
        });
    }
    release_me();
  }, function finished(callback) {
    // continue with the rest of the /debates method.
    log("cleaned up "+scope.listToRemove.length+" elements");
    cb(null);
  }], function error(err) {async_waterfall_error(err,req,res,null,scope);});
}

function PublicDebates_Get(req, res, startPageToken, callback) {
  // to force database reload each time, add FORCED:true to parameter table
  DS_listBy(T_DEBATE_ENTRY, {vis: 'public', SORTBY:["modified D"]}, 50, startPageToken,
    function(err,debates,pageToken){
      callback(err, {debates:debates, pageToken:pageToken});
  });
}
function PublicDebates_ForceRefresh(req, res, startPageToken, callback) {
  DS_uncacheListBy(T_DEBATE_ENTRY, {vis: 'public', SORTBY:["modified D"]}, 50, startPageToken, function(err){
    log("###### OH NO! ERROR WHILE ASKING FOR REFRESH?! "+err);
    callback(null);
  });
}

app.get(['/debates','/debates/:type'], function(req, res) {
  var scope = {};
  waterfall([
    function getVoter(callback) {
      GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getPublicDebates(callback) {
      PublicDebates_Get(req, res, req.query.pageToken, function(err, debates) { scope.debates = debates; callback(err); });
    }, function checkMessinessOfDebateEntriesAndCleanup(callback) {
      if(scope.debates){
        checkAndFixMultipleDebateEntries(req, res, scope.debates.debates, callback);
      } else { callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/debates.html', function (err, cachedBody) {scope.cachedBody=cachedBody;callback(err);});
    }, function writeHeader(callback) {
      var debatesToSend = [];
      for(var i=0;i<scope.debates.debates.length;++i){
        var d = scope.debates.debates[i];
        debatesToSend.push({name:d.name,vot:d.vot,did:d.did,modified:d.modified});
      }
      var state = {name:(scope.voter)?scope.voter.name:"not-logged-in", debates:debatesToSend};
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(state) + ";var creatorID=\'"+((scope.voter)?scope.voter.id:0)+"\';";
      writeWebpageHeader(req, res, scope.cachedBody.meta.title, "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

app.get('/admin', function(req,res) {
  var scope = {};
  waterfall([
    function getVoter(callback) {
      GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);}, false, true);
    }, function assertAdmin(callback) {
      if(scope.voter.data.admin) { callback(null); } else { callback("missing admin rights"); }
    }, function getPublicDebates(callback) {
      //PublicDebates_Get(req, res, req.query.pageToken, function(err, debates) { scope.debates = debates; callback(err); });
      DS_listBy(T_DEBATE_ENTRY, {SORTBY:["vis","modified D"], FORCED:true}, 50, req.query.pageToken,
        function(err,debates,pageToken) { scope.debates = {debates:debates, pageToken:pageToken}; callback(err);
      });
    }, function checkMessinessOfDebateEntriesAndCleanup(callback) {
      if(scope.debates){
        checkAndFixMultipleDebateEntries(req, res, scope.debates.debates, callback);
      } else { callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/admin.html', function (err, cachedBody) {scope.cachedBody=cachedBody;callback(err);});
    }, function writeHeader(callback) {
      var debatesToSend = [];
      for(var i=0;i<scope.debates.debates.length;++i){
        var d = scope.debates.debates[i];
        debatesToSend.push({name:d.name,vot:d.vot,vis:d.vis,did:d.did,modified:d.modified,owner:d.owner});
      }
      var state = {name:(scope.voter)?scope.voter.name:"not-logged-in", debates:debatesToSend};
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(state) + ";var creatorID=\'"+((scope.voter)?scope.voter.id:0)+"\';";
      writeWebpageHeader(req, res, scope.cachedBody.meta.title, "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

// TODO
app.post('/admin/:vid', function update (req, res, next) {
  var scope = {};
  waterfall([
    function getVoter(callback) {
      refreshDBAuthIfNeeded(req,res, function() {
        GetVoter(req, res, function(err,voter){
          if(!voter) { return callback("redirect:"+getForcedLoginUrl(req)); } scope.voter=voter; callback(err);
        }, false, true);
      });      
    }, function assertAdmin(callback) {
      if(scope.voter.data.admin) { callback(null); } else { callback("missing admin rights"); }
    }, function getVoterToFilterAs(callback) {
      if(req.params.vid === 0 || req.params.vid === '0') {
        scope.voter.data.admin = true;
        callback(null);
      } else if(req.params.vid) {
        DS_read(T_VOTER, req.params.vid, function(err, otherVoter){
          if(otherVoter) {
            scope.voter.data.admin = otherVoter;
          }
          scope.otherVoter = otherVoter;
          callback(err);
        });
      } else {
        END(req,res,"missing voter ID");
      }
    }, function response(callback) {
      if(scope.voter.data.admin === true) {
        END(req,res,"reverting to <img src='"+scope.voter.data.pic+"'> "+scope.voter.name);
      }else {
        END(req,res,"filtering as <img src='"+scope.otherVoter.data.pic+"'> "+scope.otherVoter.name);
      }
    }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

function checkAndFixMultipleDebateEntries(req, res, listOfEntries, callback) {
  if(listOfEntries) {
    // log("checking!!!!"+listOfEntries.length);
    for(var i=0;i<listOfEntries.length;++i) {
      var commonEntries = listOfEntries.filter(function(item, indx, arr){ 
        // log(item.did+" == "+listOfEntries[i].did);
        return(item.did == listOfEntries[i].did);});
      if(commonEntries && commonEntries.length > 1) { // if we have some debateEntries poiting at the same Debate
        log(commonEntries.length+" entries found pointing at "+listOfEntries[i].did);
        return cleanupExtraEntries(req,res, commonEntries, listOfEntries, function(err){
          if(err){return callback(err);}
          waterfall([
            function (cb) { PublicDebates_ForceRefresh(req, res, req.query.pageToken, cb); },
            function (cb) { DS_uncacheListBy(T_DEBATE_ENTRY, {owner: scope.voter.id}, 50, req.query.pageToken, cb); },
            function (cb) { setTimeout(function(){ checkMessinessOfDebateEntriesAndCleanup(cb); }, 0);}
          ], callback);
        });
      }
    }
  }
  callback(null);
}

app.get(['/user','/user/:type'], function(req, res) {
  var scope = {};
  waterfall([
    function getVoter(callback) {
      GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getMyDebates(callback) {
      if(scope.voter && (req.params.type == "all" || !req.params.type)) {
        DS_listBy(T_DEBATE_ENTRY, {owner: scope.voter.id, SORTBY:["vis D","modified D"]}, 50, req.query.pageToken,
          function(err,debates,pageToken){scope.debates = {debates:debates,pageToken:pageToken}; callback(err);});
      } else if(req.params.type) {
        log(req.params.type+" debates plz!");
        DS_listBy(T_DEBATE_ENTRY, {owner: scope.voter.id, vis: req.params.type, SORTBY:["modified D"]}, 50, req.query.pageToken,
          function(err,debates,pageToken){ scope.debates = {debates:debates,pageToken:pageToken}; callback(err);});
      } else {
        scope.debates = {debates:[],pageToken:null}; callback(null);
      }
    }, function checkMessinessOfDebateEntriesAndCleanup(callback) {
      // check to see if more than one of these debate entries point at the same debate. if so, delete those!
      if(scope.debates) {
        checkAndFixMultipleDebateEntries(req, res, scope.debates.debates, callback);
      } else { callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/user.html', function (err, cachedBody) {scope.cachedBody=cachedBody;callback(err);});
    }, function writeHeader(callback) {
      var debatesToSend = [];
      for(var i=0;i<scope.debates.debates.length;++i){
        var d = scope.debates.debates[i];
        debatesToSend.push({name:d.name,vis:d.vis,vot:d.vot,did:d.did});
      }
      var state = {name:(scope.voter)?scope.voter.name:"not-logged-in", debates:debatesToSend};
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(state) + ";var creatorID=\'"+((scope.voter)?scope.voter.id:0)+"\';";
      writeWebpageHeader(req, res, scope.cachedBody.meta.title, "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

app.get('/votes', function(req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  // var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getVotes(callback) { 
      if(scope.voter) {
        DS_listBy(T_VOTE, {vid:scope.voter.id,SORTBY:["modified D"]},50,req.query.pageToken,
        function(err, votes, pageToken){scope.votes={votes:votes,pageToken:pageToken}; callback(err);});
      } else { scope.votes={votes:[],pageToken:null}; callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/votes.html', function (err, cachedBody) {scope.cachedBody=cachedBody;callback(err);});
    }, function writeHeader(callback) {
      var state = {name:((scope.voter)?scope.voter.name:"not-logged-in"), votes:scope.votes.votes};
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(state) + ";var creatorID=\'"+((scope.voter)?scope.voter.id:0)+"\';";
      writeWebpageHeader(req, res, scope.cachedBody.meta.title, "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

app.get(['/vote/:did','/votex/:did','/vote'], function(req, res, next) {
  // var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebate(callback) { 
      if(req.params.did) {
        DS_read(T_DEBATE, req.params.did, function(err, debate){
          // log("vot:"+debate.data.votability);
          if(debate.data.visibility != 'deleted' && debate.data.visibility != 'hidden') { scope.debate=debate; }
          callback(null);
        });
      } else {scope.debate=null; callback(null);}
    }, function preprocessDebate(callback) {
      // log("preprocessDebate\n"+JSON.stringify(scope.debate));
      if(!scope.debate) { return callback(null); }
      if(scope.debate.data.candidateOrder == 'result') {
        scope.state = saferParse(JSON.stringify(scope.debate));
      } else if(scope.debate.data.candidateOrder != 'fixed') {
        // log("random order");
        scope.state = saferParse(JSON.stringify(scope.debate));
        function shuffle(array) {
          var m = array.length, t, i;
          // While there remain elements to shuffle
          while (m) {
            // Pick a remaining element
            i = Math.floor(Math.random() * m--);
            // And swap it with the current element
            t = array[m]; array[m] = array[i]; array[i] = t;
          }
          return array;
        }
        shuffle(scope.state.data.candidates);
      } else if (scope.debate.data.candidateOrder == 'fixed') {
        // do nothing for fixed order. leave order the way it is.
      }
      callback(null);        
    }, function getVote(callback) {
      if(scope.voter) {
        scope.isVotex = false;
        if(scope.debate) {
          scope.isVotex = (req.url.indexOf("votex") >= 0 && scope.voter.id == scope.debate.owner);
          DS_listBy(T_VOTE, {vid:scope.voter.id, 'did':scope.debate.id}, 1, null, function(err, votes, pageToken){ 
            if(votes) { scope.vote = votes[0]; }
            if(!scope.vote && scope.debate && scope.debate.data.votability == 'closed') { return res.redirect('/result/'+req.params.did); }
             callback(null); });
        } else { callback(null); }
      } else { callback(null); }
    }, function getBody(callback) {
      getCacheWebpageBody('views/'+((scope.isVotex)?'votex':'vote')+'.html', function (err, cachedBody) {scope.cachedBody=cachedBody;callback(err);});
    }, function writeHeader(callback) {
      if(scope.debate) {
        if(scope.vote) { // if there is an existing vote
          if(!scope.state) { scope.state = saferParse(JSON.stringify(scope.debate)); }
          if(scope.vote.data.rank) { scope.state.rank = scope.vote.data.rank; scope.state.voteID = scope.vote.id; }
          if(scope.vote.data.ranks) { scope.state.ranks = scope.vote.data.ranks; scope.state.voteID = scope.vote.id; }
        }
      } else {
        scope.state = {
          title:"Invalid Debate ID "+req.params.did,
          data:{ prompt:"The debate you are looking for does not exist. This is could be because the debate was:",
            candidates:[
              ['deleted','<u>Deleted</u>. An administrator or the owner removed the debate from the system',''],
              ['hidden','<i>Hidden</i>. The owner does not want the debate to be visible',''],
              ['error','<b>an Error</b>. You have reached this page because of some other error','']
            ], choices:[],imgdisp:'none' } };
      }
      if(!scope.state) {scope.state=scope.debate;}
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(scope.state) + ";var creatorID=\'"+((scope.voter)?scope.voter.id:0)+"\';";
      writeWebpageHeader(req, res, [scope.state.title, scope.cachedBody.meta.title],
        "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

function calculateResults(req, res, scope, whenFinished) {
  waterfall([
    function getDebate(callback) {
      log("calculateReuslts: getDebate");
      // get the debate data
      DS_read(T_DEBATE, scope.dentry.did, function(err, data){scope.debate=data; callback(null);})
    }, function getVotes(callback) {
      log("calculateReuslts: getVotes");
      // get all of the vote data for this debate
      // TODO only select data
      if(scope.debate) {
        DS_listBy(T_VOTE, {did:scope.debate.id, FORCED:true}, null, null, function (err, found, cursor) {scope.votes=found;callback(null);},0);
      } else {scope.votes=[];callback(null);}
    }, function calcResults(callback) {
      log("calculateReuslts: calcResults");
      log("Votes: ("+scope.votes.length+")"+JSON.stringify(scope.votes));
      // ensure the votes are properly formatted
      scope.cleanvotes = [];
      for(var i=0;i<scope.votes.length;++i){
        if(scope.votes[i].data.rank) {
          scope.cleanvotes.push({id:scope.votes[i].id,vote:scope.votes[i].data.rank});
        }
        if(scope.votes[i].data.ranks) {
          scope.voterfraud = true;
          for(var j=0;j<scope.votes[i].data.ranks.length;++j) {
            scope.cleanvotes.push({id:scope.votes[i].id+j,vote:scope.votes[i].data.ranks[j]});
          }
        }
      }
      log("CLEAN VOTES: "+JSON.stringify(scope.cleanvotes));
      // calculate the results
      log("--------CALCULATING");
      irv(scope.cleanvotes, null, null, function(calcresults){scope.calcresults=calcresults;callback(null);});
    }, function cleanAndCommitData(callback) {
      log("calculateReuslts: cleanAndCommit");
      // create the submission package for the client, with the results, and debate info
      if(scope.debate) {
        scope.state = {
          id: scope.debate.id,
          title: scope.debate.title,
          prompt: scope.debate.data.prompt,
          result: scope.calcresults,
          info: [], 
        };
      } else {
        scope.state = {
          id: "0",
          title: "Error: could not find debate "+scope.dentry.did,
          prompt: "",
          result: [],
          info: [], 
        };
      }
      if(scope.voterfraud) { scope.state.voterfraud = true; } // TODO send username
      var candidateSource = scope.debate.data.candidates;
      if(scope.debate.data.addedCandidate) {
        candidateSource = candidateSource.concat(scope.debate.data.addedCandidate);
      }
      for(var r=0;r<scope.state.result.length;++r) {
        var cand = scope.state.result[r].C;
        if(typeof cand === 'string') {
          var list = candidateSource;
          for(var i=0;i<list.length;++i) { 
            if(list[i][0] == cand) { 
              scope.state.info.push(list[i]); break; 
            }
          }
        } else if(cand.constructor == Array) {
          var allText = ((cand.length>2)?(cand.length+" way "):"")+"TIE<br>";
          var additions = 0;
          var list = candidateSource;
          for(var i=0;i<list.length;++i) { 
            if(cand.indexOf(list[i][0]) >= 0) {
              if(additions > 0) { allText += "<br>";}
              allText += list[i][1];
              additions++;
            }
          }
          scope.state.info.push([cand.join(", "),allText,""]);
        }
      }
      if(scope.debate) {
        log("-----------------UPDATING RESULTS");
        DS_update(T_DEBATE_RESULT, scope.dentry.result, 
          {did:scope.dentry.did,data:scope.state}, function (err, resultingData){ 
            scope.debate_result=resultingData; callback(null);
          });
      } else {callback(null);}
    }, function notify(callback) {
      log("calculateReuslts: notify");
      scope.dentry.lastresult = Date.now();
      if(scope.debate_result) {
        scope.dentry.result = scope.debate_result.id;
        DS_update(T_DEBATE_ENTRY, scope.dentry.id, scope.dentry, function(err,obj){callback(null);});
      } else {callback(null);}
    //}, function finished(callback) { callback(null); // will call whenFinished(null)
  }], function error(err, result) { whenFinished(err); async_waterfall_error(err, req, res, result, scope); });
}

app.get('/result/:did', function(req, res, next) {
  var scope = {};
  waterfall([
    function getDebateEntry(callback) {
      // check if there are results available
      GetDebateEntry(req.params.did, function(err, entity) {
        if(entity.vis == 'deleted' || entity.vis == 'hidden') { res.redirect("/vote"); } else {
          scope.dentry=entity; callback(err);
        }
      }, 0);
    }, function calculateResultsIfNeeded(callback) {
      // log("DENTRY: "+JSON.stringify(scope.dentry));
      // if there are no results, or it's time for a new calculation of results
      // log("??????? resultID:"+scope.dentry.result+" lastResult:"+scope.dentry.lastresult+" lastVote:"+scope.dentry.lastvote+" "+(scope.dentry.lastresult < scope.dentry.lastvote));
      if(!scope.dentry.result || !scope.dentry.lastresult || scope.dentry.lastresult < scope.dentry.lastvote) {
        log("RESULTS MUST BE RECALCULATED! resultID:"+scope.dentry.result+" lastResult:"+scope.dentry.lastresult+" lastVote:"+scope.dentry.lastvote);
        calculateResults(req, res, scope, callback);
      } else {
        log("RESULTS not recalculated. resultID:"+scope.dentry.result+" lastResult:"+scope.dentry.lastresult+" lastVote:"+scope.dentry.lastvote);
        DS_read(T_DEBATE_RESULT, scope.dentry.result, function(err, databaseresult) {
          scope.debate_result = databaseresult;
          // log("database result::::: "+JSON.stringify(databaseresult));
          scope.state=databaseresult.data;
          callback(err);
        }, 5);
      }
    }, function getBody(callback) {
      getCacheWebpageBody('views/result.html', function (err, cachedBody) {scope.cachedBody=cachedBody;callback(err);});
    }, function writeHeader(callback) {
      var codeToInsert="var RankedVote_servedData="+JSON.stringify(scope.state)+";";
      writeWebpageHeader(req, res, [scope.state.title, scope.cachedBody.meta.title], "../", scope.cachedBody.meta.includes, codeToInsert, callback);
    }, function writeBody(callback) { writeWebpageBody(req,res, scope.cachedBody, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){END(req,res); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

function ensureTimeBetween(stringCode, actionName, timeMs, callback) {
  DS_getCached(stringCode, function(err, data){
    var isOK = true;
    var tillActionOK = "an unknown number of"
    if(data) {
      tillActionOK = Number(data)-Number(Date.now());
      isOK = (tillActionOK <= 0);
      tillActionOK /= 1000; // convert to seconds
    }
    if(isOK) {
      DS_setCached(stringCode, Date.now()+timeMs, function(){callback(null);}, timeMs);
    } else {
      callback("Please wait "+tillActionOK+" seconds before trying to "+actionName);
    }
  });
}

// make sure debates arent duplicated when a debate ID is supplied (as long as the debate exits, and was created by this same user!)
app.post(['/edit/:debateid','/edit'], function update (req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var cookies = req.headers.cookie.parseCookies(); // TODO mvaganov.parseCookies
  var dat = saferParse(cookies.debate);
  var scope = {dat:dat, updatedDebateAlready:false};
  var did = req.params.debateid;
  if(did == 'public') {did = undefined;}
  var MAX_IDENTIFIER_LENGTH = 32;
  waterfall([
    function validateDebate(callback) {
      // log("------validate debate");
      if(!dat) { return callback("missing debate");}
      if(!dat.title) { return callback("missing debate title");}
      if(!dat.data) { return callback("missing debate data");}
      irv_validateCandidates([scope.dat.data.candidates, scope.dat.data.choices], function(err){
        if(err){ return callback(err); }
        callback(null);
      });
    }, function getVoter(callback) {
      // log("------get voter");
      refreshDBAuthIfNeeded(req,res, function(){
        GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
      });
    }, function ensureEditsAreaAllowed(callback) {
      if(dat.data.visibility == 'public' && !Voter_CanPostPublic(scope.voter)) { return callback("user not allowed to post publicly"); }
      callback(null);
    }, function ensureOneMinuteBetweenVotes(callback) {
      // log("------ensure 1 minute:    edit"+scope.voter.id);
      const MIN_MS_BETWEEN_DEBATE_EDITS = 60 * 1000;
      // console.log("edit voter "+scope.voter.name+" "+scope.voter.id+" "+scope.voter.email);
      ensureTimeBetween("edit"+scope.voter.id, "edit your debate", MIN_MS_BETWEEN_DEBATE_EDITS, callback);
    }, function getDebate(callback) {
      // log("------get debate "+did);
      if(did) { // updating existing debate
        DS_read(T_DEBATE, did, function(err, debate){scope.debate=debate;callback(null);});
      } else {scope.debate=null; callback(null);} // creating new debate
    }, function digestCookiesIntoDebate(callback) {
      // log("------digest cookies for "+scope.dat.owner);
      if(!scope.dat) { return callback("ERROR missing debate cookie "+JSON.stringify(cookies)); }
      if(scope.dat.owner) { scope.dat.owner = scope.dat.owner.toString(); }
      if(scope.dat.id) { scope.dat.id = scope.dat.id.toString();
        if(did != scope.dat.id) { return callback("ERROR mismatching debate ID passed."); }
      }
      if(scope.dat.owner != scope.voter.id) {
        return callback("ERROR incorrect user submission. "+(gid
          ?("Expected user is "+scope.dat.owner+", but instead, user is "+scope.voter.id) :"Not logged in."));
      }
      callback(null);
    }, function createDebateIfMissing(callback) {
      // log("------create debate if missing "+(scope.debate?"(already got it)":": NEED IT!"));
      if(!scope.debate) {// if there is no debate in the database yet, make one! It's expected to be there from this point on!
        return DS_update(T_DEBATE, undefined, scope.dat, function (err, debate) {
          scope.updatedDebateAlready = true;
          scope.debate=debate; callback(err);
        });
      } else if(scope.debate.id != scope.dat.id) { callback("ERROR debate ID mismatch in cookie");
      } else { callback(null); }
    }, function getDebateEntry(callback) {
      // log("------get debate entry      for debate "+scope.debate.id);
      GetDebateEntry(scope.debate, function(err, data){scope.dentryEntity=data; callback(err);});
    }, function updateDebateIfNeeded(callback) {
      // log("updated debate if needed (already?) "+scope.updatedDebateAlready);
      if(!scope.updatedDebateAlready || scope.debate.dentry != scope.dat.dentry) {
        scope.dat.dentry = scope.dentryEntity.id;
        DS_update(T_DEBATE, scope.dat.id, scope.dat, function (err, debate) { scope.debate=debate; callback(err); });
      } else { callback(null); }
    }, function updateDebateEntryTitleIfNeeded(callback) {
      // log("update debate entry title if needed "+scope.dentryEntity.id);
      if(scope.debate.title != scope.dentryEntity.name
      || scope.debate.data.visibility != scope.dentryEntity.vis
      || scope.debate.data.votability != scope.dentryEntity.vot) {
        scope.dentryEntity.name = scope.debate.title;
        scope.dentryEntity.vis = scope.debate.data.visibility;
        scope.dentryEntity.vot = scope.debate.data.votability;
        DS_update(T_DEBATE_ENTRY, scope.dentryEntity.id, scope.dentryEntity, function (err, entity) {
          scope.dentryEntity=entity;
          if(err) return callback(err);
          PublicDebates_ForceRefresh(req, res, req.query.pageToken, callback);
        });
      } else { callback(null); }
    }, function finished(callback) {
      var resultObject = {id:scope.debate.id};
      // log("finished with "+JSON.stringify(resultObject));
      res.json({id:scope.debate.id});
      callback(null);
    }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

app.post(['/vote/:did','/votex/:did','/vote'], function update (req, res, next) {
  var cookies = req.headers.cookie.parseCookies(); // TODO mvaganov.parseCookies
  var dat = saferParse(cookies.rank);
  var scope = {dat:dat};
  if(dat.did != req.params.did) {
    return async_waterfall_error("ERROR D-id in URL ("+req.params.did+") does not match D-id in data ("+dat.did+")", req, res, null, scope); }
  waterfall([
    function getVoter(callback) {
      refreshDBAuthIfNeeded(req,res, function(){
        GetVoter(req, res, function(err,voter){
          if(!voter) { return callback("redirect:"+getForcedLoginUrl(req)); }
          scope.voter=voter;
          callback(err);
        });
      });
    }, function ensureOneMinuteBetweenVotes(callback) {
      const MIN_MS_BETWEEN_VOTES = 60 * 1000;
      // console.log("vote voter "+scope.voter.name+" "+scope.voter.id+" "+scope.voter.email);
      ensureTimeBetween("vote"+scope.voter.id, "vote", MIN_MS_BETWEEN_VOTES, callback);
    }, function getEntry(callback) { 
      if(dat.dentry) {
        var debate_entry_id = dat.did;
        dat.dentry = null; delete dat.dentry; // remove the debate entry from the vote. it's non-standard!
        GetDebateEntry(debate_entry_id, function(err, entity) {
          scope.dentry=entity; callback(err);
        });
      } else { 
        GetDebateEntry(req.params.did, function(err, entity) { scope.dentry=entity; callback(err); });
      }
    }, function updateTheVote(callback) {
      if(scope.dentry.vot == 'closed') { return END(req,res,"voting closed."); }
      log("UPDATING THE VOTE "+JSON.stringify(dat));
      scope.isVotex = (req.url.indexOf("votex") >= 0 && scope.voter.id == scope.dentry.owner);
      if(!scope.isVotex && dat.data.ranks) { return callback("ERROR only debate owners can submit multiple votes."); }
      if(dat.vid != scope.voter.id) { return callback("ERROR user submitting vote for someone other than themselves"); }
      DS_update(T_VOTE, dat.id, dat, function (err, entity) { scope.vote=entity; callback(err); });
    }, function addUserCandidatesIfNeeded(callback) {
      if(dat.data.addedCandidate) {
        var aList = scope.dat.data.addedCandidate;
        log("adding candidate! "+aList);
        waterfall([
          function getTheDebate(cb) {
            // get the debate
            DS_read(T_DEBATE, scope.dat.did, function(err, debate){scope.debate=debate;cb(null);});
          }, function updateAndSubmitDebateIfNeeded(cb) {
            var changeMade = false;
            // if user candidates are not allowed
            if(!scope.debate.data.userSuggestion) {
              // end in failure.
              return cb("user suggestions not allowed.");
            }
            // remove each user suggestion from the debate. will be re-added from dat's addedCandidate list)
            if(scope.debate.data.addedCandidate) {
              for(var i=scope.debate.data.addedCandidate.length-1;i>=0;--i) {
                if(scope.debate.data.addedCandidate[i][2] == scope.voter.id) {
                  scope.debate.data.addedCandidate.splice(i,1);
                  changeMade = true;
                }
              }
            }
            // make sure there are no duplicates
            if(aList.length != 0) {
              function indexOfCandidate(list, choice, startIndex) {
                if(!startIndex) { startIndex = 0; }
                for(var i=startIndex;i<list.length;++i) { if(list[i][0] == choice[0]) return i; } return -1;
              }
              for(var i=0;i<aList.length;++i){
                var duplicateIndex = indexOfCandidate(aList, aList[i], i+1);
                if(duplicateIndex >= 0) { return cb("duplicate in addedCandidate list: "+aList[i]); }
                duplicateIndex = indexOfCandidate(scope.debate.data.candidates, aList[i], 0)
                if(duplicateIndex >= 0) { return cb("duplicate in candidates list: "+aList[i]); }
                duplicateIndex = indexOfCandidate(scope.debate.data.choices, aList[i], 0)
                if(duplicateIndex >= 0) { return cb("duplicate in choices list: "+aList[i]); }
              }
              // function getCandidateValidationError(candidate, list) {
              //   var foundIndex = indexOfCandidate(list, candidate);
              //   if(foundIndex >= 0) {
              //     if(list[foundIndex][2] == scope.voter.id) { // are owned by the same user
              //       list.splice(foundIndex,1); // remove the old added candidate
              //     } else { // are not owned by the same user
              //       return "\'"+candidate[0]+"\' not allowed to be modified by "+scope.voter.id;
              //     }
              //   }
              //   return null;
              // }
              // // check each user-added candidate
              // for(var i=0;i<scope.dat.data.addedCandidate.length;++i) {
              //   var error = getCandidateValidationError(scope.dat.data.addedCandidate[i], scope.debate.data.candidates)
              //            || getCandidateValidationError(scope.dat.data.addedCandidate[i], scope.debate.data.choices);
              //   if(error) { return cb(error); }
              // }
            }

            // add the additional candidates to data.addedCandidate.
            if(!scope.debate.data.addedCandidate) { scope.debate.data.addedCandidate = []; }
            for(var i=0;i<scope.dat.data.addedCandidate.length;++i) {
              var candidate = scope.dat.data.addedCandidate[i];
              if(candidate[2] == scope.voter.id) {
                scope.debate.data.addedCandidate.push(candidate);
                changeMade = true;
              } else {
                return cb("\'"+candidate+"\' not allowed to be modified/added by "+scope.voter.id);
              }
            }
            if(changeMade) {
              // submit the debate
              DS_update(T_DEBATE, scope.debate.id, scope.debate, function (err, debate) { scope.debate=debate; cb(err); });
            } else { return cb(null); }
          }
        ], callback);
      } else { callback(null); }
    }, function finishedWithVoteSubmission(callback) {
      log("VOTE IS ::::: "+JSON.stringify(scope.vote));
      res.json({id:scope.vote.id});
      DS_uncacheListBy(T_VOTE, {vid:scope.voter.id, 'did':dat.did}, 1, null, function(err){ 
      // DS_read(T_VOTE, dat.id, function(err, voteInDb){
      // log("VOTE IS ::::: "+JSON.stringify(voteInDb));
        DS_uncacheListBy(T_VOTE, {vid:scope.voter.id,SORTBY:"modified D"},50,req.query.pageToken, function(err){
          callback(null);
        });
      });
    }, function markLastVote(callback) {
      var lastTime = scope.dentry.lastvote;
      scope.dentry.lastvote = Date.now();
      log("UPDATING THE DEBATE ENTRY: "+scope.dentry.lastvote+" vs "+lastTime);
      DS_update(T_DEBATE_ENTRY, scope.dentry.id, scope.dentry, function(err, entity){callback(null);});
    }
  ], function error(err, result){ async_waterfall_error(err, req, res, result, scope); });
});

// Redirect root
app.get('/', function(req, res) {
  res.redirect('/debates');
});

var t_JSON = 'JSONscript', t_NUM = 'number', t_STR = 'string', t_UNIQUE = 'unique';
var schemaTypeConversionToDatastore = {};
schemaTypeConversionToDatastore[t_STR] = function(data){ return data.toString(); };
schemaTypeConversionToDatastore[t_NUM] = function(data){ return Number(data); };
schemaTypeConversionToDatastore[t_JSON] = function(data){ return JSON.stringify(data); };

var schema = {};
// a switch was made to t_STR for IDs instead of t_NUM when I noticed the key generators give an UNSIGNED 64bit value...
schema[T_DEBATE] = {
    'id': t_STR, // debate id
    'owner': t_STR, // references voter.id
    'dentry': t_STR, // reference to the debate entry, which is a meta-data component of the debate.
    'title': t_STR,
    'created': t_NUM, // timestamp in milliseconds (64 bit int)
    'modified': t_NUM, // when the data was changed most recently
    'data': t_JSON // prompt, image details, candidates, other settings. details of who won and how.
};
schema[T_DEBATE_ENTRY] = {
    'id': t_STR,
    'owner': t_STR, // voter id -- who is the admin
    'did': t_STR, // debate.id
    'result': t_STR, // where the results are stored
    'lastvote': t_NUM, // when the most recent vote was
    'lastresult': t_NUM, // when the most results calculation vote was
    'name': t_STR, // title of the debate (most likely)
    'vis': t_STR, // how visible the debate is (public, private)
    'vot': t_STR, // who can vote on this (everyone,closed,exclusive)
    'modified': t_NUM, // when the debate was changed most recently.
    'data': t_JSON // meta-data and summary of the debate. title, vote count, winner, and possibly other details
};
schema[T_DEBATE_RESULT] = {
    'id': t_STR,
    'did': t_STR, // debate.id
    'created': t_NUM, // timestamp in milliseconds (64 bit int)
    'modified': t_NUM, // when the results were calculated most recently
    'data': t_JSON // meta-data and summary of the debate. title, vote count, winner, and possibly other details
};
schema[T_VOTER] = {
    'id': t_STR, // voter id
    'gid': t_STR, // google id, should be stable. or different each time the secret hash salt is changed?
    'email': t_STR, // email address <-- the most stable unique identifier.
    'name': t_STR, // how the user wants to be referred to in this app
    'created': t_NUM, // timestamp in milliseconds (64 bit int)
    'modified': t_NUM, // when the data was changed most recently
    'data': t_JSON // details, details... friendlist? may contain HTML
};
schema[T_VOTE] = {
    'id': t_STR,
    'did': t_STR, // debate.id
    'vid': t_STR, // voter id
    'name': t_STR, // name of the debate
    'created': t_NUM, // timestamp in milliseconds (64 bit int)
    'modified': t_NUM, // when the vote was cast most recently
    'data': t_JSON // choices and other data
};

var nonIndexFilters = {};
nonIndexFilters[T_VOTE] = ['data'];
nonIndexFilters[T_VOTER] = ['data'];
nonIndexFilters[T_DEBATE] = ['data'];
nonIndexFilters[T_DEBATE_ENTRY] = ['data'];
nonIndexFilters[T_DEBATE_RESULT] = ['data'];

var membersToJsonStringifyFilters = {};
membersToJsonStringifyFilters[T_VOTE] = ['data'];
membersToJsonStringifyFilters[T_VOTER] = ['data'];
membersToJsonStringifyFilters[T_DEBATE] = ['data'];
membersToJsonStringifyFilters[T_DEBATE_ENTRY] = ['data'];
membersToJsonStringifyFilters[T_DEBATE_RESULT] = ['data'];

function DS_QueryIdString(q) {
  function serializeArray(arr) {
    var str = "";
    if(arr){
      if(arr.constructor === Array){for(var i=0;i<arr.length;++i){if(i>0){str+=",";}str+=arr[i];}}
      else if(typeof arr === 'object'){for(var k in arr){str+=k+":"+arr[k];}}
    }
    return str;
  }
  var serialized=""; if(q.namespace) { serialized += q.namespace; }
  serialized += ";"; serialized += serializeArray(q.kinds);
  serialized += ";";
  if(q.filters) {
    for(var i=0;i<q.filters.length;++i) {
      if(i>0){serialized+=",";}
      var f=q.filters[i];serialized+=f.name+f.op+f.val;
    }
  }
  serialized += ";";
  if(q.orders) {
    for(var i=0;i<q.orders.length;++i) {
      if(i>0){serialized+=",";}
      var f=q.orders[i];serialized+=f.name+(f.sign)?f.sign:"";
    }
  }
  serialized += ";"; serialized += serializeArray(q.groupByVal);
  serialized += ";"; serialized += serializeArray(q.selectVal);
  serialized += ";"; serialized += (q.autoPaginateVal)?"1":"0";
  serialized += ";"; if(q.startVal) serialized += q.startVal;
  serialized += ";"; if(q.endVal) serialized += q.endVal;
  serialized += ";"; if(q.limitVal) serialized += q.limitVal;
  serialized += ";"; if(q.offsetVal) serialized += q.offsetVal;
  serialized += ";";
  log("QUERY ID:"+serialized);
  return serialized;
}
function DS_UpdateIdString(kind,id) {
  var serialized = ";"+kind+";id="+id+";;;;"+";;;1;;";
  // log("QUERY ID:"+serialized);
  return serialized;
}

function DS_getCached(q, callback) {
  var qid = typeof q === 'string'?q:QueryIdString(q);
  GetMemCache().get(qid, callback);
}
function DS_setCached(q, data, callback, secondsForCache) {
  var qid = typeof q === 'string'?q:QueryIdString(q);
  var mem = GetMemCache();
  if(secondsForCache === null || secondsForCache === undefined) { secondsForCache = 60*5; }
  mem.set(qid, data, secondsForCache, callback);
}

/** puts the datastore key into the object data, and gives the object data without the rest of the datastore overhead infrastructure */
function DS_fromDatastore (obj, kind) {
  obj.data.id = obj.key.id; // every table makes it's unique entry ID known to web app
  if(typeof kind !== 'string') kind = obj.key.kind;
  //log("["+kind+"]"+JSON.stringify(obj));
  //log("GETTING SCHEMA FOR "+kind);
  if(schema[kind].id == t_STR) {
    obj.data.id = obj.data.id.toString();
  }
  var membersToJsonParse = membersToJsonStringifyFilters[kind];
  if(membersToJsonParse) { // if some data members must be parsed to JSON, do it before the app gets the data
    for(var i=0;i<membersToJsonParse.length;++i){
      var k = membersToJsonParse[i];
      obj.data[k] = saferParse(obj.data[k]);
    }
  }
  return obj.data;
}
/** adds datastore overhead to an object so that it can be stored correctly */
function DS_toDatastore (obj, kind) {
  //log("DS_toDatastore "+JSON.stringify(obj));
  var nonIndexed = nonIndexFilters[kind]
  //var membersToJsonStringify = membersToJsonStringifyFilters[kind];
  nonIndexed = nonIndexed || [];
  var results = [];
  var kindschema = schema[kind];
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v === undefined) { log("missing "+k+" entry!"); return; }
    var expectedType = kindschema[k];
    if(expectedType != typeof(v)) {
      log("converting \'"+v+"\' ("+k+") to "+expectedType);
      if(expectedType == undefined) {
        log("awful error incomming... "+kind+"\n"+JSON.stringify(obj));
      }
      v = schemaTypeConversionToDatastore[expectedType](v);
    }
    results.push({
      name: k,
      value: v,
      excludeFromIndexes: (nonIndexed.indexOf(k) !== -1)
    });
  });
  return results;
}

function DS_buildListByQuery(kind, keyFilters, limit, token) {
  log("DS_listBy "+kind+" where "+JSON.stringify(keyFilters)+ " L"+limit+((token)?(" @"+token):"")+" -> "+(typeof cb));
  var FORCED = keyFilters.FORCED;
  if(FORCED) { keyFilters.FORCED = undefined; }
  var q = ds.createQuery([kind]);
  var sorting = keyFilters.SORTBY;
  var select = keyFilters.SELECT;
  if(select) {
    log("SELECT is has not worked correctly in tests...");
    keyFilters.SELECT = undefined;
    if(select.constructor !== Array) { select = [select]; }
  }
  if(sorting) {
    keyFilters.SORTBY = undefined;
    if(sorting.constructor !== Array) { sorting = [sorting]; }
  }
  if(select) {
    log("DS_listBy SELECT: "+select); // TODO figure out why this doesn't work... indexing problem maybe?
    q = q.select(select);
    // for(var i=1;i<select.length;++i) {
    //   log("DS_listBy select: "+select[i]);
    //   q = q.select(select[i]);
    // }
  }
  if(typeof keyFilters === 'object') {
    if(keyFilters.constructor !== Array) {
      log("FILTERING WITH MAP");
      for(var keyName in keyFilters) {
        if(keyFilters[keyName]) {
          log("DS_listBy filter: "+keyName+" = "+keyFilters[keyName]);
          q = q.filter(keyName, '=', keyFilters[keyName]);
        }
      }
    } else {
      log("FILTERING WITH ARRAY");
      for(var i=0;i<keyFilters.length;i+=3) {
        q = q.filter(keyFilters[i], keyFilters[i+1], keyFilters[i+2]);
      }
    }
  }

  if(sorting) {
    // q = q.order(sorting);
    for(var i=0;i<sorting.length;++i) {
      var sortProp = sorting[i];
      var desc = sortProp.endsWith(" D");
      if(desc) { sortProp = sorting[i].substring(0, sorting[i].length-2); }
      log("DS_listBy SORTBY: '"+sortProp+"'"+((desc)?" (descending)":""));
      if(desc) { q = q.order(sortProp, { descending: true });
      } else { 
        q = q.order(sortProp);
      }
    }
  }
  if(limit && limit > 0) q = q.limit(limit);
  if(token) q = q.start(token);
  return q;
}

/** list kinds with a given key value
* @param keyFilters table that looks like {property: uniqueID} or [property, operation, uniqueID, property, operation, uniqueID, ...]
* if keyFilters has a SORTBY property, that will be removed as a filer, and used as an order to use.
*/
function DS_listBy (kind, keyFilters, limit, token, cb, cachedLifetime) {
  var FORCED = keyFilters.FORCED;
  if(FORCED) { keyFilters.FORCED = undefined; }
  var q = DS_buildListByQuery(kind, keyFilters, limit, token, cb);
  var qid = DS_QueryIdString(q);
  DS_getCached(qid, function (err,cached) {
    if(!FORCED && cached) { cb(null, cached.dat, cached.next); }
    else {
      DS_ensureSession(function (tryAgainOnDatabaseTimeout) {
        ds.runQuery(q, function (err, entities, nextQuery) {
          if (err) { 
            if(!tryAgainOnDatabaseTimeout(err)) {
              log("DS_listBy runQuery: "+err);
              var errorMsg = "DS listBy "+qid+" ";
              if(typeof err === 'string') { errorMsg += err;}
              else { errorMsg += JSON.stringify(err);}
              return cb(errorMsg);
            } else { return; }
          }
          //log("ENTITIES--------------\n"+JSON.stringify(entities));
          //log("DS--------------------\n"+JSON.stringify(ds));
          var hasMore = entities.length === (limit && nextQuery)? nextQuery.startVal : false;
          //cb(null, entities.map(DS_fromDatastore, kind), hasMore);
          var cached = {dat:entities.map(DS_fromDatastore, kind),next:hasMore};
          if(cachedLifetime > 0) {
            DS_setCached(qid, cached, function (err){cb(null, cached.dat, cached.next);}, cachedLifetime);
          } else {
            cb(null, cached.dat, cached.next);
          }
        });
      });
    }
  });
}

function DS_uncacheListBy(kind, keyFilters, limit, token, cb) {
  var FORCED = keyFilters.FORCED;
  if(FORCED) { keyFilters.FORCED = undefined; }
  var q = DS_buildListByQuery(kind, keyFilters, limit, token, cb);
  var qid = DS_QueryIdString(q);
  DS_setCached(qid, null, function (err){
    cb(err);
  }, 0); // zero seconds. forget about this right quick.
}

/** add or update an entry. calls toDatastore to correctly format the data
* @param id to update. if null, will get a new unique ID
*/
function DS_update (kind, id, data, cb) {
  log("DS_update "+kind+" "+id);
  var key;
  if (id) { key = ds.key([kind, parseInt(id, 10)]);
  } else { 
    if(schema[kind].created) { data.created = Date.now(); }
    key = ds.key(kind);
  }
  if(schema[kind].modified) { data.modified = Date.now(); }

  var qid = DS_UpdateIdString(kind,id);
  DS_setCached(qid,data,function(err){
    var entity = { key: key, data: DS_toDatastore(data, kind) };
    DS_ensureSession(function (tryAgainOnDatabaseTimeout) {
      ds.save( entity, function (err) {
        data.id = entity.key.id;
        if(schema[kind].id == t_STR && data.id) { data.id = data.id.toString(); }
        if(err) { 
          if(!tryAgainOnDatabaseTimeout(err)) {
            var errorMsg = "DS update "+qid+" ";
            if(typeof err === 'string') { errorMsg += err;}
            else { errorMsg += JSON.stringify(err);}
            return cb(errorMsg);
          }else{return;}
        }
        cb(err, data);
      });
    });
  });
}
function DS_read (kind, id, cb, cachedLifetime) {
  log("DS_read "+kind+" "+id);
  var key = ds.key([kind, parseInt(id, 10)]);
  var qid = DS_UpdateIdString(kind,id);
  DS_getCached(qid, function (err,cached) {
    if(cached && cachedLifetime > 0) { cb(null,cached); }
    else {
      DS_ensureSession(function (tryAgainOnDatabaseTimeout) {
        ds.get(key, function (err, entity) {
          if(err) {
            if(!tryAgainOnDatabaseTimeout(err)){
              var errorMsg = "DS update "+qid+" ";
              if(typeof err === 'string') { errorMsg += err;}
              else { errorMsg += JSON.stringify(err);}
              return cb(errorMsg);
            }else{return;}
          }
          if (!entity) { return cb({ code: 404, message: 'Not found' }); }
          //cb(null, DS_fromDatastore(entity, kind));
          var cached = DS_fromDatastore(entity, kind);
          DS_setCached(qid, cached, function (err){cb(null,cached);}, cachedLifetime);
        });
      });
    }
  });
}
function DS_delete (kind, id, cb) { 
  log("DS_delete "+kind+" "+id);
  var qid = DS_UpdateIdString(kind,id);
  DS_setCached(qid, null, function (err){
    DS_ensureSession(function (tryAgainOnDatabaseTimeout) {
      var key = ds.key([kind, parseInt(id, 10)]); ds.delete(key, function(err){
        if(err) {
          if(!tryAgainOnDatabaseTimeout(err)) {
            cb(err);
          }else{return;}
        }
        cb(err);
      });
    });
  }, 0); // zero seconds. forget about this right quick.
}

// Basic 404 handler
app.use(function (req, res) { res.status(404).send('Not Found'); });

// Basic error handler
app.use(function (err, req, res, next) {
  /* jshint unused:false */
  console.error(err+"\n"+JSON.stringify(err));
  // If our routes specified a specific response, then send that. Otherwise,
  // send a generic message so as not to leak anything.

  //res.status(500).send(err.response || 'Something broke!');
  END(req,res,'Something broke!');
});

if (module === require.main) {
  // Start the server
  var server = app.listen(config.get('PORT'), function () {
    var port = server.address().port;
    console.log('App listening on port %s', port);
  });
}

module.exports = app;
