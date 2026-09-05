(function () {
  const box = document.getElementById("qrBox");
  const urlEl = document.getElementById("qrUrl");

  // آدرس ثابت منوی مشتری برای چاپ روی میز
  const menuUrl = "https://gaff-cafe.onrender.com/";

  urlEl.textContent = menuUrl;

  if (typeof QRCode === "undefined") {
    box.innerHTML =
      '<img src="img/gaff-menu-qr.png" alt="QR منوی کافه گاف" width="220" height="220" />';
    return;
  }

  QRCode.toCanvas(
    menuUrl,
    {
      width: 280,
      margin: 2,
      color: { dark: "#1a2218", light: "#ffffff" },
      errorCorrectionLevel: "M",
    },
    function (err, canvas) {
      if (err) {
        box.innerHTML =
          '<img src="img/gaff-menu-qr.png" alt="QR منوی کافه گاف" width="220" height="220" />';
        return;
      }
      box.innerHTML = "";
      box.appendChild(canvas);
    }
  );
})();
