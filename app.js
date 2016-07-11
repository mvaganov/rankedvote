// Apache 2.0 License - 2016, Michael Vaganov
// author: mvaganov@shschools.org
// Based on work by Google, Inc at https://github.com/GoogleCloudPlatform/nodejs-getting-started.git
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';
const vm = require('vm'); // for running possibly unsafe code

var path = require('path');
var express = require('express');
var session = require('express-session');
var MemcachedStore = require('connect-memcached')(session);
var passport = require('passport');
var config = require('./config');
var waterfall = require('async-waterfall'); // TODO replace async.waterfall use with just waterfall

var SimpleCache = require("simple-lru-cache"); // <-- simple cache! https://www.npmjs.com/package/simple-lru-cache

var gcloud = require('gcloud');
var ds = gcloud.datastore({ projectId: config.get('GCLOUD_PROJECT') });
var irv = require('./app/irv');

var app = express();
var mvaganov = require('./app/mvaganov');

var MUST_HAVE_VAR_GROUP = {};
function MUST_HAVE_VAR(varname, varGroup) {
  var result = config.get(varname);
  if(!result || !result.length) {
    throw "app.js requires config.json contain '"+varname+"'";
  }
  if(varGroup){
    if(!MUST_HAVE_VAR_GROUP[varGroup]) {
      MUST_HAVE_VAR_GROUP[varGroup] = [];
    } else if(MUST_HAVE_VAR_GROUP[varGroup].indexOf(result) >= 0) {
      throw "'"+varname+" must have a unique value. '"+result+"' already taken.";
    }
    MUST_HAVE_VAR_GROUP[varGroup].push(result);
  }
  return result;
}

var IS_DEBUG = config.get('rankedvote_debug') == true;
var T_VOTE = MUST_HAVE_VAR('TABLE_VOTE','db');
var T_VOTER = MUST_HAVE_VAR('TABLE_VOTER','db');
var T_DEBATE = MUST_HAVE_VAR('TABLE_DEBATE','db');
var T_DEBATE_ENTRY = MUST_HAVE_VAR('TABLE_DEBATE_ENTRY','db');
var T_DEBATE_RESULT = MUST_HAVE_VAR('TABLE_DEBATE_RESULT','db');
MUST_HAVE_VAR_GROUP = null;

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

// In production use the App Engine Memcache instance to store session data,
// otherwise fallback to the default MemoryStore in development.
if (config.get('NODE_ENV') === 'production') {
  memStore = sessionConfig.store = new MemcachedStore({
    hosts: [config.get('MEMCACHE_URL')]
  });
}

if(IS_DEBUG) app.use(function(req,res,next){
  log(req.method+":"+req.url);
  next();
});
app.use(session(sessionConfig));
// [END session]

// OAuth2 --THANKS GOOGLE!
app.use(passport.initialize());
app.use(passport.session());

app.use(function (req,res,next) {
  if(!req.session.dbAuthExpire) {
    req.session.dbAuthExpire = Date.now() + 60000;
    next();
  } else if(req.session.dbAuthExpire < Date.now()) {
    // log("DB AUTH IN "+(req.session.dbAuthExpire - Date.now()));
    //DS_refreshSession(function(){next()});
    // making any database call after the auth expires will reset the auth token for the database
    GetVoter(req,res,function (){
      req.session.dbAuthExpire = Date.now() + 60000;
      next();
    });
  } else { next(); }
  // log("@@@@@ "+JSON.stringify(req.session));
});

// TODO cache the require call?
app.use(require('./lib/oauth2').router); // handle the authentication heavy lifting plz k thx

/** @return the user ID from the OAuth2 passport, null if not logged in */
function GetUserID(req) {
  if(req.session.passport && req.session.passport.user && req.session.passport.user.id)
    return req.session.passport.user.id.toString();
  return null;
}
/** redirects the user to login using google OAuth2 */
function forceUserLogin(req, res) {
  // login, and return to this page when finished.
  res.redirect("/auth/login?return="+encodeURIComponent(req.originalUrl));
}
/** */
function ensureLoginGET(req, res) {
  var gid = GetUserID(req);
  if(gid == null) { return forceUserLogin(req, res); }
  return gid;
}

