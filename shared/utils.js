

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
	view.setUint8(offset++, 0);
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
		this.oldSize = this.newSize = this.size = r;
		this.updateTime = 0;
		this.mouseX = 0;
		this.mouseY = 0;
		this.addedNodes = [];
		this.removedNodes = [];
		this.updatedNodes = [];
		this.nodesInView = [];
		this.nicknameText = null;
		this.isPlaying = !false;
		this.isPlayer = false;
		this.isFood = false;
		this.isBot = false;
		this.killerNodeId = null;
		this.killedNodes = [];
		this.isSpectating = false;
		this.boostX = 0;
		this.boostY = 0;
		this.points = [];
	}
	updatePoints() {
		let numPoints = this.r;
		numPoints *= viewScale * 1.1;
		numPoints = Math.round(numPoints);
		numPoints = Math.max(numPoints, 8);
		while(this.points.length > numPoints) {
			let i = Math.floor(Math.random() * this.points.length)
			this.points.splice(i, 1);
		}
		while(this.points.length < numPoints) {
			this.points.splice(Math.floor(Math.random() * this.points.length), 0, {
				x: 0, 
				y: 0, 
				r: this.r,
				v: Math.random() - 0.5
			});
		}
		this.points.forEach((point, i) => {
			let prev = this.points[i-1] || this.points[numPoints-1];
			let next = this.points[i+1] || this.points[0];
			let v = point.v;
			v += Math.random() - 0.5;
			v *= 0.6;
			v = Math.max(-10, Math.min(v, 10));
			point.v = (v * 8 + prev.v + next.v) / 10;
			let f = point.r;
			let x = this.x + point.x;
			let y = this.y + point.y;
			if (this.r > 15) {
				let c = false;
				if (x < 0 || x > gameSize || y < 0 || y > gameSize) c = true;
				qt.query2(x, y, node => {
					if (Math.hypot(x - node.x, y - node.y) < node.r && node != this) c = true;
				});
				if (c) point.v -= 1;
			}
			f += point.v;
			f = (f * 8 + this.r * 2) / 10;
			f = (f * 8 + prev.r + next.r) / 10;
			point.r = f;
			point.x = Math.cos(i / numPoints * 2 * Math.PI) * f;
			point.y = Math.sin(i / numPoints * 2 * Math.PI) * f;
		});
	}
	updatePos() {
		if (animDelay == 0) {
			this.x = this.newX;
			this.y = this.newY;
			this.r = this.newSize;
		} else {
			let dt = Math.max(0, Math.min((timestamp - this.updateTime) / animDelay, 1));
			this.x = this.oldX + (this.newX - this.oldX) * dt;
			this.y = this.oldY + (this.newY - this.oldY) * dt;
			this.r = this.oldSize + (this.newSize - this.oldSize) * dt;
		}
	}
	setBoost(x, y) {
		this.boostX = x;
		this.boostY = y;
	}
	move() {
		let d = Math.hypot(this.mouseX, this.mouseY) || 1;
		let speed = 1 / (1 + Math.pow(0.5 * this.r, 0.43)) * 1.28 * 60; 
		this.x += this.mouseX / d * speed;
		this.y += this.mouseY / d * speed;
		this.x += this.boostX;
		this.y += this.boostY;
		this.boostX *= 0.95;
		this.boostY *= 0.95;
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
	getScale() {
		return 1 / Math.pow(Math.min(64 / this.r, 1), 0.4)
	}
	updateViewNodes() {
		let nodesInView = [];
		let scale = this.getScale();
		qt.query({ 
			x: this.x - 1920 / 2 * scale,
			y: this.y - 1080 / 2 * scale,
			w: 1920 * scale,
			h: 1080 * scale
		}, function forEach(node) { node.isPlaying && nodesInView.push(node); });
		this.addedNodes = nodesInView.filter(node => this.nodesInView.indexOf(node) == -1);
		this.updatedNodes = nodesInView.filter(node => node.hasUpdated);
		let allRemovedNodes = this.removedNodes = this.nodesInView.filter(node => nodesInView.indexOf(node) == -1);
		this.killedNodes = allRemovedNodes.filter(node => node.killerNodeId);
		this.removedNodes = allRemovedNodes.filter(node => this.killedNodes.indexOf(node) == -1);
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
			1+2*4+
			this.killedNodes.length*(4+4)+
			this.addedNodes.length*(4+2+2+2+1)+
			nicknameBytes+
			this.updatedNodes.length*(4+2+2+2)+
			this.removedNodes.length*4
		);
		let offset = 0;
		view.setUint8(offset++, 10);

		view.setUint16(offset, this.killedNodes.length);
		offset += 2;
		this.killedNodes.forEach(node => {
			view.setFloat32(offset, node.id);
			offset += 4;
			view.setFloat32(offset, node.killerNodeId);
			offset += 4;
		})

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
		let w = canvasWidth / 2 * 1 / viewScale;
		let h = canvasHeight / 2 * 1 / viewScale; 
		if (this.x + this.r - nodeX < -w || this.x - this.r - nodeX > w || 
			this.y + this.r - nodeY < -h || this.y - this.r - nodeY > h) return "false dont draw pls";
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.beginPath();
		if (showBorderCb.checked && viewScale > 0.53) {
			this.updatePoints();
			this.points.forEach(point => ctx.lineTo(point.x, point.y));
		} else ctx.arc(0, 0, this.r, 0, Math.PI * 2);
		ctx.closePath();
		ctx.fillStyle = "hsl("+this.hue+", 100%, 46%)";
		ctx.strokeStyle = "hsl("+this.hue+", 100%, 38%)";
		ctx.lineWidth = this.r < 10 ? 2 : 4;
		ctx.fill();
		ctx.stroke();
		if (this.nickname != "" && this.nicknameText == null) this.nicknameText = new Text();
		if (this.nicknameText) {
			let fontSize = Math.round(this.newSize * 0.34);
			fontSize = Math.max(20, fontSize);
			let lw = 3;
			if (this.nicknameText.text != this.nickname || Math.abs(this.nicknameText.fontSize - fontSize) > 0) {
				this.nicknameText.setText(this.nickname);
				this.nicknameText.setFont("bolder " + fontSize + "px Arial");
				this.nicknameText.setStyle("#fff", "#333", lw);
				this.nicknameText.render();
			}
			ctx.drawImage(this.nicknameText.canvas, -this.nicknameText.width/2, -this.nicknameText.height/2);
		}
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
	query2(x, y, func) {
		if (this.nodes.length > 0) {
			this.nodes[this.findNodeId(x, y)].query2(x, y, func);
		} else {
			for (let i = 0; i < this.items.length; i++) func(this.items[i]);
		}
	}
	draw(showItems) {
		if (this.nodes.length > 0) {
			for (let i = 0; i < this.nodes.length; i++) this.nodes[i].draw(showItems);
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
			ctx.strokeStyle = "#333";
			ctx.lineWidth = 1;
			ctx.strokeRect(this.x, this.y, this.w, this.h);
			if (!showItems) return;
			ctx.fillStyle = "red";
			for (let j = 0; j < this.items.length; j++) {
				ctx.beginPath();
				ctx.arc(this.items[j].x, this.items[j].y, 3, 0, Math.PI * 2);
				ctx.closePath();
				ctx.fill();
			}
		}
	}
} 

(function() {
	if (typeof module != "undefined" && typeof module.exports == "object") {
		module.exports = {
			Circle, 
			QuadTree,
			prepareMsg, 
			prepareData,
			isWsOpen,
			sendMsg, 
			sendString,
			sendUint8,
			sendFloat32,
			sendInt16,
			writeString
		};
	}
})();