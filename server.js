

function addNode(node) {
	nodes.push(node);
	qt.insert(node);
}

function removeNodeById(id) {
	let index = nodes.findIndex(node => node.id == id);
	if (index > -1) nodes.splice(index, 1);
}

function onWsConnection(ws, req) {
	let node = new Circle(
		Math.random() * 1000, 
		Math.random() * 400, 
		50
	);
	nodes.push(node);
	qt.insert(node);
	node.ws = ws;

	function onWsOpen() {
		// sendString(ws, "Server test message");
	}

	function onWsClose() {
		qt.remove(node);
		removeNodeById(node.id);
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
				let mouseX, mouseY;
				mouseX = view.getFloat32(offset); offset += 4;
				mouseY = view.getFloat32(offset); offset += 4;
				node.mouseX = mouseX;
				node.mouseY = mouseY;
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
	nodes.forEach(node => {
		node.move();
		node.checkIfUpdated();
	});
	nodes.forEach(node => {
		node.updateViewNodes();
		sendMsg(node.ws, node.getNodesPackage());
	});
}

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength));
}

function sendMsg(ws, view) {
	if (ws.readyState != WebSocket.OPEN) return false;
	ws.send(view.buffer);
}

function sendString(ws, str) {
	let view = prepareMsg(2+str.length);
	let offset = 0;
	view.setUint8(offset++, 23);
	offset = writeString(view, offset, str);
	sendMsg(ws, view);
}

function sendFloat32(ws, msgId, float) {
	let view = prepareMsg(5);
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

function printIp(req, res, next) {
	console.log(req.headers["x-forwarded-for"] || req.connection.remoteAddress);
	next();
}

const express = require("express");
const app = express();

app.use("/", printIp);
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
		this.oldSize = this.newSize = r;
		this.updateTime = 0;
		this.mouseX = 0;
		this.mouseY = 0;
		this.addedNodes = [];
		this.removedNodes = [];
		this.updatedNodes = [];
		this.allNodes = [];
		this.nicknameText = null;
		this.updated = !false;
		this.playing = !true;
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
	checkIfUpdated() {
		if (Math.hypot(this.x - this.oldX, this.y - this.oldY) > 0 || 
			Math.abs(this.r - this.oldSize) > 0) {
			this.oldX = this.x;
			this.oldY = this.y;
			this.oldSize = this.r;
			this.updated = true;
		} else {
			this.updated = false;
		}
	}
	updateViewNodes() {
		let nodesInView = [];
		qt.query({ 
			x: this.x - 192 / 2,
			y: this.y - 108 / 2,
			w: 192,
			h: 108
		}, function forEach(node) { nodesInView.push(node); });
		this.addedNodes = nodesInView.filter(node => this.allNodes.indexOf(node) == -1);
		this.removedNodes = this.allNodes.filter(node => nodesInView.indexOf(node) == -1);
		this.updatedNodes = nodesInView.filter(node => node.updated);
		this.allNodes = nodesInView;
	}
	getNodesPackage() {
		function setCommonData(node) {
			view.setFloat32(offset, node.id); offset += 4;
			view.setFloat32(offset, node.x);  offset += 4;
			view.setFloat32(offset, node.y);  offset += 4;
			view.setFloat32(offset, node.r);  offset += 4;
		}
		let nicknameBytes = 0;
		this.addedNodes.forEach(node => (nicknameBytes += node.nickname.length+1));
		let view = prepareMsg(
			1+4*3+
			this.addedNodes.length*(4+4+4+4+1)+
			nicknameBytes+
			this.updatedNodes.length*(4+4+4+4)+
			this.removedNodes.length*4
		);
		let offset = 0;
		view.setUint8(offset++, 10);
		view.setFloat32(offset, this.addedNodes.length);
		offset += 4;
		this.addedNodes.forEach(node => {
			setCommonData(node);
			view.setUint8(offset++, node.hue);
			offset = writeString(view, offset, node.nickname);
		});
		view.setFloat32(offset, this.updatedNodes.length);
		offset += 4;
		this.updatedNodes.forEach(node => {
			setCommonData(node);
		});
		view.setFloat32(offset, this.removedNodes.length);
		offset += 4;
		this.removedNodes.forEach(node => {
			view.setFloat32(offset, node.id); offset += 4;
		});
		return view;
	}
}