/** 
 * @param cb {function(err, voterRecord)}
 */
function GetVoter(req, res, cb) {
  var userID = ensureLoginGET(req, res); if(userID == null) return;
  //log("getting voter ID for "+userID);
  if(userID !== null) {
    DS_listBy (T_VOTER, {'email': req.session.passport.user.email}, 1, null, function (err, entities, cursor) {
      if (err) { log(err); return cb(err, null); }
      if(entities.length == 0) {
        //log("voter record for "+userID+" does not exist. creating...");
        var dat = {
          gid: userID,
          email: req.session.passport.user.email,
          name: req.session.passport.user.displayName,
          data: "{pic:'"+req.session.passport.user.image+"';}", // TODO timestamp vote (timestamp+1m), debate (timestamp+1h), edit debate (timestamp+1m), user update (timestamp+1m)
        };
        DS_update(T_VOTER, null, dat, function (err, entity) {
          if (err) { return next(err); }
          return cb(err, entity);
        });
      } else {
        var err = null;
        if(entities.length != 1) err = entities.length+" records for "+userID;
        if(err) log("\n\n\n\n"+err+"\n\n\n\n");
        return cb(err, entities[0]);
      }
    });

  }
}

function GetDebateEntry(did_or_debateEntity, cb) {
  var did, debateEntity;
  if(typeof did_or_debateEntity === 'string') {
    did = did_or_debateEntity; debateEntity = null;
  } else {
    debateEntity = did_or_debateEntity; did = debateEntity.id;
  }
  if(debateEntity && debateEntity.dentry) { // if the debate is known, and it knows it's entry
    DS_read(T_DEBATE_ENTRY, debateEntity.dentry, function(err, entryData) { // find it.
      if(!entryData) { // if it isn't there, forget about that old entry and try this again.
        debateEntity.dentry = undefined; GetDebateEntry(debateEntity, cb);
      } else { cb(err, entryData); }
    });
  } else { // if the debate is not here...
    // find the debate entry if possible.
    DS_listBy(T_DEBATE_ENTRY, {'did':did}, 1, null, function (err, entryData, cursor) {
      if(entryData && entryData.length && entryData[0].did == did) { return cb(err, entryData[0]); }
      // if there isn't a debate entry, we need to make one...
      waterfall([ function getTheDebate(callback) {
        // if the debate isn't known, find it
        if(!debateEntity) { 
          DS_read(T_DEBATE, did, function(err, data) { debateEntity = data; callback(err); });
        } else { callback(null); }
      }, function createNewDebateEntry(callback) {
        if(!debateEntity) {
          log("WOAH THERE!!!\n\n");
          return cb("ERROR missing debate "+did, debateEntity);
        }
        // make the debate entry
        var de = {
          did: debateEntity.id,
          name: debateEntity.title,
          owner:debateEntity.owner,
          data: {}
        };
        log(JSON.stringify("DEBATE ENTITY ("+did+"): "+debateEntity));
        if(debateEntity.data.visibility) {de.vis = debateEntity.data.visibility;}
        DS_update(T_DEBATE_ENTRY, de.id, de, function (err, entity) { callback(null); cb(err, entity); });
      },function(err){log(JSON.stringify(err));}]);
    });
  }
}

/** debug function */
function printPropertiesOf(obj) {
  if(IS_DEBUG) { mvaganov.printPropertiesOf(obj); }
}

function saferParse(jsonText) {
  var sandbox = {};
  // "use strict;" should prevent arguments.callee.caller from breaking encapsulation
  vm.runInNewContext("\"use strict\"; var dat = "+jsonText, sandbox);
  return sandbox.dat;
}

