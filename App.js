"use strict";
//Includes
const mongojs = require('mongojs');
const express = require('express');
const http = require('http');
const fs = require('fs');
const favicon = require('serve-favicon');
const moment = require('moment');
const socketIO = require('socket.io');
const passport = require('passport');
const Strategy = require('passport-local').Strategy;
const auth = require('passport-local-authenticate');

//Initialize globals
//For Website
const _favicon = favicon(__dirname + '/hostedItems/favicon.ico');
const eloLogfile = fs.openSync(__dirname + '/logs/SmashElo.log', 'a', 0o666);
const db = mongojs('SmashElo');
const app = express();
const httpServer = http.Server(app);
const io = socketIO(httpServer);
const players = db.collection('players');
const matches = db.collection('matches');
let matchHistoryTotal = 1;
//WEBSITE STARTS HERE
//set some app settings
app.use(express.static(__dirname + '/hostedItems'));
app.set('view engine', 'jade');
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({extended: true}));
app.use(require('express-session')({secret: 'keyboard cat', resave: false, saveUninitialized: false}));

//Utility stuff
function buildScoreboard(callback) {

    players.find({$and: [{hidden: false}, {meleeRating: {$exists: true}}]}, {
        meleeRating: 1,
        meleeWins: 1,
        meleeLosses: 1,
        meleeMain: 1,
        displayName: 1,
        username: 1
    }, (err, meleePlayers) => {
        for (let i = 0; i < meleePlayers.length; i++) {
            if (meleePlayers[i]['meleeWins'] + meleePlayers[i]['meleeLosses'] < 1) {
                meleePlayers[i]['meleeRating'] = "Unranked";
            }
        }
        shuffle(meleePlayers);
        meleePlayers.sort(compareToSortMelee);
        callback({game: 'melee', data: meleePlayers});
    });
    players.find({$and: [{hidden: false}, {pmRating: {$exists: true}}]}, {
        pmRating: 1,
        pmWins: 1,
        pmLosses: 1,
        pmMain: 1,
        displayName: 1,
        username: 1
    }, function (err, pmPlayers) {
        for (let i = 0; i < pmPlayers.length; i++) {
            if (pmPlayers[i]['pmWins'] + pmPlayers[i]['pmLosses'] < 2) {
                pmPlayers[i]['pmRating'] = "Unranked";
            }
        }
        shuffle(pmPlayers);
        pmPlayers.sort(compareToSortPm);
        callback({game: 'pm', data: pmPlayers});
    });
    players.find({$and: [{hidden: false}, {smashFourRating: {$exists: true}}]}, {
        smashFourRating: 1,
        smashFourWins: 1,
        smashFourLosses: 1,
        smashFourMain: 1,
        displayName: 1,
        username: 1
    }, function (err, smashFourPlayers) {
        for (let i = 0; i < smashFourPlayers.length; i++) {
            if (smashFourPlayers[i]['smashFourWins'] + smashFourPlayers[i]['smashFourLosses'] < 2) {
                smashFourPlayers[i]['smashFourRating'] = "Unranked";
            }
        }
        shuffle(smashFourPlayers);
        smashFourPlayers.sort(compareToSortSmashFour);
        callback({game: 'smashFour', data: smashFourPlayers});
    });
}

function shuffle(array) {
    let counter = array.length;

    while (counter > 0) {
        let index = Math.floor(Math.random() * counter);
        counter--;
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }
    return array;
}

function compareToSortAny(prop, a, b) {
    if (a[prop] === b[prop]) {
        return 0
    }
    if (a[prop] === "Unranked") {
        return 1
    }
    if (b[prop] === "Unranked") {
        return -1;
    }
    if (a[prop] < b[prop]) {
        return 1;
    }
    if (b[prop] < a[prop]) {
        return -1;
    }
    return 0;
}

const compareToSortMelee = compareToSortAny.bind(null, "meleeRating");

