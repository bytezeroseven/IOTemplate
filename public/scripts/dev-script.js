function addImg() {
	numImgs += 1;
	let img = document.createElement("img");
	img.src = "./images/dev.png";
	img.style.imageRendering = "pixelated";
	img.style.position = "absolute";
	img.style.top = Math.random() * innerHeight - 50 + "px";
	img.style.left = Math.random() * innerWidth - 50 + "px";
	img.style.width = Math.random() * 50 + 50 + "px";
	img.style.cursor = "not-allowed"
	document.body.appendChild(img);
	dev.addEventListener("click", () => numImgs < 2048 && addImg());
	img.onclick = () => document.body.removeChild(img) && (numImgs -= 1);
}

let dev = document.getElementById("dev");
let numImgs = 0;

dev.onclick = function () {
	addImg();
	dev.onclick = null;
}