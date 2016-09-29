//Includes
var mongojs = require('mongojs');
var express = require('express');
var Discord = require('discord.js');
var http = require('http');
var fs = require('fs');
var util = require('util');
var favicon = require('serve-favicon');
var finalhandler = require('finalhandler');
var moment = require('moment');
var socketIO = require('socket.io');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var auth = require('passport-local-authenticate');


//Initialize globals
	//For Discord Bot
	var discordLogfile = fs.openSync(__dirname + '/logs/DragonLANBot.log', 'a', 0666);
	var bot = new Discord.Client();
	var token = 'MjIyNTIwNDEzNTgwODIwNDgy.Cq-6PQ.gUV-gybGKOFH4Z_SYm5Drf9EOBo';
	//For Website
	var _favicon = favicon(__dirname + '/hostedItems/favicon.ico');
	var eloLogfile = fs.openSync(__dirname + '/logs/SmashElo.log', 'a', 0666);
	var db = mongojs('SmashElo');
	var app = express();
	var httpServer = http.Server(app);
	var io = socketIO(httpServer);
	var players = db.collection('players');
	var matches = db.collection('matches');
//WEBSITE STARTS HERE
	//set some app settings
	app.use(express.static(__dirname + '/hostedItems'));
	app.set('view engine', 'jade');
	app.use(require('morgan')('combined'));
	app.use(require('cookie-parser')());
	app.use(require('body-parser').urlencoded({ extended: true }));
	app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));
	//Utility stuff
	function buildScoreboard(callback){
		
		players.find({meleeRating: {$exists: true}}, {meleeRating:1, meleeWins:1, meleeLosses:1, meleeMain:1, displayName:1, username:1}, function(err, meleePlayers){
			for (var i = 0; i < meleePlayers.length; i++){
				if(meleePlayers[i]['meleeWins'] + meleePlayers[i]['meleeLosses'] <= 10){meleePlayers[i]['meleeRating'] = "Unranked"};
			}
			shuffle(meleePlayers);
			meleePlayers.sort(compareToSortMelee);
			callback({game: 'melee', data: meleePlayers});
		});
		players.find({pmRating: {$exists: true}}, {pmRating:1, pmWins:1, pmLosses:1, pmMain:1, displayName:1, username:1}, function(err, pmPlayers){
			for (var i = 0; i < pmPlayers.length; i++){
				if(pmPlayers[i]['pmWins'] + pmPlayers[i]['pmLosses'] <= 10){pmPlayers[i]['pmRating'] = "Unranked"};
			}
			shuffle(pmPlayers);
			pmPlayers.sort(compareToSortPm);
			callback({game: 'pm', data: pmPlayers});
		});
		players.find({smashFourRating: {$exists: true}}, {smashFourRating:1, smashFourWins:1, smashFourLosses:1, smashFourMain:1, displayName:1, username:1}, function(err, smashFourPlayers){
			for (var i = 0; i < smashFourPlayers.length; i++){
				if(smashFourPlayers[i]['smashFourWins'] + smashFourPlayers[i]['smashFourLosses'] <= 10){smashFourPlayers[i]['smashFourRating'] = "Unranked"};
			}
			shuffle(smashFourPlayers);
			smashFourPlayers.sort(compareToSortSmashFour);
			callback({game: 'smashFour', data: smashFourPlayers});
		});
	}