var cachedHeader = null;
var headerVariables = {title:"<!--title-->", code:"//@", includes:"<!--includes-->", passport:"<!--passport-->"};
var headerVariableNames = [];
var writeWebpageHeader = function(req, res, title, includes, codeToInsert, cb) {
  var _writeWebpageHeader = function(err) {
    if(err) {return cb(err);}
    var includeHtml = "";
    for(var i=0;i<includes.length;++i) {
      includeHtml += '<script src="'+includes[i]+'"></script>';
    }
    var passportHtml;
    if(req.session.passport && req.session.passport.user) {
      var user = req.session.passport.user;
      passportHtml = '<img src="'+
      user.image+'" height="48" class="img-circle"> '+
      user.displayName+' <a href=\"/auth/logout?return='+
      encodeURIComponent(req.originalUrl)+'\">(logout)</a>';
    } else {
      passportHtml = '<a href=\"/auth/login?return='+
      encodeURIComponent(req.originalUrl)+'\"">Login</a>';
    }
    var fillVariables = {};
    fillVariables[headerVariables.title] = title;
    fillVariables[headerVariables.code] = codeToInsert;
    fillVariables[headerVariables.includes] = includeHtml;
    fillVariables[headerVariables.passport] = passportHtml;
    cachedHeader.fillOut(fillVariables, function(str){
      res.write(str);
    }, cb);
  };
  if(!cachedHeader) {
    cachedHeader = new mvaganov.CachedMadlibs();
    var values = [];
    for(var k in headerVariables) { values.push(headerVariables[k]); }
    cachedHeader.initFromFile("app/header.html", values, {keepWhitespace:true}, _writeWebpageHeader);
  } else {
    _writeWebpageHeader(null);
  }
}
var cachedFooter = null;
var writeWebpageFooter = function (req, res, cb) {
  var _writeWebpageFooter = function(err) {
    if(err) { console.log("_writeWebpageFooter error: "+err); return cb(err);}
    cachedFooter.fillOut(null, function(str) {
      res.write(str);
    }, cb);
  };
  if(!cachedFooter) {
    cachedFooter = new mvaganov.CachedMadlibs();
    cachedFooter.initFromFile("app/footer.html", [], null, _writeWebpageFooter);
  } else {
    _writeWebpageFooter(null);
  }
}

function async_waterfall_error(err, result, scope) {
  if(result || err) { log(":/debates scope: "+JSON.stringify(scope)); }
  if(result) { log(":/debates results:"+JSON.stringify(result)); }
  if(err) { log(":/debates ERROR:"+err); }
}

app.get(['*{{*', '*%7b%7b*'], function(req,res, next){ log("angular variable bug..."); res.end(); })

