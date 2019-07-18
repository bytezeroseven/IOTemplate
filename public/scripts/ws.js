let ws;

function onWsOpen() {
	console.log("WebSocket open.");
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
		// Handle messages...
	}
}

function onWsClose() {
	console.log("WebSocket closed.")
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