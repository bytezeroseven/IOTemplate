


function onResize() {
	canvasWidth = innerWidth;
	canvasHeight = innerHeight;
	gameCanvas.width = canvasWidth;
	gameCanvas.height = canvasHeight;
	scale = Math.max(innerWidth / width, innerHeight / height);
}

function onKeyUp(evt) {
	if (evt.keyCode == 27) toggleEle(mainOverlay);
	if (evt.key.toLowerCase() == "j") sendUint8(ws, 255);
}

function onMouseMove(evt) {
	mouseX = evt.clientX;
	mouseY = evt.clientY;
	sendMousePos();
}

function onClick(evt) { 
	if (evt.target == mainOverlay) hideEle(mainOverlay);
}

document.onmousemove = onMouseMove;
document.onkeyup = onKeyUp;
document.onclick = onClick;
window.onresize = onResize;

function addNode(node) {
	nodes.push(node);
	qt.insert(node);
}

function removeNode(node) {
	let index = nodes.indexOf(node);
	if (index > -1) nodes.splice(index, 1);
	qt.remove(node);
}

function onWsOpen() {
	console.log("Connected!");
	addMsg({ text: "WebSocket open", bg: "blue", duration: 10E3});
	checkLatency();
	sendNickname();
	hideEle(playButton.children[0]);
	hideEle(playButton.children[1]);
	showEle(playButton.children[2]);
	hideEle(mainOverlay);
}

function onWsClose() {
	console.log("Disconnected. Reconnecting in 5 seconds...");
	reconnect = setTimeout(function () { 
		wsConnect(oldWsUrl); 
	}, 5e3);
	addMsg({ text: "WebSocket closed", bg: "red", duration: 10E3});
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
	console.log("Connecting to " + wsUrl + "...");
	oldWsUrl = wsUrl;
	clearTimeout(reconnect);
	reconnect = null;
	if (ws) {
		ws.onmessage = null;
		ws.onopen = null;
		ws.onclose = null;
		ws.onerror = null;
		try {
			ws.close();
		} catch (e) { }
		ws = null;
	}
	wsUrl = wsUrl.replace(/^http/, "ws");
	ws = new WebSocket(wsUrl);
	ws.onopen = onWsOpen;
	ws.onmessage = onWsMessage;
	ws.onclose = onWsClose;
	ws.onerror = function () {
		console.log("websocket error");
	}
	nodes = [];
	nodeId = null;
	gameSize = 0;
	latencyCheckTime = 0;
	lastTime = 0;
	msgs = [];
	logs = [];
	lbNames = [];
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
			let nodeId, posX, posY, size, colorHue, nickname;
			function readCommonData() {
				nodeId = view.getFloat32(offset); offset += 4;
				posX = view.getInt16(offset);   offset += 2;
				posY = view.getInt16(offset);   offset += 2;
				size = view.getInt16(offset);   offset += 2;
			}
			numAddedNodes = view.getUint16(offset); offset += 2;
			for (let i = 0; i < numAddedNodes; i++) {
				readCommonData();
				colorHue = view.getUint8(offset++); 
				nickname = getString();
				let node = new Circle(posX, posY, size);
				node.id = nodeId;
				node.hue = colorHue;
				node.nickname = nickname;
				addNode(node);
			}
			numUpdatedNodes = view.getUint16(offset); offset += 2;
			for (let i = 0; i < numUpdatedNodes; i++) {
				readCommonData();
				let node = nodes.find(node => node.id == nodeId);
				if (node) {
					node.updateTime = timestamp;
					node.oldX = node.x;
					node.oldY = node.y;
					node.newX = posX;
					node.newY = posY;
					node.newSize = size;
					if (node._qtNode && node.x >= node._qtNode.x && node.y >= node._qtNode.y && node.x <= node._qtNode.x+node._qtNode.w && node.y <= node._qtNode.y+node._qtNode.h) {
					} else {
						qt.remove(node);
						qt.insert(node);
					}
				}
			}
			numRemovedNodes = view.getUint16(offset); offset += 2;
			for (let i = 0; i < numRemovedNodes; i++) {
				nodeId = view.getFloat32(offset); offset += 4;
				let node = nodes.find(node => node.id == nodeId);
				removeNode(node);
			}
			addLog({
				index: 2,
				text: numAddedNodes+"/"+numUpdatedNodes+"/"+numRemovedNodes+" (add/update/remove)",
			});
			break;
		case 20: 
			let len = view.getUint8(offset++);
			lbNames = [];
			for (let i = 0; i < len; i++) {
				lbNames[i] = new Text();
				let name = getString();
				lbNames[i].setText((i+1)+". "+(name == "" ? "An unnamed cell" : name));
				lbNames[i].setStyle("#fff", false, 0);
				lbNames[i].setFont("bolder 18px arial");
				lbNames[i].render();
			}
			break;
		case 12: 
			gameSize = view.getInt16(offset);
			qt = new QuadTree(0, 0, gameSize, gameSize);
			nodes.forEach(node => qt.insert(node));
			break;
		case 13: 
			screenNodeId = view.getFloat32(offset);
			break;
		case 33: 
			latency = timestamp - latencyCheckTime;
			timestamp = Date.now();
			addLog({ 
				text: "Latency: "+latency+"ms",
				index: 10
			});
			setTimeout(checkLatency, 1000);
			break;
		default: 
			console.log("unknown server message.");
	}
}

