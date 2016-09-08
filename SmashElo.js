var http = require("http");
var mongojs = require('mongojs');
var fs = require('fs');
var formidable = require('formidable');
var util = require('util');
var favicon = require('serve-favicon');
var finalhandler = require('finalhandler');
var moment = require('moment');

var _favicon = favicon(__dirname + '/hostedItems/favicon.ico');
var logfile = fs.openSync(__dirname + '/logs/SmashElo.log', 'a', 0666);
var db = mongojs('SmashElo');

var server = http.createServer(function(req, res){
	var done = finalhandler(req, res);
	_favicon(req, res, function onNext(err){
		if(err) return done(err);
		if(req.method.toLowerCase() == 'get'){
			if(req.url == '/index' || req.url == '/' || req.url == '/scoreboard'){
				displayFile("", res, 'scoreboard.html');
			}
			else if(req.url == '/register'){
				displayFile("", res, 'register.html')
			}
			else if(req.url == '/report'){
				displayFile("", res, 'reportMatch.html');
			}
			else{
				res.write('404 page not found');
				res.end();
			}
		} else if (req.method.toLowerCase() == 'post'){
			if(req.url == '/report'){
				processGameReport(req, res);
			}
			else if(req.url == '/register'){
				registerNewUser(req, res);
			}
		}
	});
});



function displayFile(announce, res, file){
	var html = "<html><head><title>Drexel Smash Ladder</title></head><body><h1>" + announce + "</h1>"
	fs.readFile(__dirname + '/hostedItems/' + file, function(err, data){
		db.collection('players').find().sort({rating: -1}, function(err, docs){
			html += data;
			html += "<table><thead><th>Player</th><th>Rating</th></thead>"
			for(var i = 0; i < docs.length; i++){
				html += "<tr><td>" + docs[i]['name'] + "</td><td>" + docs[i]['rating'] + "</td></tr>";
			}
			html += "</table>";
			fs.readFile(__dirname + '/hostedItems/footer.html', function(err, data){
				html += data;
				html += "</body></html>";
				res.writeHead(200, {
					'Content-Type': 'text/html', 'Content-Length': html.length
				});
				res.write(html, function(err){res.end();});
			});
		});

	});
}

function registerNewUser(req, res){
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files){
		var newName = fields['name'];
		db.collection('players').find({name: newName}, function(err, docs){
			if(err){
				fs.writeFileSync(logfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error searching for name ' + newName + ' while registering\n');
			}
			if(docs[0]){
				displayFile("User " + newName + " already exists with rating " + docs[0]['rating'], res, 'register.html');
			}
			else{
				fs.writeFileSync(logfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'User ' + newName + ' created with rating of 1200\n');
				db.collection('players').insert({name: newName, rating: 1200});
				displayFile("User " + newName + " created with rating of 1200", res, 'register.html');
			}
		});
	});
}
function processGameReport(req, res){
	var form = new formidable.IncomingForm();
	
	form.parse(req, function(err, fields, files){
		db.collection('players').find({name: fields['winner'].toLowerCase()}, function(winnerErr, winnerDocs){
			if(winnerErr){
				fs.writeFileSync(logfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error finding winner ' + fields['winner'] + '\n');
			}
			if(winnerDocs[0]){
				db.collection('players').find({name: fields['loser'].toLowerCase()}, function(loserErr, loserDocs){
					if(loserErr){
						fs.writeFileSync(logfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error finding loser ' + fields['loser'] + '\n');
					}
					if(loserDocs[0]){
						var winner = fields['winner'];
						var loser = fields['loser'];
						var winnerRatingBefore = winnerDocs[0]['rating'];
						var loserRatingBefore = loserDocs[0]['rating'];
						var winnerScore = fields['gamesWon'] / fields['gamesPlayed'];
						var loserScore = 1 - winnerScore;
						var winnerExpected = 1 / (1 + Math.pow(10, ((loserRatingBefore - winnerRatingBefore)/400)));
						var loserExpected = 1 - winnerExpected;
						var kVal = (Math.log(fields['gamesWon']*2) / Math.log(1.1))*4;
						var winnerRating = winnerRatingBefore + Math.ceil(kVal*(winnerScore - winnerExpected));
						var loserRating = loserRatingBefore + Math.floor(kVal*(loserScore - loserExpected));
						fs.writeFileSync(logfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + winner + " rating changed from " + winnerRatingBefore + " to " + winnerRating + "\n" + loser + " rating changed from " + loserRatingBefore + " to " + loserRating + '\n')
						db.collection('players').update({name: winner.toLowerCase()}, {$set: {rating: winnerRating}}, {multi:false}, function(){});
						db.collection('players').update({name: loser.toLowerCase()}, {$set: {rating: loserRating}}, {multi:false}, function(){});
						displayFile("Game Recorded", res, 'reportMatch.html');
					}
					else{
						displayFile("Cannot find user " + fields['loser'] + ", maybe <a href='/register'>register</a> them?", res, 'reportMatch.html');
					}
				});
			}
			else{
				displayFile("Cannot find user " + fields['winner'] + ", maybe <a href='/register'>register</a> them?", res, 'reportMatch.html');
			}
		});
	});
}
server.listen(80);
