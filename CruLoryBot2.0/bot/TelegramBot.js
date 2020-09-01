var myJSON;
const req = require('request');
const TelegramBot = require('node-telegram-bot-api');
const token  = '1093632168:AAHMfBDR6UsKNsnSkdkxcldHU8Q6FiODjsU';  //CruLoryBot
//const token  = '1018602906:AAHoFSBATjpcs7Fy-YQnMWc8-Z0kb7lB2J8';
var mh;
var MongoClient = require('mongodb').MongoClient;		// nota che require restituisce un oggetto
MongoClient.connect("mongodb://127.0.0.1/sample", null,function(err, db) {
	if(db && !db.collection) db = db.db('sample');	// patch necessarie per vecchie release
	mh = db;					// salvo maniglia (handle) del database in una variabile globale
	//mh.collection('circolari').remove( {  });

});
var express = require('express');  
var compression = require('compression');		// supporto per gzip pagine inviate dal server
var bodyParser = require('body-parser');
var path  = require("path");			// per implementare web server delle pagine html
var app = express();
app.use(bodyParser.json());
app.use(compression());
app.use(bodyParser.urlencoded( { extended: true }));

app.use('/',express.static(path.join(__dirname,'.')));	// tutto viene cercato come file escluso i metodi dichiarati esplicitamente con app.get o app.post 
							// vedi sotto il servizio /users

app.get('/list', function (req, res){
	mh.collection("user").find({}).toArray(function(err, result) {  //query di tutti gli user
		if(err) return res.end({ error: err });
		res.send(result);
	});
});
var http = require('http');  //http page
var server = http.createServer(app,function (req, res) { })	// qui non faccio nulla perche' faccio gestire  tutto al modulo express
server.listen(1337, '127.0.0.1');

const SKULL       = "\u{1F480}";
const SUBSCRIBE   = "\u{1F508}";
const UNSUBSCRIBE = "\u{1F507}";
const START       = "\u{1F6A5}";
const INFO        = "\u{2753}";

const stop        = "Stop " + SKULL;
const start       = "Start " + START;
const subscribe   = "Subscribe " + SUBSCRIBE;
const unsubscribe = "Cancel " + UNSUBSCRIBE;
const info        = "Info " + INFO;

// tre tastiere in base allo stato dell'utente
var keysubon  = { reply_markup: { keyboard: [[ info, subscribe, stop ]], resize_keyboard: true } };
var keysuboff = { reply_markup: { keyboard: [[ info, unsubscribe, stop ]], resize_keyboard: true } };
var keyoff    = { reply_markup: { keyboard: [[ start ]], resize_keyboard: true } };

const page = 'http://www.ittfedifermi.edu.it/circolari/';
var bot = new TelegramBot(token, {polling: true});
bot.on('message', function(msg) {
	var chatid = msg.chat.id;
	if(msg.text == '/start' || msg.text == start) {
		mh.collection('user').updateOne({ chatid: chatid }, { $set: { chatid: chatid, chat: msg.chat, subscribe: null } }, { upsert: true } );
		bot.sendMessage(chatid,'Hello @' + msg.chat.username,keysubon);
	} else if(msg.text == stop) {
		mh.collection('user').remove({ chatid: chatid } );
		bot.sendMessage(chatid,'ByeBye @' + msg.chat.username,keyoff);
	} else if(msg.text == subscribe) {
		mh.collection('user').updateOne({ chatid: chatid }, { $set: { subscribe: 1 } }, { upsert: true } );
		bot.sendMessage(chatid,'@' + msg.chat.username + ' subscribed',keysuboff);
	} else if(msg.text == unsubscribe) {
		mh.collection('user').updateOne({ chatid: chatid }, { $set: { subscribe: null } }, { upsert: true } );
		bot.sendMessage(chatid,'@' + msg.chat.username + ' unsubscribed',keysubon);
	} else if(msg.text == info) {
		req.get(page,null,function(err,res,body) {
			var lines = body.split('\n').reverse();
			showLines(chatid,lines);
		});
	}
});
var getUrl = function(line) {
	var offset = line.search(page);
	if(offset < 0) return; 
	var n = line.substr(offset+page.length);
	if(isNaN(parseInt(n))) return;
	var end = n.search('"');
	if(end < 0) return;
	return line.substr(offset,page.length+end);
}
var showLines = async function(chatid,lines) {
	var already = {};
	for(let i = 0;i < lines.length;i++) {
		var url = getUrl(lines[i]);
		if(!url || already[url]) continue;
		await bot.sendMessage(chatid,url,keysuboff);
		already[url] = 1;
	}
}
var doUrls = async function(urls) {
	var users = await mh.collection('user').find( { subscribe: { $ne: null}  }).toArray();
	for(let i = 0;i < urls.length;i++) {
		var url = urls[i];
		var exists = await mh.collection('circolari').find( { url:url  }).toArray();
		if(exists.length == 0) {
			for(let j = 0;j < users.length;j++)
				await bot.sendMessage(users[j].chatid,url,keysuboff);
			mh.collection('circolari').insertOne( { url:url  });
		}
	}
}
var check  =function() {
	var urls = [];
	var already = {};
	req.get(page,null,function(err,res,body) {
		var lines = body.split('\n').reverse();
		for(var i = 0;i < lines.length;i++) {
			var url = getUrl(lines[i]);
			if(!url || already[url]) continue;
			already[url] = 1;
			urls.push(url);
		}
		doUrls(urls);
		setTimeout(check,60*1000);
	});
}
check();
