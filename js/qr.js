(function () {
  const box = document.getElementById("qrBox");
  const urlEl = document.getElementById("qrUrl");

  // آدرس منوی مشتری — بعد از آپلود سایت، همین صفحه را باز کنید تا QR درست شود
  const menuUrl = new URL("index.html", window.location.href).href;

  urlEl.textContent = menuUrl;

  if (typeof QRCode === "undefined") {
    box.innerHTML = "<p>بارگذاری QR ناموفق بود. آدرس منو را دستی چاپ کنید.</p>";
    return;
  }

  QRCode.toCanvas(
    menuUrl,
    {
      width: 220,
      margin: 1,
      color: { dark: "#1a2218", light: "#ffffff" },
    },
    function (err, canvas) {
      if (err) {
        box.textContent = "خطا در ساخت QR";
        return;
      }
      box.innerHTML = "";
      box.appendChild(canvas);
    }
  );
})();
