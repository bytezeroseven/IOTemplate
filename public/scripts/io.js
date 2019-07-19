

let nicknameInput = document.getElementById("nicknameInput"),
	playButton = document.getElementById("playButton"),
	main = document.querySelector(".main"),
	overlay = document.getElementById("overlay"),
	header = document.querySelector("header"),
	footer = document.querySelector("footer"),
	gameCanvas = document.getElementById("gameCanvas");

function showCanvas() {
	gameCanvas.style.zIndex = 999;
}
function hideCanvas() {
	gameCanvas.style.zIndex = -1;
}

function animate() {
	let str = "";
	for (let i = 0; i < arguments.length; i++) 
		(str += arguments[i] + (i == arguments.length-1 ? "" : ","));
	this.style.animation = str;
}
HTMLElement.prototype.animate = animate;

function hide() {
	header.animate("go-up 0.5s ease-out forwards", "fade-out 0.5s linear forwards");
	footer.animate("come-down 0.2s linear forwards");
	main.animate("fade-out 0.3s linear forwards");
	setTimeout(function after() {
		overlay.animate("fade-out 0.3s linear forwards");
		setTimeout(showCanvas, 0.3E3);
	}, 0.5E3);
}
function show() {
	hideCanvas();
	overlay.animate("fade-in 0.3s linear forwards");
	setTimeout(function after() {
		header.animate("go-down 0.6s ease-out forwards", "fade-in 0.8s linear forwards");
		footer.animate("come-up 0.2s linear forwards");
		main.animate("fade-in 1.2s linear forwards");
	}, 0.3E3);
}

playButton.onclick = function play() {
	hide();
}

function onKeyDown(evt) {
	console.log(evt.keyCode);
	if (evt.keyCode == 27) {
		show();
	}
}

document.onkeydown = onKeyDown;

window.onload = function onLoad() {
	function splash() {
		header.animate("go-down 1.8s ease-out forwards", "fade-in 0.8s linear forwards");
		footer.animate("come-up 1.8s ease-out forwards");
		main.animate("fade-in 1.2s linear forwards");
	}
	splash();
}

class Player {
	constructor() {
		this.x = width / 2;
		this.y = height / 2;
	}
	draw() {
		ctx.beginPath();
		ctx.arc(this.x, this.y, 40, 0, Math.PI * 2);
		ctx.closePath();
		ctx.fillStyle = "red";
		ctx.strokeStyle = "black";
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.fill();
	}
}

let width = 1920;
let height = 1080;

let player = new Player();


gameCanvas.width = width;
gameCanvas.height = height;

let gridCanvas = document.createElement("canvas"),
	lbCanvas = document.createElement("canvas"),
	msgCanvas = document.createElement("canvas");

function renderGrid(size) {
	gridCanvas.width = size;
	gridCanvas.height = size;
	let ctx = gridCanvas.getContext("2d");
	ctx.fillStyle = "#b1b1b1";
	ctx.fillRect(0, size / 2, size, 2);
	ctx.fillRect(size / 2, 0, 2, size);
}

let msgs = [];
function addMsg(args) {
	ctx.font = "bolder 20px arial";
	let msg = document.createElement("canvas");
	msg.width = ctx.measureText(args.text).width+6;
	msg.height = 20+6;
	let msgCtx = msg.getContext("2d");
	msgCtx.globalAlpha = 0.4;
	msgCtx.fillStyle = args.bgColor;
	msgCtx.fillRect(0, 0, ctx.measureText(args.text).width+6, 20+6);
	msgCtx.globalAlpha = 1;
	msgCtx.font = "bolder 20px arial";
	msgCtx.textBaseline = "top";
	msgCtx.textAlign = "left";
	msgCtx.fillStyle = "#fff";
	msgCtx.strokeStyle = "#222";
	msgCtx.lineWidth = 2;
	msgCtx.strokeText(args.text, 2, 2)
	msgCtx.fillText(args.text, 2, 2);
	let time = Date.now();
	msgs.unshift({
		msg: msg,
		expireTime: time+args.duration,
		duration: args.duration,
		time: time,
	});
}

function renderMsg() {
	let time = Date.now();
	let ctx = msgCanvas.getContext("2d");
	msgCanvas.width = 500;
	msgCanvas.height = height;
	for (let i = 0, y = 0; i < msgs.length; i++) {
		let msg = msgs[i];
		let dt = msg.expireTime - time;
		if (dt < 0) msgs.splice(i, 1);
		let f = 1;
		dt < 200 && (f = dt / 200);
		dt > msg.duration - 200 && (f = (msg.duration - dt) / 200)
		ctx.save();
		ctx.translate(msg.msg.width / 2, y + msg.msg.height / 2);
		ctx.scale(f, f);
		ctx.drawImage(msg.msg, -msg.msg.width / 2, -msg.msg.height / 2);
		ctx.restore();	
		y += msg.msg.height+4;
	}
}

gameCanvas.onclick = function () {
	let txt = "";
	while(txt.length < 19) txt += String.fromCharCode(40+~~(Math.random() * 100));
	addMsg({
		text: txt,
		duration: 6000,
		bgColor: Math.random() > 0.3 ? "black" : "red"
	});
}

let ctx = gameCanvas.getContext("2d");

function gameLoop() {
	ctx.fillStyle = "#bbb"
	ctx.fillRect(0, 0, width, height);

	renderGrid(26);
	ctx.fillStyle = ctx.createPattern(gridCanvas, "repeat");
	ctx.fillRect(0, 0, width, height);

	player.draw();

	renderMsg();
	ctx.drawImage(msgCanvas, 10, 10);

	requestAnimationFrame(gameLoop);
}

gameLoop();