function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}
function compareToSortMelee(a, b){
	if (a.meleeRating == b.meleeRating){
		return 0
	}
	if (a.meleeRating == "Unranked"){
		return 1
	}
	if (b.meleeRating == "Unranked"){
		return -1;
	}
	if (a.meleeRating < b.meleeRating){
		return 1;
	}
	if (b.meleeRating < a.meleeRating){
		return -1;
	}
	return 0;
}
function compareToSortSmashFour(a, b){
	if (a.smashFourRating == b.smashFourRating){
		return 0
	}
	if (a.smashFourRating == "Unranked"){
		return 1
	}
	if (b.smashFourRating == "Unranked"){
		return -1;
	}
	if (a.smashFourRating < b.smashFourRating){
		return 1;
	}
	if (b.smashFourRating < a.smashFourRating){
		return -1;
	}
	return 0;
}
function compareToSortPm(a, b){
	if (a.pmRating == b.pmRating){
		return 0
	}
	if (a.pmRating == "Unranked"){
		return 1
	}
	if (b.pmRating == "Unranked"){
		return -1;
	}
	if (a.pmRating < b.pmRating){
		return 1;
	}
	if (b.pmRating < a.pmRating){
		return -1;
	}
	return 0;
}
	//Passport authentication and login
	passport.use(new Strategy(function(uname, password, callback){
		players.find({username: uname}, function(err, docs){
			var user = docs[0];
			if(err){return callback(err);}
			if(!user){return callback(null, false);}
			auth.verify(password, user['password'], function(err, verified){
				if(!verified){return callback(null, false);}
				return callback(null, user);
			});
		});
	}));
	
	passport.serializeUser(function(user, callback){
		callback(null, user['username']);
	});
	
	passport.deserializeUser(function(uname, callback){
		players.find({username:uname}, function(err, docs){
			if(err) {return callback(err)};
			callback(null, docs[0]);
		});
	});
	app.use(passport.initialize());
	app.use(passport.session());

	//HTTP GET Endpoints
	app.get('/', function(req, res){
		if(req.user){
		res.render(__dirname + '/pages/jade/index.jade', {user: req.user['username']});
		}
		else{
			res.render(__dirname + '/pages/jade/index.jade', {});
		}
	});
	app.get('/register', function(req, res){
		if(req.user){
		res.render(__dirname + '/pages/jade/register.jade', {user: req.user['username']});
		}
		else{
			res.render(__dirname + '/pages/jade/register.jade', {});
		}
	});
	app.get('/report', function(req, res){
		if(req.user){
		res.render(__dirname + '/pages/jade/report.jade', {user: req.user['username']});
		}
		else{
			res.render(__dirname + '/pages/jade/report.jade', {});
		}
	});
	app.get('/login', function(req, res){
		if(req.user){
		res.render(__dirname + '/pages/jade/login.jade', {user: req.user['username']});
		}
		else{
			res.render(__dirname + '/pages/jade/login.jade', {});
		}
	});
	app.get('/logout', function(req, res){
		req.logout();
		res.redirect('back');
	});
	app.get('/user/:username', function(req, res){
		var uname = req.params.username;
		players.find({username: uname}, {password:0, _id:0, username: 0}, function(err, docs){
			if(err || !docs[0]){res.render(__dirname + '/pages/jade/unf.jade', {user: uname});}
			else{
				if(req.user){
					if(req.user['username'] == uname){res.render(__dirname + '/pages/jade/profile.jade', {userJson: JSON.stringify(docs[0]), user: req.user['username'], edit: true});}
					res.render(__dirname + '/pages/jade/profile.jade', {userJson: JSON.stringify(docs[0]), user: req.user['username'], edit: false});
				}
				else{
					res.render(__dirname + '/pages/jade/profile.jade', {userJson: JSON.stringify(docs[0]), edit: false});;
				}
			}
		});
	});
	//HTTP POST Endpoints
	app.post('/login', passport.authenticate('local', {failureRedirect: '/register'}), function(req, res){
		res.redirect('/');
	});
	//Client-server communication post page load
	io.sockets.on('connection', function(socket){
		//Spawn the initial scoreboard
		buildScoreboard(function(data){
			socket.emit('refreshScoreboard', {reason: 'firstConnect', scoreboardJson: data});
		});
		//To edit a user's account
		socket.on('editInfo', function(data){
			var userToChange = data['username'];
			var pass = data['password'];
			players.find({username: userToChange}, function(err, docs){
				if(err || !docs[0]){socket.emit('editInfo', {status:0, reason:"error changing user"}); return;}
				auth.verify(pass, docs[0]['password'], function(err, verified){
					if(!verified || err){socket.emit('editInfo', {status:0, reason:"error authenticating user"}); return;}
					if(data['newPass'] && data['newPass'] != ""){
						auth.hash(data['newPass'], function(err, hashed){
							players.update({username:userToChange}, {$set:{password:hashed}});
						});
					}
					if(data['newName'] && data['newName'] != ""){
						players.update({username:userToChange}, {$set:{displayName: data['newName']}});
					}
				});
			});
		});
		//When registering on the register page do this
		socket.on('register', function(data){
			//Booleans for if the user is joining that game or not
			var melee = data['melee'];
			var smashFour = data['smashFour'];
			var pm = data['pm'];
			//The new user's name and password
			var newName = data['name'];
			var pass = data['password'];
			var college = data['school'];
			players.find({username: newName}, function(err, docs){
				if(err){
					//If there is an error finding the user, log it
					socket.emit('register', {status: 0, reason: 'error'});
					fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error searching for username ' + newName + ' while registering\n');
				}
				else if(docs[0]){
					//If the user already exists tell the page to display an alert
					socket.emit('register', {status: 0, reason: 'exists'});
				}
				else{
					auth.hash(pass, function(err, hashed){
						if(err){socket.emit('register',{status:0, reason: 'error hashing'}); return;} //if there is an error hashing the password tell the page to alert
						players.insert({username: newName, displayName: newName, password: hashed, matchHistory: [], school: college, admin:false}, function(){
						fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'User ' + newName + ' created\n'); //Log the creation of a new user
						//Add melee, smash 4 and/or pm to the user
						if(melee){players.update({username:newName}, {$set: {meleeRating: 1200, meleeWins: 0, meleeLosses: 0, meleeMatchups: {}, meleeMain: data['meleeMain']}});}
						if(smashFour){players.update({username:newName}, {$set: {smashFourRating: 1200, smashFourWins: 0, smashFourLosses: 0, smashFourMatchups: {}, smashFourMain: data['smashFourMain']}});}
						if(pm){players.update({username:newName}, {$set: {pmRating: 1200, pmWins: 0, pmLosses: 0, pmMatchups: {}, pmMain: data['pmMain']}});}
						});
						//Tell the client it succeded
						socket.emit('register', {status: 1, reason: 'success'});
						buildScoreboard(function(data){
							//Refresh all scoreboards
							io.emit('refreshScoreboard', {reason: 'newUser', scoreboardJson: data});
						});
					});
				}
			});
		});
		//When reporting a match on the report page do this
		socket.on('report', function(data){
			//The two players in the game and the game played
			var playerOne = data['playerOne'];
			var playerTwo = data['playerTwo'];
			var gamePlayed = data['game'];
			players.find({username: playerOne}, function(err1, playerOneEntry){
				if(err1){
					//If there is an error finding the player, log it and tell the client
					fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error finding player ' + playerOne + '\n');
					socket.emit('report', {status: 0, reason: 'error'});
				}
				else if(!playerOneEntry[0][gamePlayed + 'Rating']){
					//If the player is not registered for this game tell the client
					socket.emit('report', {status: 0, reason: 'playerNotRegistered', playerName: playerOne});
				}
				else{
					players.find({username: playerTwo}, function(err2, playerTwoEntry){
						if(err2){
							//If there is an error finding the player, log it and tell the client
							fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error finding player ' + playerTwo + '\n');
							socket.emit('report', {status: 0, reason: 'error'});
						}
						else if(!playerTwoEntry[0]){
							//If player two does not exist send the client an alert
							socket.emit('report', {status: 0, reason: 'playerDoesNotExist', playerName: playerTwo});
						}
						else if(!playerTwoEntry[0][gamePlayed + 'Rating']){
							//If the player is not registered for this game tell the client
							socket.emit('report', {status: 0, reason: 'playerNotRegistered', playerName: playerTwo});
						}
						else{
							//Pull the game data from the initial form
							var playerOneGamesWon = parseInt(data['playerOneGamesWon']);
							var playerTwoGamesWon = parseInt(data['playerTwoGamesWon']);
							var numGamesPlayed = playerOneGamesWon + playerTwoGamesWon;
							//Pull some data from the two returned documents from the database queries
							var playerOneRatingBefore = playerOneEntry[0][gamePlayed + 'Rating'];
							var playerTwoRatingBefore = playerTwoEntry[0][gamePlayed + 'Rating'];
							//Calculate the expected outcome
							var playerOneScore = playerOneGamesWon / numGamesPlayed;
							var playerTwoScore = playerTwoGamesWon / numGamesPlayed;
							var playerOneExpected = 1 / (1 + Math.pow(10, ((playerTwoRatingBefore - playerOneRatingBefore)/400)));
							var playerTwoExpected = 1 / (1 + Math.pow(10, ((playerOneRatingBefore - playerTwoRatingBefore)/400)));
							//Calculate the K Value (How much each player can win or lose from this game or set)
							var kVal = (Math.log(numGamesPlayed + 1) / Math.log(1.1))*4;
							//Add the kValue times the difference in performance to the player's rating (rating = rating + kVal*(actualScore - expectedScore)). If it is within the user's first 10 games then make it count twice as much.
							if(playerOneEntry[0][gamePlayed + 'Wins'] + playerOneEntry[0][gamePlayed + 'Losses'] <= 10){
								var playerOneNewRating = playerOneRatingBefore + Math.floor(2*kVal*(playerOneScore - playerOneExpected));
							}
							else{
								var playerOneNewRating = playerOneRatingBefore + Math.floor(kVal*(playerOneScore - playerOneExpected));
							}
							if(playerTwoEntry[0][gamePlayed + 'Wins'] + playerTwoEntry[0][gamePlayed + 'Losses'] <= 10){
								var playerTwoNewRating = playerTwoRatingBefore + Math.floor(2*kVal*(playerTwoScore - playerTwoExpected));
							}
							else{
								var playerTwoNewRating = playerTwoRatingBefore + Math.floor(kVal*(playerTwoScore - playerTwoExpected));
							}
							//Insert the recording of the match into the matches collection
							matches.insert({reporter: {username: playerOne, ratingBefore: playerOneRatingBefore, ratingAfter: playerOneNewRating}, opponent: {username: playerTwo, ratingBefore: playerTwoRatingBefore, ratingAfter: playerTwoNewRating}, game: gamePlayed});
							//Build the JSON for the update to the players collection
							var playerOneJson = {$set:{}, $push:{}};
							playerOneJson['$push']['matchHistory'] = {};
							playerOneJson['$push']['matchHistory']['game'] = gamePlayed;
							playerOneJson['$push']['matchHistory']['playedAgainst'] = playerTwo;
							playerOneJson['$push']['matchHistory']['gamesWon'] = playerOneGamesWon;
							playerOneJson['$push']['matchHistory']['gamesLost'] = playerTwoGamesWon;
							if(!playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo]){
								playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo] = {wins:0,losses:0};
							}
							playerOneJson['$set'][gamePlayed + 'Matchups.' + playerTwo + ".wins"] = playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo]['wins'] + playerOneGamesWon;
							playerOneJson['$set'][gamePlayed + 'Matchups.' + playerTwo + ".losses"] = playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo]['losses'] + playerTwoGamesWon;
							playerOneJson['$set'][gamePlayed + 'Rating'] =  playerOneNewRating;
							playerOneJson['$set'][gamePlayed + 'Wins'] = playerOneEntry[0][gamePlayed + 'Wins'] + playerOneGamesWon;
							playerOneJson['$set'][gamePlayed + 'Losses'] = playerOneEntry[0][gamePlayed + 'Losses'] + playerTwoGamesWon;
							var playerTwoJson = {$set:{}, $push:{}};
							playerTwoJson['$push']['matchHistory'] = {};
							playerTwoJson['$push']['matchHistory']['game'] = gamePlayed;
							playerTwoJson['$push']['matchHistory']['playedAgainst'] = playerOne;
							playerTwoJson['$push']['matchHistory']['gamesWon'] = playerTwoGamesWon;
							playerTwoJson['$push']['matchHistory']['gamesLost'] = playerOneGamesWon;
							if(!playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne]){
								playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne] = {wins:0,losses:0};
							}
							playerTwoJson['$set'][gamePlayed + 'Matchups.' + playerOne + ".wins"] = playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne]['wins'] + playerTwoGamesWon;
							playerTwoJson['$set'][gamePlayed + 'Matchups.' + playerOne + ".losses"] = playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne]['losses'] + playerOneGamesWon;
							playerTwoJson['$set'][gamePlayed + 'Rating'] = playerTwoNewRating;
							playerTwoJson['$set'][gamePlayed + 'Wins'] = playerTwoEntry[0][gamePlayed + 'Wins'] + playerTwoGamesWon;
							playerTwoJson['$set'][gamePlayed + 'Losses'] = playerTwoEntry[0][gamePlayed + 'Losses'] + playerOneGamesWon;
							fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Match reported between ' + playerOne + ' and ' + playerTwo + '\n');
							//Send the update queries to the DB
							players.update({username: playerOne}, playerOneJson);
							players.update({username: playerTwo}, playerTwoJson);
							//Report success to the client
							socket.emit('report', {status: 1, reason: 'success'});
							buildScoreboard(function(data){
								io.emit('refreshScoreboard', {reason: 'matchReported', scoreboardJson: data});
							});
						}
					});
				}
			});
		});
	});
	

	//Start listening
	httpServer.listen(80);

