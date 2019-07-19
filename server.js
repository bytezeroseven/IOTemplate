

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
		view[i] = buffer[i];
	}
	return new DataView(arrayBuffer);
}

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength));
}

function onWsConnection(ws, req) {
	function sendMsg(view) {
		if (ws.readyState != WebSocket.OPEN) return false;
		ws.send(view.buffer);
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
		sendString("Server test message.")
	}

	function onWsClose() {
		
	}

	function onWsMessage(msg) {
		handleWsMessage(prepareData(msg.data));
	}

	ws.on("pong", pong);

	onWsOpen();
	ws.onopen = onWsOpen;
	ws.onmessage = onWsMessage;
	ws.onclose = onWsClose;

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
			// Handle messages
		}
	}
}

wss.on("connection", onWsConnection);

function pong() {
	this.isAlive = true;
}

function ping() {
	wss.clients.forEach(function each(ws) {
		if(ws.isAlive == false) ws.terminate();
		ws.isAlive = false;
		ws.ping();
	});
}

setInterval(ping, 3E2);