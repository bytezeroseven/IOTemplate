let ws;

function onWsOpen() {
	console.log("WebSocket opens.");
	let view = prepareMsg(1);
	view.setUint8(0, 42); 
	sendMsg(view);
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

function handleWsMessage(view) {
	function getString() {
		let str = new String();
		while ((char = view.getUint8(offset++)) != 0) {
			str += String.fromCharCode(char);
		}
		return str;
	}

	let offset = 0;
	switch (view.getUint8(offset++)) {
		case 42: 
			console.log("Client->Server->Client signalling complete.");
			break;
		case 23:
			let str = getString();
			console.log("The server says:", str);
			showMsg(str)
			break;
	}
}

function onWsClose() {
	console.log("WebSocket closes.")
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

function prepareMsg(byteLength) {
	return new DataView(new ArrayBuffer(byteLength))
}
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

function send10(fname, lname, nickname) {
	let view = prepareMsg(1+3+fname.length+lname.length+nickname.length+1);
	let offset = 0;
	view.setUint8(offset++, 10);
	offset = prepareString(view, offset, fname);
	offset = prepareString(view, offset, lname);
	offset = prepareString(view, offset, nickname);
	view.setUint8(offset, Math.floor(Math.random() * 256));
	sendMsg(view);
}

document.getElementById("wsConnect").onclick = function() { wsConnect(); }


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class Text {
	constructor(text) {
		this.canvas = document.createElement("canvas");
		this.setText(text);
		this.setFont("bold 14px arial");
		this.setFill("#fff");
		this.setStroke("#333");
		this.setLineWidth(3);
	}
	setText(text) {
		this.text = text;
	}
	setFont(font) {
		this.font = font;
		this.fontSize = parseInt(font.replace(/[^0-9]/g, ""));
	}
	setStroke(strokeColor) {
		this.strokeColor = strokeColor;
	}
	setFill(fillColor) {
		this.fillColor = fillColor;
	}
	setLineWidth(lw) {
		this.lineWidth = lw;
	}
	render() {
		let ctx = this.canvas.getContext("2d");
		ctx.font = this.font;
		this.width = ctx.measureText(this.text).width + this.lineWidth * 2;
		this.height = this.fontSize + this.lineWidth*2;
		this.canvas.width = this.width;
		this.canvas.height = this.height;

		ctx.textBaseline = "top";
		ctx.textAlign = "left";
		ctx.font = this.font;
		ctx.strokeStyle = this.strokeColor;
		ctx.lineWidth = this.lineWidth;
		ctx.fillStyle = this.fillColor;
		if(this.strokeColor) {
		    ctx.strokeText(this.text, this.lineWidth, this.lineWidth);
		}
		ctx.fillText(this.text, this.lineWidth, this.lineWidth);
		return this.canvas;
	}
}

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let timeStamp = 0;
let msgs = [];
function showMsg(msg) {
	let text = new Text(msg);
	text.render();
	msgs.push({ text, timeStamp, duration: 10000 });
}

function drawMsgs() {
	ctx.save();
	ctx.translate(5, 5);
	let y = 0;
	for (let i = 0; i < msgs.length; i++) {
		let msg = msgs[i],
			elapsedTime = timeStamp - msg.timeStamp,
			duration = msg.duration;
		ctx.fillStyle = "#000";
		ctx.globalAlpha = 0.4;
		ctx.save();
		ctx.translate(0, y+i*5);

		let animTime = 200;
		elapsedTime < animTime && (
			f = 1 - (animTime - elapsedTime) / animTime,
			ctx.scale(f, f))
		elapsedTime > duration && msgs.splice(i, 1);
		elapsedTime > duration - animTime && (
			f = (duration - elapsedTime) / animTime,
			ctx.scale(f, f));
		ctx.fillRect(0, 0, msg.text.width, msg.text.height);
		ctx.globalAlpha = 1;
		ctx.drawImage(msg.text.canvas, 0, 0);
		ctx.restore();
		y += msg.text.height;
	}
	ctx.restore();	
}

function loop() {
	timeStamp = Date.now();

	ctx.fillStyle = "#ddd";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	drawMsgs();
	
	requestAnimationFrame(loop);
}

loop();