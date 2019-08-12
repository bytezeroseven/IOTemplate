


function onResize() {
	canvasWidth = innerWidth;
	canvasHeight = innerHeight;
	gameCanvas.width = canvasWidth;
	gameCanvas.height = canvasHeight;
	scale = Math.min(
		innerWidth / width, 
		innerHeight / height
	);
	mainOverlay.style.width = innerWidth / scale + "px";
	mainOverlay.style.height = innerHeight / scale + "px";
	mainOverlay.style.transform = "translate(-50%, -50%) scale(" + scale + ") translate(50%, 50%)";
}

function onKeyUp(evt) {
	if (evt.keyCode == 27) {
		if (!isHidden(settingOverlay)) hideEle(settingOverlay)
		else toggleEle(mainOverlay);
	}
	if (evt.key.toLowerCase() == "j") sendUint8(ws, 255);
	if (evt.key == "w") sendUint8(ws, 55);
}

function onKeyDown(evt) {
	
}

function onMouseMove(evt) {
	if (evt.target == gameCanvas) {
		mouseX = evt.clientX;
		mouseY = evt.clientY;
		sendMousePos();
	}
}

function onMouseWheel(evt) {
	if (evt.target != gameCanvas) return;
	let zoomSpeed = 0.1;
	if (evt.deltaY <= -100) viewScale *= 1 + zoomSpeed;
	else if(evt.deltaY >= 100) viewScale *= 1 - zoomSpeed;
}

function onClick(evt) { 
	if (evt.target == mainOverlay) hideEle(mainOverlay);
	if (evt.target == settingOverlay) hideEle(settingOverlay);
}

document.onmousemove = onMouseMove;
document.onkeyup = onKeyUp;
document.onkeydown = onKeyDown;
document.onclick = onClick;
document.onmousewheel = onMouseWheel;
window.onresize = onResize;

function addNode(node) {
	nodes.push(node);
}

function removeNode(node) {
	let index = nodes.indexOf(node);
	if (index > -1) nodes.splice(index, 1);
}

function onWsOpen() {
	console.log("Connected!");
	checkLatency();
	hideEle(connecting);
	playButton.disabled = false;
	addMsg({ 
		text: "WebSocket open", 
		bg: "blue", 
		duration: 10E3
	});
}

function onWsClose() {
	console.log("Disconnected. Reconnecting in " + reconnectInterval + "ms...");
	reconnect = setTimeout(function () { wsConnect(oldWsUrl); }, reconnectInterval);
	addMsg({ 
		text: "WebSocket closed", 
		bg: "red", 
		duration: 10E3
	});
}

function onWsMessage(msg) {
	let blob = msg.data;
	let fileReader = new FileReader();
	fileReader.onload = function(evt) {
		let arrayBuffer = evt.target.result;
		let view = new DataView(arrayBuffer);
		throughput += view.byteLength;
		handleWsMessage(view);
	}
	fileReader.readAsArrayBuffer(blob);
}

