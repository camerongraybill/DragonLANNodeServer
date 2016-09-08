/*
  DragonLAN Discord Bot
  outputs logs to DragonLANBot.log
*/
var moment = require('moment');
var fs = require('fs');


var outfile = fs.openSync('/home/ec2-user/Node/logs/DragonLANBot.log', 'a', 0666);

// import the discord.js module
const Discord = require('discord.js');

// create an instance of a Discord Client, and call it bot
const bot = new Discord.Client();

// the token of your bot - https://discordapp.com/developers/applications/me
const token = 'MjIyNTIwNDEzNTgwODIwNDgy.Cq-6PQ.gUV-gybGKOFH4Z_SYm5Drf9EOBo';

//Listen for the bot to be ready
bot.on('ready', () => {
  fs.writeFileSync(outfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'I am ready!\n');
});

//Greet new users
bot.on('guildMemberAdd', (guild, member) => {
	var botCommandsChannel = guild.channels.find('name', 'botcommands');
	botCommandsChannel.sendMessage('Welcome <@' + member.id + '>! It is their first time on the server!');
	botCommandsChannel.sendMessage('<@' + member.id + '> please take a look at the pinned messages in this channel for some help in getting set up, I reccomend you mute this channel as it gets a large amount of messages. If you have any questions feel free to message <@99875889797414912> for answers');
	fs.writeFileSync(outfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + member.id + ' with name ' + member.user.username + ' joined the server for the first time\n');
});

// create an event listener for messages
bot.on('message', message => {
	var input = message.content.split(" ");
	if(input[0] == "-dl" && message.channel.id == 222765483806425088){
	// if the message is "ping",
		if (input[1] == 'add' && input[2] == 'game'){
			var user = message.member;
			var server = message.guild;
			var usersRoles = user.roles.array();
			for (var i = 3; i < input.length; i++){
				if(input[i] == 'Admin' || input[i] == 'Aethex' || input[i] == 'Officers' || input[i] == 'Coordinator'){
					fs.writeFileSync(outfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + user.id + ' with name ' + user.user.username + ' attempted to join the role ' + input[i] + ' but was denied\n');
					message.channel.sendMessage('Role ' + input[i] + ' is locked');
				}
				else if(server.roles.find('name', input[i])){
					var roleToAdd = server.roles.find('name', input[i]);
					usersRoles.push(roleToAdd);
					message.channel.sendMessage('Added <@' + user.id + '> to the game ' + input[i]);
					fs.writeFileSync(outfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'Added user ' + user.id + ' with name ' + user.user.username + ' to the role ' + input[i] + '\n');
				}
				else{
					fs.writeFileSync(outfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'User ' + user.id + ' with name ' + user.user.username + ' attempted to join the role ' + input[i] + ' but it does not exist\n');
					message.channel.sendMessage('Role ' + input[i] + ' does not exist!');
				}
			}
			user.setRoles(usersRoles);
		}
		else if(input [1] == 'list' && input[2] == 'games'){
			message.channel.sendMessage('Supported games are: Smash, LoL (League of Legends), Overwatch, DotA2')
		}
		else if(input[1] == 'help'){
			message.channel.sendMessage('Sending <@' + message.member.id + '> commands list');
			fs.writeFileSync(outfile, '[' + moment().format('YYYY-MM-DD HH:mm:ss Z') + '] ' + 'user ' + message.member.id + ' with name ' + message.member.user.username + ' requested the help prompt\n');
			message.member.sendMessage('This is the DragonLAN Discord administration Bot!\nHere is my list of commands:\n   -dl add game (list of games separated by spaces)     adds the user to the group for all games in the list (case sensetive\n   -dl list games                                                                       lists all currently supported games\n\nIf you have any questions about me, talk to <@99875889797414912> on the DragonLAN Server or in a direct message!');
		}
		else{
			message.channel.sendMessage('unrecognized command');
		}
	}
	else if(input[0] == '-dl'){
		message.channel.sendMessage('I do not respond to commands here, head over to <#222765483806425088> if you want to interact with me!');
	}
});

// log our bot in
bot.login(token);