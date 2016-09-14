//Includes
var express = require('express');
var Discord = require('discord.js');
var http = require('http');
var mongojs = require('mongojs');
var fs = require('fs');
var util = require('util');
var favicon = require('serve-favicon');
var finalhandler = require('finalhandler');
var moment = require('moment');
var socketIO = require('socket.io');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;


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
	//Utility stuff
	function buildScoreboard(callback){
		players.find({meleeRating: {$exists: true}}, {meleeRating:1, name:1, meleeWins:1, meleeLosses:1, meleeMain:1}).sort({meleeRating: -1}, function(err, meleePlayers){
			callback({game: 'melee', data: meleePlayers});
		});
		players.find({pmRating: {$exists: true}}, {pmRating:1, name:1, pmWins:1, pmLosses:1, pmMain:1}).sort({pmRating: -1}, function(err, pmPlayers){
			callback({game: 'pm', data: pmPlayers});
		});
		players.find({smashFourRating: {$exists: true}}, {smashFourRating:1, name:1, smashFourWins:1, smashFourLosses:1, smashFourMain:1}).sort({smashFourRating: -1}, function(err, smashFourPlayers){
			callback({game: 'smashFour', data: smashFourPlayers});
		});
	}
	
	passport.use(new Strategy(function(username, password, callback){
		players.find({name: username}, function(err, docs){
			//console.log(docs);
			var user = docs[0];
			if(err){return callback(err);}
			if(!user){return callback(null, false);}
			if(user['password'] != password){return callback(null, false);}
			return callback(null, user);
		});
	}));
	
	passport.serializeUser(function(user, callback){
		//console.log(user);
		callback(null, user['studentID']);
	});
	
	passport.deserializeUser(function(id, callback){
		players.find({studentID:id}, function(err, docs){
			console.log(id);
			console.log(docs);
			if(err) {return callback(err)};
			callback(null, docs[0]);
		});
	});
	app.use(require('morgan')('combined'));
	app.use(require('cookie-parser')());
	app.use(require('body-parser').urlencoded({ extended: true }));
	app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));
	app.use(passport.initialize());
	app.use(passport.session());
	//Endpoints
	app.get('/', function(req, res){
		res.render(__dirname + '/pages/jade/index.jade');
	});
	app.get('/register', function(req, res){
		res.render(__dirname + '/pages/jade/register.jade');
	});
	app.get('/report', function(req, res){
		res.render(__dirname + '/pages/jade/report.jade');
	});
	app.post('/login', passport.authenticate('local', {failureRedirect: '/register'}), function(req, res){
		res.redirect('/report');
	});
	app.post('/logout', function(req, res){
		req.logout();
		res.redirect('back');
	});
	io.sockets.on('connection', function(socket){
		buildScoreboard(function(data){
			socket.emit('refreshScoreboard', {reason: 'firstConnect', scoreboardJson: data});
		});
		socket.on('register', function(data){
			var melee = data['melee'];
			var smashFour = data['smashFour'];
			var pm = data['pm'];
			var newName = data['name'];
			var stuID = data['stuID'];
			players.find({name: newName}, function(err, docs){
				if(err){
					socket.emit('register', {status: 0, reason: 'error'});
					fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error searching for name ' + newName + ' while registering\n');
				}
				else if(docs[0]){
					socket.emit('register', {status: 0, reason: 'exists'});
				}
				else{
					fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'User ' + newName + ' created with rating of 1200\n');
					players.insert({name: newName, studentID: stuID}, function(){
					if(melee){players.update({name:newName}, {$set: {meleeRating: 1200, meleeWins: 0, meleeLosses: 0, meleeMatchups: {}, meleeMain: data['meleeMain']}});}
					if(smashFour){players.update({name:newName}, {$set: {smashFourRating: 1200, smashFourWins: 0, smashFourLosses: 0, smashFourMatchups: {}, smashFourMain: data['smashFourMain']}});}
					if(pm){players.update({name:newName}, {$set: {pmRating: 1200, pmWins: 0, pmLosses: 0, pmMatchups: {}, pmMain: data['pmMain']}});}
					});
					socket.emit('register', {status: 1, reason: 'success'});
					buildScoreboard(function(data){
						io.emit('refreshScoreboard', {reason: 'newUser', scoreboardJson: data});
					});
				}
			});
		});
		socket.on('report', function(data){
			var playerOne = data['playerOne'];
			var playerTwo = data['playerTwo'];
			var playerOneStuID = data['playerOneId'];
			var playerTwoStuID = data['playerTwoId'];
			var gamePlayed = data['game'];
			players.find({name: playerOne}, function(err, playerOneEntry){
				if(err){
					fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error finding player ' + playerOne + '\n');
					socket.emit('report', {status: 0, reason: 'error'});
				}
				else if(!playerOneEntry[0]){
					socket.emit('report', {status: 0, reason: 'playerDoesNotExist', playerName: playerOne});
				}
				else if(!playerOneEntry[0][gamePlayed + 'Rating']){
					socket.emit('report', {status: 0, reason: 'playerNotRegistered', playerName: playerOne});
				}
				else if(playerOneEntry[0]['studentID'] != playerOneStuID){
					socket.emit('report', {status: 0, reason: 'wrongPassword', playerName: playerOne});
				}
				else{
					err = 0;
					players.find({name: playerTwo}, function(err, playerTwoEntry){
						if(err){
							fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' +'Error finding player ' + playerTwo + '\n');
							socket.emit('report', {status: 0, reason: 'error'});
						}
						else if(!playerTwoEntry[0]){
							socket.emit('report', {status: 0, reason: 'playerDoesNotExist', playerName: playerTwo});
						}
						else if(!playerTwoEntry[0][gamePlayed + 'Rating']){
							socket.emit('report', {status: 0, reason: 'playerNotRegistered', playerName: playerTwo});
						}
						else if(playerTwoEntry[0]['studentID'] != playerTwoStuID){
							socket.emit('report', {status: 0, reason: 'wrongPassword', playerName: playerTwo});
						}
						else{
							var playerOneGamesWon = parseInt(data['playerOneGamesWon']);
							var playerTwoGamesWon = parseInt(data['playerTwoGamesWon']);
							var numGamesPlayed = playerOneGamesWon + playerTwoGamesWon;
							var playerOneRatingBefore = playerOneEntry[0][gamePlayed + 'Rating'];
							var playerOneID = playerOneEntry[0]['_id'].toString().replace('ObjectID("', '').slice(0, -1);
							var playerTwoRatingBefore = playerTwoEntry[0][gamePlayed + 'Rating'];
							var playerTwoID = playerTwoEntry[0]['_id'].toString().replace('ObjectID("', '').slice(0, -1);
							var playerOneScore = playerOneGamesWon / numGamesPlayed;
							var playerTwoScore = playerTwoGamesWon / numGamesPlayed;
							var playerOneExpected = 1 / (1 + Math.pow(10, ((playerTwoRatingBefore - playerOneRatingBefore)/400)));
							var playerTwoExpected = 1 / (1 + Math.pow(10, ((playerOneRatingBefore - playerTwoRatingBefore)/400)));
							var kVal = (Math.log(numGamesPlayed + 1) / Math.log(1.1))*4;
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
							matches.insert({IDs: [playerOneID, playerTwoID], ratingsBefore: [playerOneRatingBefore, playerTwoRatingBefore], ratingsAfter: [playerOneNewRating, playerTwoNewRating], game: gamePlayed});
							var playerOneJson = {$set:{}};
							if(!playerOneEntry[0][gamePlayed + 'Matchups'][playerTwoID]){
								playerOneEntry[0][gamePlayed + 'Matchups'][playerTwoID] = {wins:0,losses:0};
							}
							playerOneJson['$set'][gamePlayed + 'Matchups.' + playerTwoID + ".wins"] = playerOneEntry[0][gamePlayed + 'Matchups'][playerTwoID]['wins'] + playerOneGamesWon;
							playerOneJson['$set'][gamePlayed + 'Matchups.' + playerTwoID + ".losses"] = playerOneEntry[0][gamePlayed + 'Matchups'][playerTwoID]['losses'] + playerTwoGamesWon;
							playerOneJson['$set'][gamePlayed + 'Rating'] =  playerOneNewRating;
							playerOneJson['$set'][gamePlayed + 'Wins'] = playerOneEntry[0][gamePlayed + 'Wins'] + playerOneGamesWon;
							playerOneJson['$set'][gamePlayed + 'Losses'] = playerOneEntry[0][gamePlayed + 'Losses'] + playerTwoGamesWon;
							var playerTwoJson = {$set:{}};
							if(!playerTwoEntry[0][gamePlayed + 'Matchups'][playerOneID]){
								playerTwoEntry[0][gamePlayed + 'Matchups'][playerOneID] = {wins:0,losses:0};
							}
							playerTwoJson['$set'][gamePlayed + 'Matchups.' + playerOneID + ".wins"] = playerTwoEntry[0][gamePlayed + 'Matchups'][playerOneID]['wins'] + playerTwoGamesWon;
							playerTwoJson['$set'][gamePlayed + 'Matchups.' + playerOneID + ".losses"] = playerTwoEntry[0][gamePlayed + 'Matchups'][playerOneID]['losses'] + playerOneGamesWon;
							playerTwoJson['$set'][gamePlayed + 'Rating'] = playerTwoNewRating;
							playerTwoJson['$set'][gamePlayed + 'Wins'] = playerTwoEntry[0][gamePlayed + 'Wins'] + playerTwoGamesWon;
							playerTwoJson['$set'][gamePlayed + 'Losses'] = playerTwoEntry[0][gamePlayed + 'Losses'] + playerOneGamesWon;
							console.log([playerOneJson, playerTwoJson]);
							players.update({name: playerOne}, playerOneJson);
							players.update({name: playerTwo}, playerTwoJson);
							socket.emit('report', {status: 1, reason: 'success'});
							buildScoreboard(function(data){
								io.emit('refreshScoreboard', {reason: 'newUser', scoreboardJson: data});
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
				message.channel.sendMessage('Supported games are: Smash, LoL (League of Legends), Overwatch, DotA2')
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

