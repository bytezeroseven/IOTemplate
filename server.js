

function addNode(node) {
	nodes.push(node);
	qt.insert(node);
}

function removeNode(node) {
	let index = nodes.indexOf(node);
	if (index > -1) nodes.splice(index, 1);
	qt.remove(node);
}

let players = [];

function onWsConnection(ws, req) {
	let node = new Circle(0, 0, 0);
	addNode(node);
	node.ws = ws;
	node.isPlaying = false;
	node.isPlayer = true;

	function onWsOpen() {
		sendString(ws, nodes.length + " total nodes");
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
				if (node.isPlaying == false) {
					node.isPlaying = true;
					node.x = Math.random() * 1000;
					node.y = Math.random() * 400;
					node.r = Math.random() * 10 + 30;
					sendMsg(ws, lbNamesView);
				}
				break;
			case 55:
				let d = Math.hypot(node.mouseX, node.mouseY);
				let nn = new Circle(node.x + node.mouseX / d * (node.r +20), node.y + node.mouseY / d * (node.r+20), 20);
				nn.boostX = node.mouseX / d * 40;
				nn.boostY = node.mouseY / d * 40;
				addNode(nn);
				node.r = Math.sqrt(Math.pow(node.r / 10, 2) - 1) * 10;
			case 33:
				sendUint8(ws, 33);
				break;
			case 69:
				node.isSpectating = true;
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
		if (node.isSpectating) {
			node.x = spectateX;
			node.y = spectateY;
			node.r = spectateSize;
			return;
		}
		if (node.isPlaying != false) node.move();
		node.checkIfUpdated();
		if (node.x >= node._qtNode.x && node.y >= node._qtNode.y && node.x <= node._qtNode.x+node._qtNode.w && node.y <= node._qtNode.y+node._qtNode.h) {
		} else {
			qt.remove(node);
			qt.insert(node);
		}
		if (node.isFood) return;
		if (node.r > 30) node.r *= 0.9998;
		qt.query({ 
			x: node.x - node.r * 2, 
			y: node.y - node.r * 2, 
			w: node.r * 4, 
			h: node.r * 4 
		}, function(other) {
			if (other.isPlaying == false) return;
			let d = Math.hypot(other.x - node.x, node.y - other.y);
			if (d < node.r + other.r) {
				if (node.r > other.r * 1.05 && d < node.r - other.r * 0.48) {
					let r = Math.sqrt(Math.pow(node.r / 10, 2) + Math.pow(other.r / 10, 2)) * 10
					node.r = r;
					if (!other.isPlayer) removeNode(other) 
					other.isPlaying = false; 
					other.killerNodeId = node.id;
					if (other.isFood) {
						addFood();
					} else if (other.isBot) {
						addBot();
					}
				} 
			}
		})
	});
	let sorted = players.sort((a, b) => b.r - a.r);
	spectateNode = sorted[0];
	if (spectateNode) {
		spectateX = spectateNode.x;
		spectateY = spectateNode.y;
		spectateSize = spectateNode.r;
	}
	let newLbNames = sorted.filter(n => n.isPlaying).map(a => a.nickname)
	newLbNames = newLbNames.slice(0, Math.min(10, newLbNames.length));
	if (newLbNames.length != lbNames.length) {
		lbNames = newLbNames;
	} else {
		for (let i = 0; i < newLbNames.length; i++) {
			if (newLbNames[i] != lbNames[i]) {
				lbNames = newLbNames;
				break;
			}
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
		if (isWsOpen(node.ws)) { 
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
	let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	console.log("New request form ip=" + ip);
	next();
}

let express = require("express");
let app = express();

app.use("/", printIp);
app.use("/shared", express.static("shared"));
app.use("/", express.static("public"));



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




let utils = require("./shared/utils.js");
for (let i in utils) {
	global[i] = utils[i];
}

let gameSize = 10E3,
	nodes = [],
	qt = new QuadTree(0, 0, gameSize, gameSize),
	lbNames = [],
	lbNamesView = prepareMsg(0),
	spectateX = 0,
	spectateY = 0,
	spectateSize = 0;

global.gameSize = gameSize;
global.WebSocket = WebSocket;
global.qt = qt;


/* 
		           ...[```````[  END  ]``````]...
	<================= COMMON NETWORKING CODE ==================>
		........======________________________======.........
*/ 



function addBot() {
	let node = new Circle(
		Math.random() * gameSize, 
		Math.random() * gameSize, 
		30
	);
	node.isBot = true;
	function move() {
		let id = setTimeout(() => {
			node.mouseX = Math.random() * 1920 - 960;
			node.mouseY = Math.random() * 1080 - 540;
			clearInterval(id);
			id = null;
			move();
		}, 1000);
	}
	move();
	let rnd = ~~(Math.random() * 254)+1;
	node.nickname = String.fromCharCode(rnd).repeat(5)+String.fromCharCode(rnd+1).repeat(5);
	addNode(node);
}

function addFood() {
	let node = new Circle(
		Math.random() * gameSize, 
		Math.random() * gameSize, 
		6 || Math.random() * 5+4
	);
	node.isFood = true;
	addNode(node);
}

for (let i = 0; i < 50; i++) {
	addBot()
}

for (let i = 0; i < 5000; i++) {
	addFood();
}

