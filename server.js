

function addNode(node) {
	nodes.push(node);
	qt.insert(node);
}

function removeNode(node) {
	let index = nodes.indexOf(node);
	if (index > -1) nodes.splice(index, 1);
	qt.remove(node);
}

function onWsConnection(ws, req) {
	let node = new Circle(
		Math.random() * 1000, 
		Math.random() * 400, 
		Math.random() * 10+50
	);
	addNode(node);
	node.ws = ws;
	node.isPlaying = false;
	node.isPlayer = true;

	function onWsOpen() {
		sendString(ws, nodes.length+" total nodes");
	}

	function onWsClose() {
		removeNode(node);
	}	

	function onWsMessage(msg) {
		handleWsMessage(prepareData(msg.data));
	}

	onWsOpen();
	ws.on("pong", pong);
	ws.onopen = onWsOpen;
	ws.onmessage = onWsMessage;
	ws.onclose = onWsClose;

	sendInt16(ws, 12, gameSize);
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
				node.isPlaying = true;
				sendMsg(ws, lbNamesView);
				break;
			case 33:
				sendUint8(ws, 33);
				break;
			case 255:
				node.isPlaying = !node.isPlaying;
				break;
		}
	}
}

function gameTick() {
	let players = [];
	nodes.forEach(node => {
		if (node.isPlayer) players.push(node);
		if (node.isPlaying) node.move();
		node.checkIfUpdated();
		if (node.x >= node._qtNode.x && node.y >= node._qtNode.y && node.x <= node._qtNode.x+node._qtNode.w && node.y <= node._qtNode.y+node._qtNode.h) {
		} else {
			qt.remove(node);
			qt.insert(node);
		}
		if(!node.isPlayer) return;
		qt.query({ x: node.x - node.r * 2, y: node.y - node.r * 2, w: node.r * 4, h: node.r * 4 }, function(other) {
			if (other.isPlaying == false) return;
			let d = Math.hypot(other.x - node.x, node.y - other.y);
			if (d < node.r + other.r) {
				if (node.r > other.r * 1.2 && d < node.r - other.r * 0.45) {
					node.r += Math.sqrt(other.r);
					other.r = 0;
					removeNode(other);
				} 
			}
		})
	});
	let newLbNames = players.sort((a, b) => b.r - a.r).map(a => a.nickname);
	newLbNames = newLbNames.slice(0, Math.min(10, newLbNames.length));
	for (let j = 0; j < newLbNames.length; j++) {
		if (newLbNames[j] != lbNames[j]) {
			lbNames = newLbNames;
			break;
		}
	}
	let nicknameBytes = 0;
	lbNames.forEach(name => (nicknameBytes += name.length+1));
	let view = prepareMsg(1+1+nicknameBytes);
	let offset = 0;
	view.setUint8(offset++, 20);
	view.setUint8(offset++, lbNames.length);
	for (let i = 0; i < lbNames.length; i++) offset = writeString(view, offset, lbNames[i]);
	lbNamesView = view;
	players.forEach(node => {
		if (node.ws) {
			node.updateViewNodes();
			sendMsg(node.ws, node.getNodesPackage());
			lbNames == newLbNames && sendMsg(node.ws, lbNamesView);
		}
	});
}

/* 
		           ...[```````[ START ]``````]...
	<================= COMMON NETWORKING CODE ==================>
		........======________________________======.........
*/ 

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength));
}

function sendMsg(ws, view) {
	if (!isWsOpen(ws)) return false;
	ws.send(view.buffer);
}

