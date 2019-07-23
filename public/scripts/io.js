

function onResize() {
	canvasWidth = innerWidth;
	canvasHeight = innerHeight;
	gameCanvas.width = canvasWidth;
	gameCanvas.height = canvasHeight;
	scale = Math.max(innerWidth / width, innerHeight / height);
}

function onKeyUp(evt) {
	if (evt.keyCode == 27) {
		if (main.getBoundingClientRect().width == 0) show();
		else hide();	
	}
}

function onMouseMove(evt) {
	mouseX = evt.clientX;
	mouseY = evt.clientY;
	sendMousePos();
}

function onClick() {
	let txt = "";
	while(txt.length < 24) txt += String.fromCharCode(40+~~(Math.random() * 100));
	addMsg({
		text: txt,
		duration: 6000,
		bg: Math.random() > 0.3 ? "black" : "red"
	});
}

document.onmousemove = onMouseMove;
document.onkeyup = onKeyUp;
document.onclick = onClick;
window.onresize = onResize;

function onWsOpen() {
	console.log("WebSocket opened.");
	sendTime = timestamp;
	sendUint8(ws, 89);
	hide();
}

function onWsClose() {
	console.log("WebSocket closed.");
}

function onWsMessage(msg) {
	let blob = msg.data;
	let fileReader = new FileReader();
	fileReader.onload = function(evt) {
		let arrayBuffer = evt.target.result;
		let view = new DataView(arrayBuffer);
		handleWsMessage(view);
	}
	fileReader.readAsArrayBuffer(blob);
}

function wsConnect(wsUrl) {
	if (ws) {
		ws.onmessage = null;
		ws.onopen = null;
		ws.onclose = null;
		ws.close();
		ws = null;
	}
	ws = new WebSocket(wsUrl || "ws://localhost:6969");
	ws.onopen = onWsOpen;
	ws.onmessage = onWsMessage;
	ws.onclose = onWsClose;
	ws.onerror = function error() {
		console.log("websocket error.");
	}
}

function handleWsMessage(view) {
	throughput += view.byteLength;
	function getString() {
		let str = new String();
		while ((char = view.getUint8(offset++)) != 0) {
			str += String.fromCharCode(char);
		}
		return str;
	}
	let offset = 0;
	switch (view.getUint8(offset++)) {
		case 23: 
			addMsg({
				text: getString(),
				duration: 6000,
				bg: "blue"
			});
			break;
		case 10: 
			let queueLength = view.getFloat32(offset);
			offset += 4;
			for (let i = 0; i < queueLength; i++) {
				let nodeId = view.getFloat32(offset);
				offset += 4;
				let posX, posY, size, hue;
				posX = view.getFloat32(offset);
				offset += 4;
				posY = view.getFloat32(offset);
				offset += 4;
				size = view.getFloat32(offset);
				offset += 4;
				hue = view.getUint8(offset);
				offset++;
				let node = nodes.find(node => node.id == nodeId);
				if (node) {
					node.updateTime = timestamp;
					node.oldX = node.x;
					node.oldY = node.y;
					node.newX = posX;
					node.newY = posY;
					node.newSize = size;
					node.hue = hue;
				} else {
					node = new Circle(posX, posY, size);
					node.id = nodeId;
					node.hue = hue;
					nodes.push(node);
				}
			}
			queueLength = view.getFloat32(offset);
			offset += 4;
			for (let i = 0; i < queueLength; i++) {
				let nodeId = view.getFloat32(offset);
				offset += 4;
				removeNode(nodeId);
			}
			break;
		case 12: 
			gameSize = view.getFloat32(offset);
			break;
		case 13: 
			nodeId = view.getFloat32(offset);
			break;
		case 89: 
			latency = timestamp - sendTime;
			addLog(1, "ms");
			setTimeout(function() { sendUint8(ws, 89); sendTime = timestamp; }, 1000);
			break;
		default: 
			console.log("unknown server message.");
	}
}

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength))
}

