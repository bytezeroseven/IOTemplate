
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

module.exports = {
	sendMsg, 
	sendUint8,
	sendFloat32,
	sendString,
	prepareMsg,
	prepareData
}