function isWsOpen(ws) {
	return ws && ws.readyState == WebSocket.OPEN;
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

function sendInt16(ws, msgId, data) {
	let view = prepareMsg(3);
	view.setUint8(0, msgId);
	view.setUint16(1, data);
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
		this.nodesInView = [];
		this.nicknameText = null;
		this.hasUpdated = !false;
		this.isPlaying = !false;
		this.isPlayer = false;
	}
	updatePos() {
		if (animWithTimeCb.checked) {
			let dt = Math.min((timestamp - this.updateTime) / animDelay, 1);
			this.x = this.oldX + (this.newX - this.oldX) * dt;
			this.y = this.oldY + (this.newY - this.oldY) * dt;
		} else {
			this.x += (this.newX - this.x) * 0.1;
			this.y += (this.newY - this.y) * 0.1;
		}
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
		if (Math.hypot(this.x - this.oldX, this.y - this.oldY) > 0 || Math.abs(this.r - this.oldSize) > 0) {
			this.oldX = this.x;
			this.oldY = this.y;
			this.oldSize = this.r;
			this.hasUpdated = true;
		} else {
			this.hasUpdated = false;
		}
	}
	updateViewNodes() {
		let nodesInView = [];
		qt.query({ 
			x: this.x - 1920 / 2,
			y: this.y - 1080 / 2,
			w: 1920,
			h: 1080
		}, function forEach(node) { node.isPlaying && nodesInView.push(node); });
		this.addedNodes = nodesInView.filter(node => this.nodesInView.indexOf(node) == -1);
		this.removedNodes = this.nodesInView.filter(node => nodesInView.indexOf(node) == -1);
		this.updatedNodes = nodesInView.filter(node => node.hasUpdated);
		this.nodesInView = nodesInView;
	}
	getNodesPackage() {
		function setCommonData(node) {
			view.setFloat32(offset, node.id); offset += 4;
			view.setInt16(offset, node.x);  offset += 2;
			view.setInt16(offset, node.y);  offset += 2;
			view.setInt16(offset, node.r);  offset += 2;
		}
		let nicknameBytes = 0;
		this.addedNodes.forEach(node => (nicknameBytes += node.nickname.length+1));
		let view = prepareMsg(
			1+2*3+
			this.addedNodes.length*(4+2+2+2+1)+
			nicknameBytes+
			this.updatedNodes.length*(4+2+2+2)+
			this.removedNodes.length*4
		);
		let offset = 0;
		view.setUint8(offset++, 10);
		view.setUint16(offset, this.addedNodes.length);
		offset += 2;
		this.addedNodes.forEach(node => {
			setCommonData(node);
			view.setUint8(offset++, node.hue);
			offset = writeString(view, offset, node.nickname);
		});
		let numOffset = offset;
		view.setUint16(offset, this.updatedNodes.length); offset += 2;
		this.updatedNodes.forEach(node => { 
			setCommonData(node); 
		});
		view.setUint16(offset, this.removedNodes.length); offset += 2;
		this.removedNodes.forEach(node => { 
			view.setFloat32(offset, node.id); 
			offset += 4; 
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
			if (this.items.length < 10) {
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
					this.num.setFont("bolder 30px Arial");
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

/* 
		           ...[```````[  END  ]``````]...
	<================= COMMON NETWORKING CODE ==================>
		........======________________________======.........
*/ 

let gameSize = 10000,
	nodes = [],
	qt = new QuadTree(0, 0, gameSize, gameSize),
	lbNames = [],
	lbNamesView = prepareMsg(0);

for (let i = 0; i < 500; i++) {
	let node = new Circle(
		Math.random() * gameSize, 
		Math.random() * gameSize, 
		Math.random() * 10+30
	);
	function move() {
		setTimeout(() => {
			node.mouseX = Math.random() * 1920 - 960;
			node.mouseY = Math.random() * 1080 - 540;
			move();
		}, 1000);
	}
	move();
	node.nickname = "bot"+String.fromCharCode(~~(Math.random() * 254)+1).repeat(5);
	addNode(node);
}

for (let i = 0; i < 5000; i++) {
	let node = new Circle(
		Math.random() * gameSize, 
		Math.random() * gameSize, 
		Math.random() * 5+3
	);
	addNode(node);
}

/* 
		           ...[````````[ START ]````````]...
	<================= SERVER INIT (DON'T TOUCH) ==================>
		........======___________________________======.........
*/ 

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

let express = require("express");
let app = express();

app.use("/", printIp);
app.use("/", express.static("public"));
app.use("/shared", express.static("shared"));

let port = process.env.PORT || 6969;
let server = app.listen(port, function done() {
	console.log("Server started listening on port=" + port);
});

let WebSocket = require("ws");
let wss = new WebSocket.Server({ server });
wss.on("connection", onWsConnection);

setInterval(ping, 3E4);
setInterval(gameTick, 1E3/20);

/* 
		           ...[````````[  END  ]````````]...
	<================= SERVER INIT (DON'T TOUCH) ==================>
		........======___________________________======.........
*/ 