const compareToSortSmashFour = compareToSortAny(null, "smashFourRating");

const compareToSortPm = compareToSortAny(null, "pmRating");

function rebuildRatings() {
    //Set Seeding

    players.update({smashFourRating: {$exists: true}}, {
        $set: {
            smashFourRating: 1200,
            smashFourWins: 0,
            smashFourLosses: 0,
            smashFourMatchups: {},
            matchHistory: []
        }
    }, {multi: true}, () => {
        //	players.update({username: {$in: ["Vincessant", "NTBD", "Gonzilla"]}}, {$set: {smashFourRating: 1275}}, {multi: true});
        //	players.update({username: {$in: ["Trev", "Kaan", "Spirunk"]}}, {$set: {smashFourRating: 1250}}, {multi: true});
        //	players.update({username: {$in: ["Golf Team", "PhantomTriforce", "Shadinx"]}}, {$set: {smashFourRating: 1225}}, {multi: true});
    });
    players.update({pmRating: {$exists: true}}, {
        $set: {
            pmRating: 1200,
            pmWins: 0,
            pmLosses: 0,
            pmMatchups: {},
            matchHistory: []
        }
    }, {multi: true}, () => {

    });
    players.update({meleeRating: {$exists: true}}, {
        $set: {
            meleeRating: 1200,
            meleeWins: 0,
            meleeLosses: 0,
            meleeMatchups: {},
            matchHistory: []
        }
    }, {multi: true}, () => {
        //players.update({username: {$in: ["Vincessant", "Basic Stitch", "Seaghost", "RAF", "1BM", "Greg Glaze"]}}, {$set: {meleeRating: 1250}}, {multi: true});
    });

    //reapply all of the matches
    players.find({$or: [{hidden: true}/*, {school: {$nin: ['du']}}*/]}, {username: 1}, (err, hiddenPlayers) => {
        const hiddenList = toListOfAttributes(hiddenPlayers, "username");
        matches.find({$and: [{"reporter.username": {$nin: hiddenList}}, {"opponent.username": {$nin: hiddenList}}]}, (err, sets) => {
            if (err) {
                console.log("Error finding matches");
            }
            else {
                matchHistoryTotal = 1;
                sets.sort((a, b) => {
                    if (a.resolutionOrder === b.resolutionOrder) {
                        return 0;
                    }
                    else if (a.resolutionOrder < b.resolutionOrder) {
                        return -1;
                    }
                    else {
                        return 1;
                    }
                });
                recursiveBuildRatings(0, sets);
            }
        });
    });
}

function toListOfAttributes(items, attribute) {
    return items.map((item) => item[attribute]);
}

function recursiveBuildRatings(i, sets) {
    if (i < sets.length) {
        reportMatch(sets[i].reporter.username, sets[i].opponent.username, sets[i].game, sets[i].event, sets[i].reporter.wins, sets[i].opponent.wins, false, () => {
            recursiveBuildRatings(i + 1, sets);
        });
    }
}