function wsConnect(wsUrl) {
	if (wsUrl == "#") wsUrl = location.origin;
	console.log("Connecting to " + wsUrl + "...");
	oldWsUrl = wsUrl;
	clearTimeout(reconnect);
	reconnect = null;
	urlSpan.innerHTML = wsUrl;
	showEle(connecting);
	playButton.disabled = true;
	if (ws) {
		ws.onmessage = null;
		ws.onopen = null;
		ws.onclose = null;
		ws.onerror = null;
		ws.close();
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
	screenNodeId = null;
	gameSize = 0;
	latencyCheckTime = 0;
	lastTime = 0;
	msgs = [];
	logs = [];
	lbNames = [];
}

function spectate() {
	sendUint8(ws, 69);
}

function handleWsMessage(view) {
	function getString() {
		let str = new String();
		while ((code = view.getUint8(offset++)) != 0) {
			str += String.fromCharCode(code);
		}
		return str;
	}
	let offset = 0;
	switch (view.getUint8(offset++)) {
		case 10: 
			let nodeId, 
				posX, 
				posY, 
				size;
			let n = 0;
			function readCommonData() {
				nodeId = view.getFloat32(offset); 
				offset += 4;
				posX = view.getInt16(offset); 
				offset += 2;
				posY = view.getInt16(offset); 
				offset += 2;
				size = view.getInt16(offset); 
				offset += 2;
			}
			let queueLength = view.getUint16(offset);
			n += queueLength;
			offset += 2;
			for (let i = 0; i < queueLength; i++) {
				let killedNodeId = view.getFloat32(offset);
				offset += 4;
				let killerNodeId = view.getFloat32(offset);
				offset += 4;
				let node = nodes.find(node => node.id == killedNodeId);
				let killerNode = nodes.find(node => node.id == killerNodeId);
				if (node && killerNode) {
					node.updateTime = timestamp;
					node.oldX = node.x;
					node.oldY = node.y;
					let x = node.x - killerNode.x;
					let y = node.y - killerNode.y;
					let d = Math.hypot(x, y);
					let r = (killerNode.newSize - node.newSize*2);
					node.newX = killerNode.x + r * x / d;
					node.newY = killerNode.y + r * y / d;
					node.oldSize = node.r;
					node.newSize = 0 * node.newSize / 2;
					setTimeout(function() {
						removeNode(node);
					}, animDelay);
				} else {
					removeNode(node);
				}
			}
			numAddedNodes = view.getUint16(offset); 
			offset += 2;
			for (let i = 0; i < numAddedNodes; i++) {
				readCommonData();
				let hue = view.getUint8(offset++),
					nickname = getString(),
					node = new Circle(posX, posY, size);
				node.id = nodeId;
				node.hue = hue;
				node.nickname = nickname;
				addNode(node);
			}
			numUpdatedNodes = view.getUint16(offset); 
			offset += 2;
			for (let i = 0; i < numUpdatedNodes; i++) {
				readCommonData();
				let node = nodes.find(node => node.id == nodeId);
				if (node) {
					node.updateTime = timestamp;
					node.oldX = node.x;
					node.oldY = node.y;
					node.oldSize = node.r;
					node.newX = posX;
					node.newY = posY;
					node.newSize = size;
				}
			}
			numRemovedNodes = view.getUint16(offset);
			offset += 2;
			for (let i = 0; i < numRemovedNodes; i++) {
				nodeId = view.getFloat32(offset); 
				offset += 4;
				let node = nodes.find(node => node.id == nodeId);
				removeNode(node);
			}
			addLog({
				index: 2,
				text: numAddedNodes+"/"+numUpdatedNodes+"/"+numRemovedNodes+n+" (add/update/remove)",
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
			break;
		case 13: 
			screenNodeId = view.getFloat32(offset);
			break;
		case 23: 
			addMsg({
				text: getString(),
				duration: 6000,
				bg: "blue"
			});
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

function renderLogs() {
	logCanvas.width = logs.map(a => a.width).sort((a,b) => b-a)[0];
	logCanvas.height = logs.map(a => a.height).reduce((a, b) => a+b) + 2*logs.length;
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
	let now = +Date.now();
	fps = 1000 / (now - timestamp);
	timestamp = now;

	qt = new QuadTree(0, 0, gameSize, gameSize);

	nodes.forEach(function(node) {
		node.updatePos();
		qt.insert(node)
	});

	let node = nodes.find(node => node.id == screenNodeId);
	if (node) {
		nodeX = node.x;
		nodeY = node.y;
		let s = 1/node.getScale();
		viewScale = Math.min(2, Math.max(s, viewScale));
		if (viewScale == oldViewScale) {
			viewScale = s;
		}
		oldViewScale = s;
	}

	ctx.fillStyle = "#bbb";
	ctx.fillRect(0, 0, canvasWidth, canvasHeight);

	ctx.save();
	ctx.translate(canvasWidth / 2, canvasHeight / 2);
	ctx.scale(viewScale, viewScale);
	ctx.translate(-nodeX, -nodeY);

	ctx.fillStyle = ctx.createPattern(gridCanvas, "repeat");
	ctx.fillRect(
		-(canvasWidth / 2) / viewScale + nodeX, 
		-(canvasHeight / 2) / viewScale + nodeY, 
		canvasWidth / viewScale, 
		canvasHeight / viewScale
	);

	if (showQtCb.checked) qt.draw();

	let viewNodes = []
	qt.query({ x: nodeX - width/2 / viewScale, y: nodeY-height/2 / viewScale, w: width / viewScale, h: height / viewScale}, function(n) {
		viewNodes.push(n);
	})

	viewNodes.sort((a, b) => {
		let x = a.r - b.r;
		return x == 0 ? a.id - b.id : x;
	}).forEach(node => node.draw());

	ctx.restore();

	renderMsgs();
	ctx.drawImage(msgCanvas, 10, 10);

	if (timestamp - lastTime > 1000) {
		let text = throughput;
		text > 1024 ? text = (text/1024).toFixed(2)+"k": 0;
		text += "B/s"
		addLog({ 
			text: "Throughput: "+text, 
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

let latency = 0,
	latencyCheckTime = 0,
	lastTime = 0,
	throughput = 0,
	timestamp = 0,
	gameSize = 0,
	screenNodeId = null,
	oldWsUrl = null,
	reconnect = null,
	reconnectInterval = 2E3,
	nodes = [],
	mouseX = 0,
	mouseY = 0,
	width = 1600,
	height = 900,
	viewScale = 1,
	scale = 1,
	fps = 0,
	b = 1,
	oldViewScale = 1,
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
	gameCanvas = document.getElementById("gameCanvas"),
	ctx = gameCanvas.getContext("2d"),
	lbCanvas = document.createElement("canvas"),
	msgCanvas = document.createElement("canvas"),
	logCanvas = document.createElement("canvas"),
	gridCanvas = document.createElement("canvas"),
	nicknameInput = document.getElementById("nicknameInput"),
	playButton = document.getElementById("playButton"),
	mainOverlay = document.getElementById("mainOverlay"),
	mainLayout = document.getElementById("mainLayout"),
	connecting = document.getElementById("connecting"),
	urlSpan = document.getElementById("urlSpan"),
	regionSelect = document.getElementById("regionSelect"),
	settingButton = document.getElementById("settingButton"),
	settingDiv = document.getElementById("settingDiv"),
	showLogsCb = document.getElementById("showLogsCb"),
	showQtCb = document.getElementById("showQtCb"),
	showBorderCb = document.getElementById("showBorderCb"),
	animDelayRange = document.getElementById("animDelayRange"),
	animDelaySpan = document.getElementById("animDelaySpan"),
	urlInput = document.getElementById("urlInput"),
	connectButton = document.getElementById("connectButton"),
	settingOverlay = document.getElementById("settingOverlay");

function showEle(ele) {
	ele.style.display = "block";
}

function hideEle(ele) {
	ele.style.display = "none";
}

function isHidden(ele) {
	return ele.getBoundingClientRect().height == 0;
}

function toggleEle(ele) {
	if (!isHidden(ele)) hideEle(ele);
	else showEle(ele);
}

connectButton.onclick = function () {
	wsConnect(urlInput.value);
}

settingButton.onclick = function () {
	toggleEle(settingOverlay);
}

animDelayRange.oninput = function () {
	animDelay = parseInt(animDelayRange.value);
	animDelaySpan.innerText = animDelay;
}
animDelayRange.value = 120;
animDelayRange.oninput();

regionSelect.onchange = function (evt) {
	wsConnect(evt.target.value);
}

playButton.onclick = function () {
	sendNickname();
	hideEle(mainOverlay);
}

window.onload = function() {
	onResize();
	renderGrid(26);
	gameLoop();
	wsConnect(regionSelect.selectedOptions[0].value);
}