app.get(['/debate/:did','/debate'], function (req, res) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebates(callback) {
      if(req.params.did) {
        DS_read(T_DEBATE, req.params.did, function(err, debate) {
          scope.debate=debate; if(!debate) { res.redirect('/debate'); } else { callback(err); }
        });
      } else { scope.debate=null; callback(null); }
    }, function writeHeader(callback) {
      var debateData;
      if(scope.debate) {
        debateData = JSON.stringify(scope.debate);
      } else {
        debateData = "{data:{candidates:[['0','zero',''],['1','one',''],['2','two','']],choices:[],imgdisp:'none',prompt:\"\"},title:\"\"};";
      }
      var codeToInsert="var RankedVote_servedData="+ debateData + ";var creatorID=\'"+scope.voter.id+"\';";
      var includes = ["../angular.min.js", "../Sortable.js", "../ng-sortable.js", "../common.js","../stringbonus.js",
      "../jsonstate.js", "../debate.js"];
      writeWebpageHeader(req, res, 'New Debate', includes, codeToInsert, callback);
    }, function writeBody(callback) {
      mvaganov.serveFileByLine('app/debate/body.html', null, function(line) { res.write(line); }, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){res.end(); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

app.get('/debates', function(req, res) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebates(callback) { DS_listBy(T_DEBATE_ENTRY, {owner: scope.voter.id /*, SELECT:["name","did"]*/}, 10, req.query.pageToken,
      function(err,debates,pageToken){scope.debates = {debates:debates,pageToken:pageToken}; callback(err);});
    }, function writeHeader(callback) {
      var state = {name:scope.voter.name, 'debates':scope.debates.debates};
      // TODO strip-out some details of each debate to reduce response footprint? figure out what's wrong with the SELECT call?
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(state) + ";var creatorID=\'"+scope.voter.id+"\';";
      writeWebpageHeader(req, res, 'Debates', ["../angular.min.js", "../debates.js"], codeToInsert, callback);
    }, function writeBody(callback) {
      mvaganov.serveFileByLine('app/debates/body.html', null, function lineCallback(line) { res.write(line); }, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){res.end(); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

app.get('/votes', function(req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getVotes(callback) { DS_listBy(T_VOTE, {vid:scope.voter.id},10,req.query.pageToken,
      function(err, votes, pageToken){scope.votes={votes:votes,pageToken:pageToken}; callback(err);});
    }, function writeHeader(callback) {
      var state = {name:scope.voter.name, votes:scope.votes.votes};
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(state) + ";var creatorID=\'"+scope.voter.id+"\';";
      writeWebpageHeader(req, res, 'Votes', ["../angular.min.js", "../votes.js"], codeToInsert, callback);
    }, function writeBody(callback) {
      mvaganov.serveFileByLine('app/votes/body.html', null, function(line) { res.write(line); }, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){res.end(); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

app.get(['/vote/:did','/votex/:did','/vote'], function(req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebate(callback) { 
      if(req.params.did) {
        DS_read(T_DEBATE, req.params.did, function(err, debate){scope.debate=debate;callback(null);});
      } else {scope.debate=null; callback(null);}
    }, function getVote(callback) {
      scope.isVotex = (req.url.indexOf("votex") >= 0 && scope.voter.id == scope.debate.owner);
      if(scope.debate) {
        DS_listBy(T_VOTE, {vid:scope.voter.id, 'did':scope.debate.id}, 1, null, function(err, votes, pageToken){ if(votes) { scope.vote = votes[0]; } callback(null); });
      } else { callback(null); }
    }, function writeHeader(callback) {
      if(scope.debate) {
        if(scope.vote) { // if there is an existing vote
          scope.debate = saferParse(JSON.stringify(scope.debate)); // make a copy to add the user ranking to
          if(scope.vote.data.rank) { scope.debate.rank = scope.vote.data.rank; scope.debate.voteID = scope.vote.id; }
          if(scope.vote.data.ranks) { scope.debate.ranks = scope.vote.data.ranks; scope.debate.voteID = scope.vote.id; }
        }
      } else {
        scope.debate = {
          title:"Invalid Debate ID "+req.params.did,
          data:{ prompt:"The debate you are looking for does not exist. This is could be because the debate was:",
            candidates:[
              ['deleted','<u>Deleted</u>. An administrator or the owner removed the debate from the system',''],
              ['hidden','<i>Hidden</i>. The owner does not want the debate to be visible',''],
              ['error','<b>an Error</b>. You have reached this page because of some other error','']
            ], choices:[],imgdisp:'none' } };
      }
      var includes = [
      //"https://ajax.googleapis.com/ajax/libs/angularjs/1.5.7/angular.js", // use this one for more verbose warnings
      "../angular.min.js",
      //"https://ajax.googleapis.com/ajax/libs/angularjs/1.5.7/angular-sanitize.js",
      "../angular-sanitize.min.js",
      "../Sortable.js", "../ng-sortable.js", "../shadow_tut.js", "../stringbonus.js", "../common.js", 
      (scope.isVotex)?"../votex.js":"../vote.js"];
      var codeToInsert="var RankedVote_servedData="+ JSON.stringify(scope.debate) + ";var creatorID=\'"+scope.voter.id+"\';";
      writeWebpageHeader(req, res, 'Vote', includes, codeToInsert, callback);
    }, function writeBody(callback) {
      mvaganov.serveFileByLine('app/'+((scope.isVotex)?'votex':'vote')+'/body.html', null, function(line) { res.write(line); }, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){res.end(); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

function calculateResults(scope, whenFinished) {
  waterfall([
    function getDebate(callback) {
      log("calculateReuslts: getDebate");
      // get the debate data
      DS_read(T_DEBATE, scope.dentry.did, function(err, data){scope.debate=data; callback(null);})
    }, function getVotes(callback) {
      log("calculateReuslts: getVotes");
      // get all of the vote data for this debate
      // TODO only select data
      DS_listBy(T_VOTE, {did:scope.debate.id}, 1, null, function (err, found, cursor) {scope.votes=found;callback(null);});
    }, function calcResults(callback) {
      log("calculateReuslts: calcResults");
      log("Votes: "+JSON.stringify(scope.votes));
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
      irv(scope.cleanvotes, null, -1, function(calcresults){scope.calcresults=calcresults;callback(null);});
    }, function cleanAndCommitData(callback) {
      log("calculateReuslts: cleanAndCommit");
      // create the submission package for the client, with the results, and debate info
      scope.state = {
        id: scope.debate.id,
        title: scope.debate.title,
        prompt: scope.debate.data.prompt,
        result: scope.calcresults,
        info: [], 
      };
      if(scope.voterfraud) { scope.state.voterfraud = true; } // TODO send username
      for(var r=0;r<scope.state.result.length;++r) {
        var cand = scope.state.result[r].C;
        if(typeof cand === 'string') {
          var list = scope.debate.data.candidates;
          for(var i=0;i<list.length;++i) { 
            if(list[i][0] == cand) { 
              scope.state.info.push(list[i]); break; 
            }
          }
        } else if(cand.constructor == Array) {
          var allText = "",allImg="";
          var additions = 0;
          var list = scope.debate.data.candidates;
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
      DS_update(T_DEBATE_RESULT, scope.dentry.result, 
        {did:scope.dentry.did,data:scope.state}, function (err, resultingData){ 
          scope.debate_result=resultingData; callback(null);
        });
    }, function notify(callback) {
      log("calculateReuslts: notify");
      scope.dentry.lastresult = Date.now();
      scope.dentry.result = scope.debate_result.id;
      DS_update(T_DEBATE_ENTRY, scope.dentry.id, scope.dentry, function(err,obj){callback(null);});
    }, function finished(callback) { whenFinished(null); callback(null); }
  ], function error(err, result) { async_waterfall_error(err, result, scope); });
}

app.get('/result/:did', function(req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var scope = {};
  waterfall([
    function getDebateEntry(callback) {
      // check if there are results available
      GetDebateEntry(req.params.did, function(err, entity){ scope.dentry=entity; callback(err); });
    }, function calculateResultsIfNeeded(callback) {
      log("DENTRY: "+JSON.stringify(scope.dentry));
      // if there are no results, or it's time for a new calculation of results
      if(!scope.dentry.result || !scope.dentry.lastresult || scope.dentry.lastresult < scope.dentry.lastvote) {
        calculateResults(scope, callback);
      } else {
        DS_read(T_DEBATE_RESULT, scope.dentry.result, function(err, databaseresult) {
          scope.debate_result = databaseresult;
          log(JSON.stringify(databaseresult));
          scope.state=databaseresult.data;
          callback(err);
        });
      }
    }, function header(callback) {
      // header with results
      var includes = [
      //"https://ajax.googleapis.com/ajax/libs/angularjs/1.5.7/angular.js", // use this one for more verbose warnings
      "../angular.min.js",
      //"https://ajax.googleapis.com/ajax/libs/angularjs/1.5.7/angular-sanitize.js",
      "../angular-sanitize.min.js",
      "../two.min.js", "../irv_client.js", "../common.js", "../result.js"];
      var codeToInsert="var RankedVote_servedData="+JSON.stringify(scope.state)+";";
      writeWebpageHeader(req, res, 'Result', includes, codeToInsert, callback);
    }, function writeBody(callback) {
      mvaganov.serveFileByLine('app/result/body.html', null, function(line) { res.write(line); }, callback);
    }, function writeFooter(callback) { writeWebpageFooter(req, res, function(){res.end(); callback(null);}); }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

// make sure debates arent duplicated when a debate ID is supplied (as long as the debate exits, and was created by this same user!)
app.post(['/debate/:debateid','/debate'], function update (req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var cookies = req.headers.cookie.parseCookies(); // TODO mvaganov.parseCookies
  var dat = saferParse(cookies.debate);
  var scope = {dat:dat, updatedDebateAlready:false};
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getDebate(callback) { 
      if(req.params.debateid) { // updating existing debate
        DS_read(T_DEBATE, req.params.debateid, function(err, debate){scope.debate=debate;callback(null);});
      } else {scope.debate=null; callback(null);} // creating new debate
    }, function digestCookiesIntoDebate(callback) {
      if(!scope.dat) { return callback("ERROR missing debate cookie "+JSON.stringify(cookies)); }
      if(scope.dat.owner) { scope.dat.owner = scope.dat.owner.toString(); }
      if(scope.dat.id) { scope.dat.id = scope.dat.id.toString();
        if(req.params.debateid != scope.dat.id) { return callback("ERROR mismatching debate ID passed."); }
      }
      // log(":/debate/:did scope.dat: "+JSON.stringify(scope.dat, null, 2));
      if(scope.dat.owner != scope.voter.id) {
        return callback("ERROR incorrect user submission. "+(gid
          ?("Expected user is "+scope.dat.owner+", but instead, user is "+scope.voter.id) :"Not logged in."));
      }
      if(!scope.debate) {// if there is no debate in the database yet, make one! It's expected to be there from this point on!
        return DS_update(T_DEBATE, undefined, scope.dat, function (err, debate) {
          scope.updatedDebateAlready = true;
          scope.debate=debate; callback(err);
        });
      } else if(scope.debate.id != scope.dat.id) { callback("ERROR debate ID mismatch in cookie");
      } else { callback(null); }
    }, function getDebateEntry(callback) {
      GetDebateEntry(scope.debate, function(err, data){scope.dentryEntity=data; callback(err);});
    }, function updateDebateIfNeeded(callback) {
      log("updated already? "+scope.updatedDebateAlready);
      if(!scope.updatedDebateAlready || scope.debate.dentry != scope.dat.dentry) {
        scope.dat.dentry = scope.dentryEntity.id;
        DS_update(T_DEBATE, scope.dat.id, scope.dat, function (err, debate) { scope.debate=debate; callback(err); });
      } else { callback(null); }
    }, function finished(callback) { res.json({id:scope.debate.id}); callback(null); }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

app.post(['/vote/:did','/votex/:did','/vote'], function update (req, res, next) {
  var gid = ensureLoginGET(req, res); if(gid == null) { return; }
  var cookies = req.headers.cookie.parseCookies(); // TODO mvaganov.parseCookies
  var dat = saferParse(cookies.rank);
  var scope = {dat:dat};
  if(dat.did != req.params.did) { return async_waterfall_error("ERROR did in URL does not match did in data", null, scope); }
  waterfall([
    function getVoter(callback) { GetVoter(req, res, function(err,voter){scope.voter=voter;callback(err);});
    }, function getEntry(callback) {
      if(dat.dentry) {
        var debate_entry_id = dat.dentry;
        dat.dentry = null; delete dat.dentry; // remove the debate entry from the vote. it's non-standard!
        DS_read(T_DEBATE_ENTRY, debate_entry_id, function(err, entity) { scope.dentry=entity; callback(err); });
      } else { 
        DS_listBy(T_DEBATE_ENTRY, {did:req.params.did}, 1, null, function(err, results, token) { scope.dentry=results[0]; callback(err); });
      }
    }, function updateTheVote(callback) {
      scope.isVotex = (req.url.indexOf("votex") >= 0 && scope.voter.id == scope.dentry.owner);
      if(!scope.isVotex && dat.data.ranks) { return callback("ERROR only debate owners can submit multiple votes."); }
      if(dat.vid != scope.voter.id) { return callback("ERROR user submitting vote for someone other than themselves"); }
      DS_update(T_VOTE, dat.id, dat, function (err, entity) { scope.vote=entity; callback(err); });
    }, function finishedWithVoteSubmission(callback) { res.json({id:scope.vote.id}); callback(null);
    }, function markLastVote(callback) {
      scope.dentry.lastvote = Date.now();
      DS_update(T_DEBATE_ENTRY, scope.dentry.id, scope.dentry, function(err, entity){callback(null);});
    }
  ], function error(err, result){ async_waterfall_error(err, result, scope); });
});

app.get('/*.js', express.static('app'));
app.get('/*.css', express.static('app'));
app.get('/*.png', express.static('app'));

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
    if(arr){for(var i=0;i<arr.length;++i){if(i>0){str+=",";}str+=arr[i];}}
    return str;
  }
  var serialized=""; if(q.namespace) { serialized += q.namespace; }
  serialized += ";"; serialized += serializeArray(q.kinds);
  serialized += ";";
  if(q.filters) {
    for(var i=0;i<q.filters.length;++i){
      if(i>0){serialized+=",";}
      var f=q.filters[i];serialized+=f.name+f.op+f.val;
    }
  }
  serialized += ";"; serialized += serializeArray(q.orders);
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
  var serialized = ";"+kind+";id="+id+";;;;"+";;;1;-1;";
  log("QUERY ID:"+serialized);
  return serialized;
}

function DS_getCached(qid, callback) {
  //memStore.
  callback(null,null);
}
function DS_setCached(q, data, callback) {
  var qid = typeof q === 'string'?q:QueryIdString(q);
  if(data === undefined) {
    // delete from memstore
  } else {
    //memStore.touch
  }
  callback(null);
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
      excludeFromIndexes: nonIndexed.indexOf(k) !== -1
    });
  });
  return results;
}
// /** list *all* of the kinds... TODO remove */
// function DS_list (kind, limit, token, cb) {
//   log("DS_list");
//   var q = ds.createQuery([kind]) .limit(limit) .order('title') .start(token);
//   ds.runQuery(q, function (err, entities, nextQuery) {
//     if (err) { log("DS_list: "+err); return cb(err); }
//     var hasMore = entities.length === limit ? nextQuery.startVal : false;
//     cb(null, entities.map(DS_fromDatastore, kind), hasMore);
//   });
// }
/** list kinds with a given key value
 * @param keyFilters table that looks like {property: uniqueID} or [property, operation, uniqueID, property, operation, uniqueID, ...]
 * if keyFilters has a SORTBY property, that will be removed as a filer, and used as an order to use.
 */
function DS_listBy (kind, keyFilters, limit, token, cb) {
  log("DS_listBy "+kind+" where "+JSON.stringify(keyFilters)+ " L"+limit+((token)?(" @"+token):"")+" -> "+(typeof cb));
  var q = ds.createQuery([kind]);
  var sortBy = keyFilters.SORTBY;
  var select = keyFilters.SELECT;
  if(select) {
    keyFilters.SELECT = undefined;
    if(select.constructor !== Array) { select = [sortBy]; }
  }
  if(sortBy) {
    keyFilters.SORTBY = undefined;
    if(sortBy.constructor !== Array) { sortBy = [sortBy]; }
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
  if(sortBy) {
    for(var i=0;i<sortBy.length;++i) {
      log("DS_listBy sortBy: "+sortBy[i]);
      q = q.order(sortBy[i]);
    }
  }
  if(limit && limit > 0) q = q.limit(limit);
  if(token) q = q.start(token);
  if(select) {
    log("DS_listBy select: "+select);
    q = q.select(select);
  }
  var qid = DS_QueryIdString(q);
  DS_getCached(qid, function (err,cached) {
    if(cached) { cb(null, cached.dat, cached.next); }
    else {
      DS_ensureSession(function (){
        ds.runQuery(q, function (err, entities, nextQuery) {
          if (err) { log("DS_listBy runQuery: "+err); return cb(err); }
          //log("ENTITIES--------------\n"+JSON.stringify(entities));
          //log("DS--------------------\n"+JSON.stringify(ds));
          var hasMore = entities.length === (limit && nextQuery)? nextQuery.startVal : false;
          //cb(null, entities.map(DS_fromDatastore, kind), hasMore);
          var cached = {dat:entities.map(DS_fromDatastore, kind),next:hasMore};
          DS_setCached(qid, cached, function (err){cb(null, cached.dat, cached.next);});
        });
      });
    }
  });
}

function DS_ensureSession(callback) { callback(); }
function DS_refreshSession(callback) {
  var timeLeft = 0;
  if(ds.authClient.authClient) {
    timeLeft = ds.authClient.authClient.credentials.expiry_date - (Date.now()/1000);
  }
  log("AUTHCLIENT:::::::: "+timeLeft+"\n"+JSON.stringify(ds.authClient));
  // if the credentials will expire in 5 seconds or less
  if(ds.authClient.authClient
  && ds.authClient.authClient.credentials.expiry_date < (Date.now()/1000)+5) {
    log("NEED TO REAUTHENTICATE!!!");
    // re-authenticate session
    ds.authClient.refreshAccessToken(function(err, tokens) {
      // your access_token is now refreshed and stored in oauth2Client
      // store these new tokens in a safe place (e.g. database)
      log("AUTHENTICATED!!!");
      callback();
    });
  } else {
    callback();
  }
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
    DS_ensureSession(function (){
      ds.save( entity, function (err) {
        data.id = entity.key.id;
        if(schema[kind].id == t_STR) { data.id = data.id.toString(); }
        if(err) log("DS_update: "+err);
        cb(err, err ? null : data);
      });
    });
  });
}
function DS_read (kind, id, cb) {
  log("DS_read "+kind+" "+id);
  var key = ds.key([kind, parseInt(id, 10)]);
  var qid = DS_UpdateIdString(kind,id);
  DS_getCached(qid, function (err,cached) {
    if(cached) { cb(null,cached); }
    else {
      DS_ensureSession(function (){
        ds.get(key, function (err, entity) {
          if (err) { log("DS_read: "+err); return cb(err); }
          if (!entity) { return cb({ code: 404, message: 'Not found' }); }
          //cb(null, DS_fromDatastore(entity, kind));
          var cached = DS_fromDatastore(entity, kind);
          DS_setCached(qid, cached, function (err){cb(null,cached);});
        });
      });
    }
  });
  // ds.get(key, function (err, entity) {
  //   if (err) { log("DS_read: "+err); return cb(err); }
  //   if (!entity) { return cb({ code: 404, message: 'Not found' }); }
  //   cb(null, DS_fromDatastore(entity, kind));
  // });
}
function DS_delete (kind, id, cb) { 
  log("DS_delete "+kind+" "+id);
  var qid = DS_UpdateIdString(kind,id);
  DS_setCached(qid, undefined, function (err){
    DS_ensureSession(function (){
      var key = ds.key([kind, parseInt(id, 10)]); ds.delete(key, cb);
    });
  });
  // var key = ds.key([kind, parseInt(id, 10)]); ds.delete(key, cb);
}

// Basic 404 handler
app.use(function (req, res) { res.status(404).send('Not Found'); });

// Basic error handler
app.use(function (err, req, res, next) {
  /* jshint unused:false */
  console.error(err);
  // If our routes specified a specific response, then send that. Otherwise,
  // send a generic message so as not to leak anything.
  res.status(500).send(err.response || 'Something broke!');
});

if (module === require.main) {
  // Start the server
  var server = app.listen(config.get('PORT'), function () {
    var port = server.address().port;
    console.log('App listening on port %s', port);
  });
}

module.exports = app;