class QuadTree {
	constructor(x, y, w, h, lvl, parent) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.items = [];
		this.nodes = [];
		this.level = lvl || 0;
		this.parent = parent;
	}
	divide() {
		if (this.level >= 10) return false;
		let n = this.level+1;
		this.nodes[0] = new QuadTree(this.x, this.y, this.w / 2, this.h / 2, n, this);
		this.nodes[1] = new QuadTree(this.x+this.w / 2, this.y, this.w / 2, this.h / 2, n, this);
		this.nodes[2] = new QuadTree(this.x, this.y+this.h / 2, this.w / 2, this.h / 2, n, this);
		this.nodes[3] = new QuadTree(this.x+this.w / 2, this.y+this.h / 2, this.w / 2, this.h / 2, n, this);
		let a = this.items;
		this.items = [];
		for (let i = 0; i < a.length; i++) this.insert(a[i]);
		return true;
	}
	findNodeId(x, y) {
		return x < this.x+this.w/2 ? (y < this.y+this.h/2 ? 0 : 2) : (y < this.y+this.h/2 ? 1 : 3);
	}
	insert(node) {
		if (this.nodes.length !== 0) {
			return this.nodes[this.findNodeId(node.x, node.y)].insert(node);
		} else {
			if (this.items.length < 5) {
				this.items.push(node);
				node._qtNode = this;
				return this;
			} else {
				if (this.divide()) return this.nodes[this.findNodeId(node.x, node.y)].insert(node);
				else return false;
			}
		}
	}
	remove(node) {
		if (node._qtNode) {
			let i = node._qtNode.items.indexOf(node);
			i > -1 && node._qtNode.items.splice(i, 1);
			if (i > -1 && node._qtNode.parent) {
				let a = [];
				node._qtNode.parent.query(this, function(item) { a.push(item); });
				node._qtNode.parent.clear();
				for (let j = 0; j < a.length; j++) node._qtNode.parent.insert(a[j]);
			}
		}
	}
	clear() {
		for (let i = 0; i < this.nodes.length; i++) this.nodes[i].clear();
		this.nodes.length = 0;
		this.items.length = 0;
	}
	query(range, func) {
		if (this.x+this.w > range.x && this.y+this.h > range.y && this.x < range.x+range.w && this.y < range.y+range.h) {
			for (let i = 0; i < this.items.length; i++) func(this.items[i]);
			if (this.nodes.length > 0) {
				for (let i = 0; i < this.nodes.length; i++) this.nodes[i].query(range, func);
			}
		}
	}
	draw() {
		if (this.nodes.length > 0) {
			for (let i = 0; i < this.nodes.length; i++) this.nodes[i].draw();
		} else {
			if (this.w > 30) {
				if (this.num == null) this.num = new Text();
				if (this.num.text !== this.items.length) {
					this.num.setText(this.items.length);
					this.num.setFont("bolder 30px Ubuntu");
					this.num.setStyle("#f3f3f3", "#333", 3);
					this.num.render();
				}
				ctx.drawImage(this.num.canvas, this.x+this.w/2-this.num.width/2, this.y+this.h/2-this.num.height/2);	
			}
			ctx.strokeStyle = "red";
			ctx.lineWidth = 1;
			ctx.strokeRect(this.x, this.y, this.w, this.h);
			ctx.lineWidth = 2;
			ctx.strokeStyle = "red";
			for (let j = 0; j < this.items.length; j++) {
				ctx.beginPath();
				ctx.arc(this.items[j].x, this.items[j].y, 1, 0, Math.PI * 2);
				ctx.closePath();
				ctx.stroke();
			}
		}
	}
}

let gameSize = 1000;
let nodes = [];
let qt = new QuadTree(0, 0, gameSize, gameSize);