function reportMatch(playerOne, playerTwo, gamePlayed, eventName, playerOneWins, playerTwoWins, enterMatch, callback) {
    players.find({username: playerOne}, (err1, playerOneEntry) => {
        if (err1) {
            //If there is an error finding the player, log it and tell the client
            fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Error finding player ' + playerOne + '\n');
            callback(0, "", 'error');
        }
        else if (!playerOneEntry[0] || !playerOneEntry[0][gamePlayed + 'Rating']) {
            callback(0, playerOne, 'playerNotRegistered');
        }
        else {
            players.find({username: playerTwo}, (err2, playerTwoEntry) => {
                if (err2) {
                    //If there is an error finding the player, log it and tell the client
                    fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Error finding player ' + playerTwo + '\n');
                    callback(0, "", 'error');
                }
                else if (!playerTwoEntry[0] || !playerTwoEntry[0][gamePlayed + 'Rating']) {
                    //If player two does not exist send the client an alert
                    callback(0, playerTwo, 'playerDoesNotExist');
                }
                else {
                    eventName = eventName.replace(/['"]+/g, '');
                    enterInDB(playerOne, playerTwo, gamePlayed, eventName, playerOneWins, playerTwoWins, playerOneEntry, playerTwoEntry, enterMatch, callback);
                }
            });
        }
    });

}

function enterInDB(playerOne, playerTwo, gamePlayed, eventName, playerOneWins, playerTwoWins, playerOneEntry, playerTwoEntry, enterMatch, callback) {
    const playerOneWinner = +(playerOneWins > playerTwoWins),
        playerTwoWinner = +(playerOneWins < playerTwoWins);
    //Pull the game data from the initial form
    //Pull some data from the two returned documents from the database queries
    const playerOneRatingBefore = playerOneEntry[0][gamePlayed + 'Rating'],
     playerTwoRatingBefore = playerTwoEntry[0][gamePlayed + 'Rating'],
     playerOneScore = playerOneWinner,
     playerTwoScore = playerTwoWinner,
     playerOneAdjustedRating = Math.pow(10, playerOneRatingBefore / 400),
     playerTwoAdjustedRating = Math.pow(10, playerTwoRatingBefore / 400),
     playerOneExpected = playerOneAdjustedRating / (playerOneAdjustedRating + playerTwoAdjustedRating),
     playerTwoExpected = playerTwoAdjustedRating / (playerOneAdjustedRating + playerTwoAdjustedRating),
        kVal = (eventName !== "Challenge" ? 2 : 1) * (Math.max(playerOneWins, playerTwoWins) === 2 ? 16 : 24),
        playerOneNewRating = playerOneRatingBefore + Math.floor(kVal * (playerOneScore - playerOneExpected)),
        playerTwoNewRating = playerTwoRatingBefore + Math.floor(kVal * (playerTwoScore + (.1 * playerTwoWins) - playerTwoExpected));
    matchHistoryTotal++;
    if (enterMatch) {
        matches.insert({
            reporter: {username: playerOne, wins: playerOneWins},
            opponent: {username: playerTwo, wins: playerTwoWins},
            game: gamePlayed,
            event: eventName,
            resolutionOrder: matchHistoryTotal
        });
    }
    //Build the JSON for the update to the players collection
    const playerOneJson = {$set: {}, $push: {}};
    playerOneJson['$push']['matchHistory'] = {};
    playerOneJson['$push']['matchHistory']['game'] = gamePlayed;
    playerOneJson['$push']['matchHistory']['ratingChange'] = playerOneNewRating - playerOneRatingBefore;
    playerOneJson['$push']['matchHistory']['playedAgainst'] = playerTwo;
    playerOneJson['$push']['matchHistory']['gamesWon'] = playerOneWins;
    playerOneJson['$push']['matchHistory']['gamesLost'] = playerTwoWins;
    playerOneJson['$push']['matchHistory']['event'] = eventName;
    if (!playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo]) {
        playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo] = {wins: 0, losses: 0};
    }
    playerOneJson['$set'][gamePlayed + 'Matchups.' + playerTwo + ".wins"] = playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo]['wins'] + playerOneWinner;
    playerOneJson['$set'][gamePlayed + 'Matchups.' + playerTwo + ".losses"] = playerOneEntry[0][gamePlayed + 'Matchups'][playerTwo]['losses'] + playerTwoWinner;
    playerOneJson['$set'][gamePlayed + 'Rating'] = playerOneNewRating;
    playerOneJson['$set'][gamePlayed + 'Wins'] = playerOneEntry[0][gamePlayed + 'Wins'] + playerOneWinner;
    playerOneJson['$set'][gamePlayed + 'Losses'] = playerOneEntry[0][gamePlayed + 'Losses'] + playerTwoWinner;
    const playerTwoJson = {$set: {}, $push: {}};
    playerTwoJson['$push']['matchHistory'] = {};
    playerTwoJson['$push']['matchHistory']['game'] = gamePlayed;
    playerTwoJson['$push']['matchHistory']['ratingChange'] = playerTwoNewRating - playerTwoRatingBefore;
    playerTwoJson['$push']['matchHistory']['playedAgainst'] = playerOne;
    playerTwoJson['$push']['matchHistory']['gamesWon'] = playerTwoWins;
    playerTwoJson['$push']['matchHistory']['gamesLost'] = playerOneWins;
    playerTwoJson['$push']['matchHistory']['event'] = eventName;
    if (!playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne]) {
        playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne] = {wins: 0, losses: 0};
    }
    playerTwoJson['$set'][gamePlayed + 'Matchups.' + playerOne + ".wins"] = playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne]['wins'] + playerTwoWinner;
    playerTwoJson['$set'][gamePlayed + 'Matchups.' + playerOne + ".losses"] = playerTwoEntry[0][gamePlayed + 'Matchups'][playerOne]['losses'] + playerOneWinner;
    playerTwoJson['$set'][gamePlayed + 'Rating'] = playerTwoNewRating;
    playerTwoJson['$set'][gamePlayed + 'Wins'] = playerTwoEntry[0][gamePlayed + 'Wins'] + playerTwoWinner;
    playerTwoJson['$set'][gamePlayed + 'Losses'] = playerTwoEntry[0][gamePlayed + 'Losses'] + playerOneWinner;
    fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Match reported between ' + playerOne + ' and ' + playerTwo + '\n');
    //Send the update queries to the DB
    players.update({username: playerOne}, playerOneJson);
    players.update({username: playerTwo}, playerTwoJson);
    //Report success to the client
    buildScoreboard((data) => {
        io.emit('refreshScoreboard', {reason: 'matchReported', scoreboardJson: data});
    });
    callback(1, "", "success");
}

