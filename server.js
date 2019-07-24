

let nodes = [];
let remove = [];

let gameSize = 1000;

let msgParams = "x,y,r,id,hue,nickname".split(",");

class Circle {
	constructor(x, y, r) {
		this.id = ~~(Math.random() * 1E10);
		this.x = x;
		this.y = y;
		this.r = r;
		this.hue = ~~(Math.random() * 256);
		this.nickname = "";
		this.oldX = this.newX = x;
		this.oldY = this.newY = y;
		this.newSize = this.r;
		this.updateTime = 0;
		this.mouseX = 0;
		this.mouseY = 0;
		this.addedNodes = [];
		this.removedNodes = [];
		this.updatedNodes = [];
		this.nicknameText = null;
	}
	updatePos() {
		let dt = Math.min((timestamp - this.updateTime) / 500, 1);
		this.x = this.oldX + (this.newX - this.oldX) * dt;
		this.y = this.oldY + (this.newY - this.oldY) * dt;
	}
	move() {
		let d = Math.hypot(this.mouseX, this.mouseY) || 1;
		let speed = 1 / (1 + Math.pow(0.5 * this.r, 0.43)) * 1.28 * 60; 
		this.x += this.mouseX / d * speed;
		this.y += this.mouseY / d * speed;
		this.x = Math.max(Math.min(this.x, gameSize), 0);
		this.y = Math.max(Math.min(this.y, gameSize), 0);
	}
}

function removeNode(id) {
	let index = nodes.findIndex(node => node.id == id);
	if (index > -1) nodes.splice(index, 1);
}

function onWsConnection(ws, req) {
	let word = words[Math.floor(Math.random() * words.length)];
	let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	let vowel = "aeiou".indexOf(word[0]) > -1 ? "An" : "A";
	console.log(connectText.replace(/\{0}/, vowel).replace(/\{1}/, word).replace(/\{2}/, ip));

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

	let node = new Circle(
		Math.random() * 1000, 
		Math.random() * 400, 
		50
	);
	nodes.push(node);
	node.ws = ws;

	function onWsOpen() {
		sendString(ws, "You're connected.");
	}

	function onWsClose() {
		remove.push(node.id);
	}

	function onWsMessage(msg) {
		handleWsMessage(prepareData(msg.data));
	}

	onWsOpen();
	ws.on("pong", pong);
	ws.onopen = onWsOpen;
	ws.onmessage = onWsMessage;
	ws.onclose = onWsClose;

	sendFloat32(ws, 12, gameSize);
	sendFloat32(ws, 13, node.id);

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
			case 11:
				let posX, posY;
				posX = view.getFloat32(offset);
				offset += 4;
				posY = view.getFloat32(offset);
				node.mouseX = posX;
				node.mouseY = posY;
				break;
			case 49:
				node.nickname = getString();
				break;
			case 33:
				sendUint8(ws, 33);
				break;
		}
	}
}

function gameTick() {
	let length = 1+4+nodes.length*(4*4+1)+4+remove.length*4;
	nodes.forEach(node => (length += node.nickname.length+1));
	let view = prepareMsg(length);
	let offset = 0;
	view.setUint8(offset++, 10);
	view.setFloat32(offset, nodes.length);
	offset += 4
	nodes.forEach(function genPackage(node) {
		node.move();
		view.setFloat32(offset, node.id);
		offset += 4;
		view.setFloat32(offset, node.x);
		offset += 4;
		view.setFloat32(offset, node.y);
		offset += 4;
		view.setFloat32(offset, node.r);
		offset += 4;
		view.setUint8(offset, node.hue);
		offset++;
		offset = writeString(view, offset, node.nickname);
	});

	view.setFloat32(offset, remove.length);
	offset += 4;
	remove.forEach(function(id) {
		view.setFloat32(offset, id);
		offset += 4;
		removeNode(id);
	});
	nodes.forEach(function sendPackage(node) { sendMsg(node.ws, view); });
	remove = [];
}

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength));
}

function sendMsg(ws, view) {
	if (ws.readyState != WebSocket.OPEN) return false;
	ws.send(view.buffer);
}

function sendString(ws, str) {
	let view = prepareMsg(1+str.length+1);
	let offset = 0;
	view.setUint8(offset++, 23);
	offset = writeString(view, offset, str);
	sendMsg(ws, view);
}

function sendFloat32(ws, msgId, float) {
	let view = prepareMsg(1+4);
	view.setUint8(0, msgId);
	view.setFloat32(1, float);
	sendMsg(ws, view);
}

function sendUint8(ws, int) {
	let view = prepareMsg(1);
	view.setUint8(0, int);
	sendMsg(ws, view)
}

function prepareData(buffer) {
	let arrayBuffer = new ArrayBuffer(buffer.length);
	let view = new Uint8Array(arrayBuffer);
	for(let i = 0; i < buffer.length; i++) {
		view[i] = buffer[i];
	}
	return new DataView(arrayBuffer);
}

function writeString(view, offset, str) {
	let i = 0;
	while (i < str.length) {
		let code = str.charCodeAt(i++);
		if(code > 255) continue;
		view.setUint8(offset++, code);
	}
	view.setUint8(offset++, 0)
	return offset;
}

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

const express = require("express");
const app = express();

app.use("/", express.static("public"));
app.use("/shared", express.static("shared"));

const port = process.env.PORT || 6969;
const server = app.listen(port, function done() {
	console.log("Server started listening on port=" + port);
});

const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });
wss.on("connection", onWsConnection);

setInterval(ping, 3E4);
setInterval(gameTick, 1E3/20);
