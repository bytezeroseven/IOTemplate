

const express = require("express");
const app = express();

app.use("/", express.static("public"));

const port = process.env.PORT || 6969;
const server = app.listen(port, function done() {
	console.log("Server started listening on port=" + port);
});

const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });

function prepareData(buffer) {
	let arrayBuffer = new ArrayBuffer(buffer.length);
	let view = new Uint8Array(arrayBuffer);
	for(let i = 0; i < buffer.length; i++) {
		view[i] = buffer[i]
	}
	return new DataView(arrayBuffer);
}

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength))
}

function onWsConnection(ws, req) {
	let word = words[Math.floor(Math.random() * words.length)];
	let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	let vowel = "aeiou".indexOf(word[0]) > -1 ? "An" : "A";
	logMsg(connectText.replace(/\{0}/, vowel).replace(/\{1}/, word).replace(/\{2}/, ip));

	ws.ip = ip;

	function sendMsg(view) {
		if (ws.readyState != WebSocket.OPEN) return false;
		ws.send(view.buffer)
	}
	function prepareString(view, offset, str) {
		let i = 0;
		while (i < str.length) {
			let code = str.charCodeAt(i++);
			if(code > 255) continue;
			view.setUint8(offset++, code);
		}
		view.setUint8(offset++, 0)
		return offset;
	}
	function sendString(str) {
		let view = prepareMsg(1+str.length+1);
		let offset = 0;
		view.setUint8(offset++, 23);
		offset = prepareString(view, offset, str);
		sendMsg(view);
	}

	function onWsOpen() {
		sendString("Websocket connection established.");
		setTimeout(function () {
			sendString("Beep boop, boop beep!")
		}, 5E3);
	}
	function onWsClose() {
		logMsg("A WebSocket connection was closed.");
		padding = 2;
		logMsg(disconnectText.replace(/\{0}/, ip));
		padding = 1;
	}
	function onWsMessage(msg) {
		handleWsMessage(prepareData(msg.data));
	}

	function handleWsMessage(view) {		
		function getString() {
			let str = new String();
			let char = null;
			while ((char = view.getUint8(offset++)) != 0) {
				str += String.fromCharCode(char);
			}
			return str;
		}

		let offset = 0;
		switch (view.getUint8(offset++)) {
			case 42: 
				view = prepareMsg(1);
				view.setUint8(0, 42);
				sendMsg(view);
				break;
			case 23:
				let str = getString();
				logMsg("A client attempted to negotiate.")
				padding = 2;
				logMsg("The client " + (ws.userData ? ws.userData.nickname + " " : "") + "says:", str);
				padding = 1;
				break;
			case 10:
				let firstname = getString();
				let lastname = getString();
				let nickname = getString();
				let money = view.getUint8(offset);
				ws.userData = { firstname, lastname, nickname, money };
				logMsg("New user signed up.");
				padding = 2;
				logMsg(JSON.stringify(ws.userData));
				padding = 1;
				sendString("New user created with nickname="+nickname);
				break;
		}
	}

	ws.on("pong", pong);

	onWsOpen();
	ws.onopen = onWsOpen;
	ws.onmessage = onWsMessage;
	ws.onclose = onWsClose;
}

wss.on("connection", onWsConnection);

function pong() {
	this.isAlive = true;
}

function ping() {
	wss.clients.forEach(function each(ws) {
		if(ws.isAlive == false) {
			ws.terminate();
			logMsg("A WebSocket connection was terminated.");
			padding = 2;
			logMsg("ip=", ws.ip);
			logMsg("Reason: The connection did not ping to pong.");
			padding = 1;
		}
		ws.isAlive = false;
		ws.ping();
	});
}

setInterval(ping, 3E2);

const words = ["new", "interesting", "wild", "strange", "breathtaking"];
const connectText = "{0} {1} WebSocket connection appears ip={2}";
const disconnectText = "{0} was never seen again.";

let padding = 1;
function logMsg() {
	return console.log.call({}, "\0".repeat(4*padding) + "+--", ...arguments);
}