//Passport authentication and login
passport.use(new Strategy((uname, password, callback) => {
    players.find({username: uname}, (err, docs) => {
        const user = docs[0];
        if (err) {
            return callback(err);
        }
        if (!user) {
            return callback(null, false);
        }
        auth.verify(password, user['password'], (err, verified) => {
            return callback(null, (!err && verified) ? user : false);
        });
    });
}));

passport.serializeUser((user, callback) => {
    callback(null, user['username']);
});

passport.deserializeUser((uname, callback) => {
    players.find({username: uname}, (err, docs) => {
        if (err) {
            return callback(err);
        }
        callback(null, docs[0]);
    });
});
app.use(passport.initialize());
app.use(passport.session());

//HTTP GET Endpoints
app.get('/', (req, res) => {
    if (req.user) {
        res.render(__dirname + '/pages/jade/index.jade', {user: req.user['username'], admin: req.user['admin']});
    }
    else {
        res.render(__dirname + '/pages/jade/index.jade', {});
    }
});
app.get('/register', (req, res) => {
    if (req.user) {
        res.render(__dirname + '/pages/jade/register.jade', {user: req.user['username'], admin: req.user['admin']});
    }
    else {
        res.render(__dirname + '/pages/jade/register.jade', {});
    }
});
app.get('/report', (req, res) => {
    if (req.user) {
        res.render(__dirname + '/pages/jade/report.jade', {user: req.user['username'], admin: req.user['admin']});
    }
    else {
        res.render(__dirname + '/pages/jade/report.jade', {});
    }
});
app.get('/login', (req, res) => {
    if (req.user) {
        res.render(__dirname + '/pages/jade/login.jade', {user: req.user['username'], admin: req.user['admin']});
    }
    else {
        res.render(__dirname + '/pages/jade/login.jade', {});
    }
});
app.get('/rebuild', (req, res) => {
    if (req.user && req.user.admin) {
        rebuildRatings();
    }
    res.redirect('/');
});
app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
});
app.get('/history', (req, res) => {
    matches.find({}).sort({resolutionOrder: 1}, (err, games) => {
        if (req.user) {
            res.render(__dirname + '/pages/jade/history.jade', {
                user: req.user['username'],
                admin: req.user['admin'],
                history: JSON.stringify(games)
            });
        }
        else {
            res.render(__dirname + '/pages/jade/history.jade', {history: JSON.stringify(games)});
        }
    });
});
app.get('/history/:game', (req, res) => {
    const game = req.params.game;
    if (["lol", "melee", "pm", "smashFour"].indexOf(game)) {
        matches.find({"game": game}).sort({resolutionOrder: 1}, (err, games) => {
            console.log(err);
            if (req.user) {
                res.render(__dirname + '/pages/jade/history.jade', {
                    user: req.user['username'],
                    admin: req.user['admin'],
                    history: JSON.stringify(games)
                });
            }
            else {
                res.render(__dirname + '/pages/jade/history.jade', {history: JSON.stringify(games)});
            }
        });
    }
    else {
        const games = {error: true};
        if (req.user) {
            res.render(__dirname + '/pages/jade/history.jade', {
                user: req.user['username'],
                admin: req.user['admin'],
                history: JSON.stringify(games)
            });
        }
        else {
            res.render(__dirname + '/pages/jade/history.jade', {history: JSON.stringify(games)});
        }

    }
});
app.get('/history/:game/:event', (req, res) => {
    const game = req.params.game;
    const event = req.params.event;
    if (["lol", "melee", "pm", "smashFour"].indexOf(game)) {
        matches.find({"game": game, "event": event}).sort({resolutionOrder: 1}, (err, games) => {
            if (req.user) {
                res.render(__dirname + '/pages/jade/history.jade', {
                    user: req.user['username'],
                    admin: req.user['admin'],
                    history: JSON.stringify(games),
                    "event": event
                });
            }
            else {
                res.render(__dirname + '/pages/jade/history.jade', {history: JSON.stringify(games), "event": event});
            }
        });
    }
    else {
        const games = {error: true};
        if (req.user) {
            res.render(__dirname + '/pages/jade/history.jade', {
                user: req.user['username'],
                admin: req.user['admin'],
                history: JSON.stringify(games),
                "event": event
            });
        }
        else {
            res.render(__dirname + '/pages/jade/history.jade', {history: JSON.stringify(games), "event": event});
        }
    }
});
app.get('/user/:username', (req, res) => {
    const uname = req.params.username;
    players.find({username: uname}, {password: 0, _id: 0}, (err, docs) => {
        if (err || !docs[0]) {
            res.render(__dirname + '/pages/jade/unf.jade', {user: uname});
        }
        else {
            if (req.user) {
                if (req.user['username'] === uname) {
                    res.render(__dirname + '/pages/jade/profile.jade', {
                        userJson: JSON.stringify(docs[0]),
                        user: req.user['username'],
                        edit: true
                    });
                }
                else {
                    res.render(__dirname + '/pages/jade/profile.jade', {
                        userJson: JSON.stringify(docs[0]),
                        user: req.user['username'],
                        edit: false
                    });
                }
            }
            else {
                res.render(__dirname + '/pages/jade/profile.jade', {userJson: JSON.stringify(docs[0]), edit: false});
            }
        }
    });
});
//HTTP POST Endpoints
app.post('/login', passport.authenticate('local', {failureRedirect: '/register'}), (req, res) => {
    res.redirect('/');
});
//Client-server communication post page load
io.sockets.on('connection', (socket) => {
    //Spawn the initial scoreboard
    buildScoreboard((data) => {
        socket.emit('refreshScoreboard', {reason: 'firstConnect', scoreboardJson: data});
    });
    //To edit a user's account
    socket.on('editInfo', (data) => {
        const userToChange = data['username'],
         pass = data['password'];
        players.find({username: userToChange}, (err, docs) => {
            if (err || !docs[0]) {
                socket.emit('editInfo', {status: 0, reason: "error changing user"});
                return;
            }
            auth.verify(pass, docs[0]['password'], (err, verified) => {
                if (!verified || err) {
                    socket.emit('editInfo', {status: 0, reason: "error authenticating user"});
                    return;
                }
                if (data['newPass'] && data['newPass'] !== "") {
                    auth.hash(data['newPass'], (err, hashed) => {
                        players.update({username: userToChange}, {$set: {password: hashed}});
                    });
                }
                if (data['newName'] && data['newName'] !== "") {
                    players.update({username: userToChange}, {$set: {displayName: data['newName']}});
                }
            });
        });
    });
    //When registering on the register page do this
    socket.on('register', (data) => {
        //Booleans for if the user is joining that game or not
        const melee = data['melee'],
            smashFour = data['smashFour'],
            pm = data['pm'],
            newName = data['name'],
            pass = data['password'],
            college = data['school'];
        players.find({username: newName}, (err, docs) => {
            if (err) {
                //If there is an error finding the user, log it
                socket.emit('register', {status: 0, reason: 'error'});
                fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Error searching for username ' + newName + ' while registering\n');
            }
            else if (docs[0]) {
                //If the user already exists tell the page to display an alert
                socket.emit('register', {status: 0, reason: 'exists'});
            }
            else {
                auth.hash(pass, function (err, hashed) {
                    if (err) {
                        socket.emit('register', {status: 0, reason: 'error hashing'});
                        return;
                    } //if there is an error hashing the password tell the page to alert
                    players.insert({
                        username: newName,
                        displayName: newName,
                        password: hashed,
                        matchHistory: [],
                        school: college,
                        admin: false,
                        hidden: false
                    }, () => {
                        fs.writeFileSync(eloLogfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + newName + ' created\n'); //Log the creation of a new user
                        //Add melee, smash 4 and/or pm to the user
                        if (melee) {
                            players.update({username: newName}, {
                                $set: {
                                    meleeRating: 1200,
                                    meleeWins: 0,
                                    meleeLosses: 0,
                                    meleeMatchups: {},
                                    meleeMain: data['meleeMain']
                                }
                            });
                        }
                        if (smashFour) {
                            players.update({username: newName}, {
                                $set: {
                                    smashFourRating: 1200,
                                    smashFourWins: 0,
                                    smashFourLosses: 0,
                                    smashFourMatchups: {},
                                    smashFourMain: data['smashFourMain']
                                }
                            });
                        }
                        if (pm) {
                            players.update({username: newName}, {
                                $set: {
                                    pmRating: 1200,
                                    pmWins: 0,
                                    pmLosses: 0,
                                    pmMatchups: {},
                                    pmMain: data['pmMain']
                                }
                            });
                        }
                    });
                    //Tell the client it succeded
                    socket.emit('register', {status: 1, reason: 'success'});
                    buildScoreboard((data) => {
                        //Refresh all scoreboards
                        io.emit('refreshScoreboard', {reason: 'newUser', scoreboardJson: data});
                    });
                });
            }
        });
    });
    //When reporting a match on the report page do this
    socket.on('report', (data) => {
        //The two players in the game and the game played
        const playerOne = data['playerOne'],
            playerTwo = data['playerTwo'],
            gamePlayed = data['game'],
            playerOneGamesWon = parseInt(data['playerOneGamesWon']),
            playerTwoGamesWon = parseInt(data['playerTwoGamesWon']),
            eventName = data['event'] || "Challenge";
        reportMatch(playerOne, playerTwo, gamePlayed, eventName, playerOneGamesWon, playerTwoGamesWon, true, (bool, two, three) => {
            socket.emit('report', {status: bool, reason: three, playerName: two});
        });
    });
});

//Start listening
httpServer.listen(80);
rebuildRatings();

