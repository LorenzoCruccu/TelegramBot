const req = require('request');  //Richiedo modulo request, serve per fare collegamenti http. Ormai è deprecato dal 11/02/2020, un'alternativa è node-fetch o bent
const TelegramBot = require('node-telegram-bot-api'); //Modulo telegram
const token  = 'xxx'; //token personale riservato al creatore del 
//bot. Con questo puoi decidere cosa deve fare il tuo bot! In casi normali, deve essere segreto e non divulgato.

var mh;
var MongoClient = require('mongodb').MongoClient;		// nota che require restituisce un oggetto
MongoClient.connect("mongodb://127.0.0.1/sample", null,function(err, db) {
	if(db && !db.collection) db = db.db('sample');	// patch necessarie per vecchie release
	mh = db;					// salvo maniglia (handle) del database in una variabile globale
	//mh.collection('circolari').remove( {  });
});

// Utilizza MongoDB, è un database NoSQL che restituisce file JSON. Le istruzioni sopra servono a collegare il database al server (in questo caso in locale)
//mh serve per poter agevolmente utilizzare le funzioni della libreria di mongodb, quali aggiungere togliere e modifiare il database.

//Le istruzioni sotto creano delle costanti che in codice UNICODE corrispondono ad emoji.
const SKULL       = "\u{1F480}";
const SUBSCRIBE   = "\u{1F508}";
const UNSUBSCRIBE = "\u{1F507}";
const START       = "\u{1F6A5}";
const INFO        = "\u{2753}";

//analogo, serve a scrivere meno cose sotto
const stop        = "Stop " + SKULL;
const start       = "Start " + START;
const subscribe   = "Subscribe " + SUBSCRIBE;
const unsubscribe = "Cancel " + UNSUBSCRIBE;
const info        = "Info " + INFO;

// tre tastiere in base allo stato dell'utente
//pulsanti da premere, la sintassi è questa di default
var keysubon  = { reply_markup: { keyboard: [[ info, subscribe, stop ]], resize_keyboard: true } };
var keysuboff = { reply_markup: { keyboard: [[ info, unsubscribe, stop ]], resize_keyboard: true } };
var keyoff    = { reply_markup: { keyboard: [[ start ]], resize_keyboard: true } };

const page = 'http://www.ittfedifermi.edu.it/circolari/'; //pagina delle circolari, da qui verranno gettate le circolari della scuola
//creazione bot
var bot = new TelegramBot(token, {polling: true});
bot.on('message', function(msg) {
	var chatid = msg.chat.id;
	if(msg.text == '/start' || msg.text == start) { //quando l'utente preme /start o clicca sul pulsante
		mh.collection('user').updateOne({ chatid: chatid }, { $set: { chatid: chatid, chat: msg.chat, subscribe: null } }, { upsert: true } ); //aggiunge alla tabella user l'utente 
		bot.sendMessage(chatid,'Hello @' + msg.chat.username,keysubon); //messaggio di benvenuto, leggere il nome utente e lo stampa "Hello @utente"
	} else if(msg.text == stop) { //quando l'utente preme il pulsante stop o digita /stop
		mh.collection('user').remove({ chatid: chatid } ); //rimuove dal database l'utente
		bot.sendMessage(chatid,'ByeBye @' + msg.chat.username,keyoff); //saluta l'utente
	} else if(msg.text == subscribe) { //quando l'utente preme il pulsante subscribe o digita /subscribe
		mh.collection('user').updateOne({ chatid: chatid }, { $set: { subscribe: 1 } }, { upsert: true } ); //aggiunge o aggiorna il database, setta subscribe dell'utente a true (1)
		bot.sendMessage(chatid,'@' + msg.chat.username + ' subscribed',keysuboff); //messaggio in chat che conferma l'iscrizione al bot
	} else if(msg.text == unsubscribe) { //analogo, cancella la sub
		mh.collection('user').updateOne({ chatid: chatid }, { $set: { subscribe: null } }, { upsert: true } ); //aggiorna la riga dell'utente e imposta subscribe a null
		bot.sendMessage(chatid,'@' + msg.chat.username + ' unsubscribed',keysubon); //messaggio in chat che conferma l'annullamento di iscrizione al bot
	} else if(msg.text == info) { //se premo il pulsante info o digito /info in chat
		req.get(page,null,function(err,res,body) { //si collega alla pagina della scuola, e manda il link delle circolari
			var lines = body.split('\n').reverse(); // raccolgo il codice html e lo divido per righe (uso /n come separatore). .reverse() inverte le stringhe, ordinandole temporalmente
			showLines(chatid,lines); //metodo usato sotto,
		});
	}
});
var getUrl = function(line) {  //lines è un array di stringhe
	var offset = line.search(page); //vede se la riga messa in input è presente all'interno della pagina della scuola, ritorna l'indice di dove si trova (l'inizio)
	if(offset < 0) return; //se non è presente esce
	var n = line.substr(offset+page.length); //divide in stringhe tra dove parte fino alla fine
	if(isNaN(parseInt(n))) return; //se n non è un numero, esce
	var end = n.search('"'); //trovo la fine del link della circolare
	if(end < 0) return;
	return line.substr(offset,page.length+end); //output
}
var showLines = async function(chatid,lines) { // chatid è l'utente, lines sono le stringhe prese prima
	var already = {};
	for(let i = 0;i < lines.length;i++) { //per ogni stringa che ho trovato (è un'array ora)
		var url = getUrl(lines[i]); //get della circolare
		if(!url || already[url]) continue; //per eliminare le circolari duplicati, uso already[url] come chiave metto gli URL 
		//che sono già presenti e se non sono presenti
		await bot.sendMessage(chatid,url,keysuboff);//stampo per messaggio la circolare
		already[url] = 1; //e metto come chiave l'url e come contenuto 1, vale a dire che se nel 
		//prossimo controllo questo URL è già stato presente, non viene stampato!
	}
}
var doUrls = async function(urls) { //funziona asincrona (deve terminare senza tenere conto dell'interprete)
	var users = await mh.collection('user').find( { subscribe: { $ne: null}  }).toArray(); //vede chi non è iscritto al bot
	for(let i = 0;i < urls.length;i++) { //urls è un'array che contiene gli urls delle circolari
		var url = urls[i]; //per ogni url controlla se esiste nella tabella circolari del database
		var exists = await mh.collection('circolari').find( { url:url  }).toArray();
		if(exists.length == 0) { //se non esiste,
			for(let j = 0;j < users.length;j++) //pr ogni utente manda l'url a tutti gli utenti
				await bot.sendMessage(users[j].chatid,url,keysuboff);
			mh.collection('circolari').insertOne( { url:url  }); //e infine l'aggiunge alla sua personalissima collezione di circolari (del database)
		}
	}
}
var check  =function() { //Funzione che controlla ogni 60 secondi se una nuova circolare è presente nel sito
	var urls = [];
	var already = {};
	req.get(page,null,function(err,res,body) { 
		var lines = body.split('\n').reverse();
		for(var i = 0;i < lines.length;i++) {
			var url = getUrl(lines[i]);
			if(!url || already[url]) continue; //analogo a showLines
			already[url] = 1;
			urls.push(url); //aggiunge all'array urls l'url della nuova circolare
		}
		doUrls(urls);
		setTimeout(check,60*1000);
	});
}
check(); //viene richiamata ogni 60 secondi, setTimout serve a questo