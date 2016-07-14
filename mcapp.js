'use strict';

var express = require('express');
var app = express();
var config = require('./config');
var path = require('path');
var session = require('express-session');
var passport = require('passport');
var waterfall = require('async-waterfall'); // TODO replace async.waterfall use with just waterfall
var MemcachedStore = require('connect-memcached')(session);
var mvaganov = require('./views/mvaganov');

// Configure the session and session storage.
var sessionConfig = {
  resave: false, saveUninitialized: false, secret: config.get('SECRET'), signed: true
};

var memStore;
var memcacheCon = config.get('MEMCACHE_URL');
console.log("connecting to memcache at "+memcacheCon);
memStore = sessionConfig.store = new MemcachedStore({
hosts: [memcacheCon]
});
console.log("memcache creation done (?)");

app.use(session(sessionConfig));

// OAuth2 --THANKS GOOGLE!
app.use(passport.initialize());
app.use(passport.session());

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
  res.redirect("/auth/login?return="+encodeURIComponent(req.originalUrl));
}
/** */
function ensureLoginGET(req, res) {
  var gid = GetUserID(req);
  if(gid == null) { return forceUserLogin(req, res); }
  return gid;
}

app.get('/',function (req,res) {
	var memc = memStore;//.client;
	waterfall([
		function setSomething(callback){
			memc.set('test1', 'this is a test ['+Date.now()+']', function(err){
				res.write("<!DOCTYPE html>"+JSON.stringify(err)+"<br><br>");
				callback(null);
			});
		}, function doWebpage (callback){
			var data = {memStore:memStore};
			var htmlOutput = mvaganov.jsoNavHtml(req,res,data);
			if(htmlOutput && htmlOutput.length > 0) {
				//response.setHeader("Content-Type", "text/html");
				res.write(htmlOutput);
				//response.end();
			}
			callback(null);
		}, function getSomething(callback){
			memc.get('test1', function (err, data) {
				res.write('<br>err: '+JSON.stringify(err)+'<br>data: '+JSON.stringify(data));
				callback(null);
			});
		}, function itsover(callback){
			res.end("----");
			callback(null);
		}
	]);
});


// Basic 404 handler
app.use(function (req, res) { res.status(404).send('Not Found?'); });

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