function sendMsg(ws, view) {
	if (!ws || ws.readyState != WebSocket.OPEN) return false;
	ws.send(view.buffer);
	throughput += view.byteLength;
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

function sendString(ws, str) {
	let view = prepareMsg(1+str.length+1);
	let offset = 0;
	view.setUint8(offset++, 23);
	offset = prepareString(view, offset, str);
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
	view.getUint8(0, int);
	sendMsg(ws, view);
}

function sendMousePos() {
	mouseX -= canvasWidth / 2;
	mouseY -= canvasHeight / 2;
	let msg = prepareMsg(1+4+4);
	msg.setUint8(0, 11);
	msg.setFloat32(1, mouseX);
	msg.setFloat32(5, mouseY);
	sendMsg(ws, msg);
}

function removeNode(id) {
	let index = nodes.findIndex(node => node.id == id);
	if (index > -1) nodes.splice(index, 1);
}

function play() {
	wsConnect();
}

function showCanvas() {
	gameCanvas.style.zIndex = 999;
}

function hideCanvas() {
	gameCanvas.style.zIndex = -1;
}

function show() {
	main.style.display = "block";
	hideCanvas();
}

function hide() {
	main.style.display = "none";
	showCanvas();
}

function renderLogs() {
	logCanvas.width = 200;
	logCanvas.height = 200;
	let ctx = logCanvas.getContext("2d");
	let posY = 0;
	logs.forEach(function(log) {
		ctx.drawImage(log.canvas, 0, posY);
		posY += log.height + 2;
	});
}

function renderMsgs() {
	let ctx = msgCanvas.getContext("2d");
	msgCanvas.width = 500;
	msgCanvas.height = 400;
	for (let i = 0, y = 0; i < msgs.length; i++) {
		let msg = msgs[i];
		let dt = msg.expireTime - timestamp;
		dt < 0 && msgs.splice(i, 1);
		let scale = 1;
		dt < 200 && (scale = dt / 200);
		dt > msg.duration - 200 && (scale = (msg.duration - dt) / 200)
		ctx.save();
		ctx.translate(msg.width / 2, y + msg.height / 2);
		ctx.scale(scale, scale);
		ctx.drawImage(msg.canvas, -msg.width / 2, -msg.height / 2);
		ctx.restore();	
		y += msg.height+4;
	}
}

function renderGrid(size) {
	gridCanvas.width = size;
	gridCanvas.height = size;
	let ctx = gridCanvas.getContext("2d");
	ctx.fillStyle = "#b1b1b1";
	ctx.fillRect(0, size / 2, size, 2);
	ctx.fillRect(size / 2, 0, 2, size);
}

function addMsg(args) {
	let msg = new Text();
	msg.setText(args.text);
	msg.setFont("bold 16px Ubuntu");
	msg.setStyle("#f3f3f3", "#333", 3, args.bg);
	msg.render();
	msg.duration = args.duration;
	msg.expireTime = timestamp+args.duration;
	msgs.unshift(msg);
}

function addLog(i, txt) {
	let msg = new Text();
	msg.setText(txt);
	msg.setStyle("#f3f3f3", "#333", 3);
	msg.setFont("bolder 16px Ubuntu");
	msg.render();
	logs[i] = msg;
}

function gameLoop() {
	timestamp = +Date.now();
	ctx.fillStyle = "#bbb";
	ctx.fillRect(0, 0, width, height);

	ctx.save();

	let node = nodes.find(node => node.id == nodeId) || new Circle(0, 0);
	ctx.translate(canvasWidth / 2 - node.x, canvasHeight / 2 - node.y);

	renderGrid(26);
	ctx.fillStyle = ctx.createPattern(gridCanvas, "repeat");
	ctx.fillRect(-canvasWidth / 2 + node.x, -canvasHeight / 2 + node.y, canvasWidth, canvasHeight);

	qt.draw();

	nodes.forEach(function(node) {
		node.updatePos();
		node.r = node.newSize * 0.1 + node.r * 0.9;
		function drawNode(x, y) {
			ctx.beginPath();
			ctx.arc(x, y, node.r, 0, Math.PI * 2);
			ctx.closePath();
			ctx.fillStyle = "hsl("+node.hue+", 100%, 49%)";
			ctx.strokeStyle = "hsl("+node.hue+", 100%, 38%)";
			ctx.lineWidth = 10
			ctx.stroke();
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		drawNode(node.x, node.y);
		
	});

	ctx.strokeStyle = "#333";
	ctx.lineJoin = "round";
	ctx.lineWidth = 2;
	ctx.strokeRect(0, 0, gameSize, gameSize);

	ctx.restore();

	renderMsgs();
	ctx.drawImage(msgCanvas, 10, 10);

	timestamp - lastTime > 1000 && (
		addLog(0, throughput+" bytes/sec"),
		throughput = 0, 
		lastTime = timestamp);

	renderLogs();
	ctx.drawImage(logCanvas, 2, 500+5)

	requestAnimationFrame(gameLoop);
}

class Circle {
	constructor(x, y, r) {
		this.id = ~~(Math.random() * 1E10);
		this.x = x;
		this.y = y;
		this.r = r;
		this.hue = ~~(Math.random() * 256);
		this.oldX = this.newX = x;
		this.oldY = this.newY = y;
		this.newSize = this.r;
		this.updateTime = 0;
		this.mouseX = 0;
		this.mouseY = 0;
		this.addedNodes = [];
		this.removedNodes = [];
		this.updatedNodes = [];
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
		this.num = new Text();
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

class Text {
	constructor() {
		this.canvas = document.createElement("canvas");
		this.setText("");
		this.setFont("bolder 20px Ubuntu");
		this.setStyle("#fff", "#000", 3);
	}
	setText(txt) {
		this.text = txt;
	}
	setFont(fontStr) {
		this.fontStr = fontStr;
		this.fontSize = parseInt(fontStr.replace(/[^0-9]/g, ""));
	}
	setStyle(fill, stroke, lw, bg) {
		this.fill = fill;
		this.stroke = stroke;
		this.lw = lw;
		this.bg = bg;
	}
	render() {
		let ctx = this.canvas.getContext("2d");
		ctx.font = this.fontStr;
		this.canvas.width = ctx.measureText(this.text).width+this.lw*2;
		this.canvas.height = this.fontSize+this.lw*2;
		this.width = this.canvas.width;
		this.height = this.canvas.height;
		ctx.font = this.fontStr;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		if (this.bg) {
			ctx.globalAlpha = 0.4;
			ctx.fillStyle = this.bg;
			ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
			ctx.globalAlpha = 1;
		}
		ctx.strokeStyle = this.stroke;
		ctx.fillStyle = this.fill;
		ctx.lineWidth = this.lw;
		ctx.strokeText(this.text, this.lw, this.lw);
		ctx.fillText(this.text, this.lw, this.lw);
		return this.canvas;
	}
}

let latency = 0,
	sendTime = 0,
	lastTime = 0,
	throughput = 0,
	timestamp = 0,
	gameSize = 0,
	nodeId = null,
	nodes = [],
	mouseX = 0,
	mouseY = 0,
	width = 1920,
	height = 1080,
	scale = 1,
	canvasWidth = 0,
	canvasHeight = 0,
	logs = [],
	msgs = [],
	qt = new QuadTree(0, 0, 1000, 1000),
	ws = null,
	nicknameInput = document.getElementById("nicknameInput"),
	playButton = document.getElementById("playButton"),
	main = document.querySelector(".main"),
	overlay = document.getElementById("overlay"),
	header = document.querySelector("header"),
	footer = document.querySelector("footer"),
	gameCanvas = document.getElementById("gameCanvas"),
	ctx = gameCanvas.getContext("2d"),
	gridCanvas = document.createElement("canvas"),
	lbCanvas = document.createElement("canvas"),
	msgCanvas = document.createElement("canvas"),
	logCanvas = document.createElement("canvas");

window.onload = function() {
	onResize();
	playButton.onclick = play;
	for (let i = 0; i < 40; i++) {
		qt.insert(new Circle(
			Math.random() * 1000, 
			Math.random() * 1000
		));
	}
	gameLoop();
}