function checkLatency() {
	sendUint8(ws, 33);
	latencyCheckTime = timestamp;
}

function sendNickname() {
	let view = prepareMsg(1+nicknameInput.value.length+1);
	view.setUint8(0, 49);
	writeString(view, 1, nicknameInput.value);
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

function play() {
	playButton.disabled = true;
	hideEle(playButton.children[0]);
	showEle(playButton.children[1]);
	wsConnect(regionSelect.selectedOptions[0].value || location.origin);
}

function renderLogs() {
	logCanvas.width = logs.map(a => a.width).sort((a,b) => b-a)[0];
	logCanvas.height = logs.map(a => a.height).reduce((a, b) => a+b);
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
		let animTime = 200;
		dt < animTime && (scale = dt / animTime);
		dt > msg.duration - animTime && (scale = (msg.duration - dt) / animTime)
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

function renderLb() {
	if (lbCanvas.text == null) {
		let text = new Text();
		text.setText("Leaderboard");
		text.setStyle("#fff", false, 0);
		text.render()
		lbCanvas.text = text;
	}
	lbCanvas.width = 180;
	lbCanvas.height = 270;
	let posY = 10+lbCanvas.text.height+5;
	let ctx = lbCanvas.getContext("2d");
	ctx.fillStyle = "#333";
	ctx.globalAlpha = 0.7;
	ctx.fillRect(0, 0, lbCanvas.width, lbCanvas.height);
	ctx.globalAlpha = 1;
	ctx.drawImage(lbCanvas.text.canvas, lbCanvas.width/2 - lbCanvas.text.width / 2, 10);
	lbNames.forEach(function(nameText) {
		ctx.drawImage(nameText.canvas, lbCanvas.width / 2 - nameText.width / 2, posY);
		posY += nameText.height+4;
	});
}

function addMsg(args) {
	let msg = new Text();
	msg.setText(args.text);
	msg.setFont("bold 16px Arial");
	msg.setStyle("#f3f3f3", "#333", 3, args.bg);
	msg.render();
	msg.duration = args.duration;
	msg.expireTime = timestamp+args.duration;
	msgs.unshift(msg);
}

function addLog(args) {
	let msg = new Text();
	msg.setText(args.text);
	msg.setStyle("#f3f3f3", "#666", 3, "black");
	msg.setFont("bolder 14px Arial");
	msg.render();
	logs[args.index] = msg;
}

function gameLoop() {
	timestamp = +Date.now();
	ctx.fillStyle = "#bbb";
	ctx.fillRect(0, 0, width, height);

	ctx.save();

	let node = nodes.find(node => node.id == screenNodeId);
	if (node) {
		nodeX = node.x;
		nodeY = node.y;
	}
	ctx.translate(canvasWidth / 2 - nodeX, canvasHeight / 2 - nodeY);

	renderGrid(26);
	ctx.fillStyle = ctx.createPattern(gridCanvas, "repeat");
	ctx.fillRect(-canvasWidth / 2 + nodeX, -canvasHeight / 2 + nodeY, canvasWidth, canvasHeight);

	if (showQtCb.checked) qt.draw();

	nodes.sort((a, b) => {
		let x = a.r - b.r;
		return x == 0 ? a.id - b.id : x;
	}).forEach(function(node) {
		node.updatePos();
		node.r = node.newSize * 0.1 + node.r * 0.9;
		node.draw();
		
	});

	ctx.strokeStyle = "#333";
	ctx.lineJoin = "round";
	ctx.lineWidth = 2;
	ctx.strokeRect(0, 0, gameSize, gameSize);

	ctx.restore();

	renderMsgs();
	ctx.drawImage(msgCanvas, 10, 10);

	if (timestamp - lastTime > 1000) {
		addLog({ 
			text: "Throughput: "+(throughput>1024?(throughput/1024).toFixed(2)+"k":throughput)+"B/s", 
			index: 0 
		});
		throughput = 0;
		lastTime = timestamp;
		addLog({
			text: "Rendered in "+(Date.now()-timestamp)+"ms",
			index: 20
		});
	}

	if (showLogsCb.checked) {
		renderLogs();
		ctx.drawImage(logCanvas, 2, canvasHeight-logCanvas.height-5);
	}

	renderLb();
	ctx.drawImage(lbCanvas, canvasWidth - lbCanvas.width-10, 10);

	requestAnimationFrame(gameLoop);
}

class Text {
	constructor() {
		this.canvas = document.createElement("canvas");
		this.setText("");
		this.setFont("bolder 20px Arial");
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
		this.stroke = stroke || false;
		this.lw = lw || 0;
		this.bg = bg || false;
	}
	render() {
		let ctx = this.canvas.getContext("2d");
		ctx.font = this.fontStr;
		this.canvas.width = ctx.measureText(this.text).width+this.lw*2+1;
		this.canvas.height = this.fontSize+this.lw*2+1;
		this.width = this.canvas.width;
		this.height = this.canvas.height;
		ctx.font = this.fontStr;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		if (this.bg) {
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = this.bg;
			ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
			ctx.globalAlpha = 1;
		}
		ctx.strokeStyle = this.stroke;
		ctx.fillStyle = this.fill;
		ctx.lineWidth = this.lw;
		this.stroke && ctx.strokeText(this.text, this.lw, this.lw);
		ctx.fillText(this.text, this.lw, this.lw);
		return this.canvas;
	}
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
		this.allNodes = [];
		this.nicknameText = null;
		this.updated = !false;
		this.playing = !false;
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
			x: this.x - 1920 / 2,
			y: this.y - 1080 / 2,
			w: 1920,
			h: 1080
		}, function forEach(node) { node.playing && nodesInView.push(node); });
		this.addedNodes = nodesInView.filter(node => this.nodesInView.indexOf(node) == -1);
		this.removedNodes = this.nodesInView.filter(node => nodesInView.indexOf(node) == -1);
		this.updatedNodes = nodesInView.filter(node => node.updated);
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
	draw() {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.beginPath();
		ctx.arc(0, 0, this.r, 0, Math.PI * 2);
		ctx.closePath();
		ctx.fillStyle = "hsl("+this.hue+", 100%, 46%)";
		ctx.strokeStyle = "hsl("+this.hue+", 100%, 38%)";
		ctx.lineWidth = 5;
		ctx.fill();
		ctx.stroke();
		if (this.nicknameText == null) this.nicknameText = new Text();
		if (this.nickname && this.nicknameText.text != this.nickname) {
			this.nicknameText.setStyle("#fff", "#333", 3);
			this.nicknameText.setText(this.nickname);
			this.nicknameText.render();
		}
		if (this.nicknameText) ctx.drawImage(this.nicknameText.canvas, -this.nicknameText.width/2, -this.nicknameText.height/2);
		ctx.restore();
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

/* 
		           ...[```````[  END  ]``````]...
	<================= COMMON NETWORKING CODE ==================>
		........======________________________======.........
*/ 

let latency = 0,
	latencyCheckTime = 0,
	lastTime = 0,
	throughput = 0,
	timestamp = 0,
	gameSize = 0,
	screenNodeId = null,
	oldWsUrl = null,
	reconnect = null,
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
	lbNames = [],
	animDelay = 120,
	qt = new QuadTree(0, 0, 0, 0),
	ws = null,
	nodeX = 0,
	nodeY = 0,
	numAddedNodes = 0,
	numUpdatedNodes = 0,
	numRemovedNodes = 0,
	nicknameInput = document.getElementById("nicknameInput"),
	playButton = document.getElementById("playButton"),
	mainOverlay = document.getElementById("mainOverlay"),
	gameCanvas = document.getElementById("gameCanvas"),
	ctx = gameCanvas.getContext("2d"),
	gridCanvas = document.createElement("canvas"),
	lbCanvas = document.createElement("canvas"),
	msgCanvas = document.createElement("canvas"),
	logCanvas = document.createElement("canvas"),
	regionSelect = document.getElementById("regionSelect"),
	settingButton = document.getElementById("settingButton"),
	settingDiv = document.getElementById("settingDiv"),
	showLogsCb = document.getElementById("showLogsCb"),
	showQtCb = document.getElementById("showQtCb"),
	animDelayRange = document.getElementById("animDelayRange"),
	animDelayValue = document.getElementById("animDelayValue"),
	animWithTimeCb = document.getElementById("animWithTimeCb");

function showEle(ele) {
	ele.style.display = "block";
}

function hideEle(ele) {
	ele.style.display = "none";
}

function toggleEle(ele) {
	if (ele.getBoundingClientRect().height > 0) hideEle(ele);
	else showEle(ele);
}

settingButton.onclick = function () {
	toggleEle(settingDiv);
}

animDelayRange.onchange = animDelayRange.oninput = function () {
	animDelay = animDelayRange.value;
	animDelayValue.innerText = animDelay;
}

regionSelect.onchange = function () {
	playButton.disabled = false;
	showEle(playButton.children[0]);
	hideEle(playButton.children[1]);
	hideEle(playButton.children[2]);
}

window.onload = function() {
	onResize();
	playButton.onclick = play;
	gameLoop();
}