//DISCORD BOT STARTS HERE
	//Messages
	var helpMessage = 'This is the DragonLAN Discord administration Bot!\nHere is my list of commands:\n   -dl add game (list of games separated by spaces)     adds the user to the group for all games in the list (case sensetive\n   -dl list games                                                                       lists all currently supported games\n\nIf you have any questions about me, talk to <@99875889797414912> on the DragonLAN Server or in a direct message!'
	
	//Log when the bot is ready to respond to queries
	bot.on('ready', () => {
	  fs.writeFileSync(discordLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'I am ready!\n');
	});

	//Greet new users
	bot.on('guildMemberAdd', (guild, member) => {
		var botCommandsChannel = guild.channels.find('name', 'botcommands');
		botCommandsChannel.sendMessage('Welcome <@' + member.id + '>! It is their first time on the server!');
		botCommandsChannel.sendMessage('<@' + member.id + '> please type "-dl help" in this channel for some help in getting set up, I reccomend you mute this channel as it gets a large amount of messages. If you have any questions feel free to message <@99875889797414912> for answers');
		fs.writeFileSync(discordLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + member.id + ' with name ' + member.user.username + ' joined the server for the first time\n');
	});

	// on a message
	bot.on('message', message => {
		var input = message.content.split(" ");
		if(input[0] == "-dl" && message.channel.id == 222765483806425088){
		// if it follows the patter '-dl add game' then do this
			if (input[1] == 'add' && input[2] == 'game'){
				var user = message.member;
				var server = message.guild;
				var usersRoles = user.roles.array();
				for (var i = 3; i < input.length; i++){
					//for each item in the list check if it is a blocked word
					if(input[i] == 'Admin' || input[i] == 'Aethex' || input[i] == 'Officers' || input[i] == 'Coordinator'){
						fs.writeFileSync(discordLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + user.id + ' with name ' + user.user.username + ' attempted to join the role ' + input[i] + ' but was denied\n');
						message.channel.sendMessage('Role ' + input[i] + ' is locked');
					}
					//Check if the role exists and join it if it does
					else if(server.roles.find('name', input[i])){
						var roleToAdd = server.roles.find('name', input[i]);
						usersRoles.push(roleToAdd);
						message.channel.sendMessage('Added <@' + user.id + '> to the game ' + input[i]);
						fs.writeFileSync(discordLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Added user ' + user.id + ' with name ' + user.user.username + ' to the role ' + input[i] + '\n');
					}
					//if the role does not exist then say so
					else{
						fs.writeFileSync(discordLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + user.id + ' with name ' + user.user.username + ' attempted to join the role ' + input[i] + ' but it does not exist\n');
						message.channel.sendMessage('Role ' + input[i] + ' does not exist!');
					}
				}
				user.setRoles(usersRoles);
			}
			else if(input [1] == 'list' && input[2] == 'games'){
				//if the command is 'list games' then return a list of the games
				message.channel.sendMessage('Supported games are: Smash, LoL (League of Legends), Overwatch, DotA2, CS:GO, Hearthstone')
			}
			else if(input[1] == 'help' || input.length == 1){
				message.channel.sendMessage('Sending <@' + message.member.id + '> commands list');
				fs.writeFileSync(discordLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'user ' + message.member.id + ' with name ' + message.member.user.username + ' requested the help prompt\n');
				message.member.sendMessage(helpMessage);
			}
			else{
				message.channel.sendMessage('unrecognized command');
			}
		}
		else if(input[0] == '-dl'){
			message.channel.sendMessage('I do not respond to commands here, head over to <#222765483806425088> if you want to interact with me!');
		}
	});

	// log the bot in
	bot.login(token);

