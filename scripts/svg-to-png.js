const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "img", "icons");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));

(async () => {
  for (const file of files) {
    const svgPath = path.join(dir, file);
    const pngPath = path.join(dir, file.replace(/\.svg$/, ".png"));
    // ساده‌سازی: فیلترها گاهی در img خراب می‌شوند — PNG مطمئن‌تر است
    let svg = fs.readFileSync(svgPath, "utf8");
    svg = svg.replace(/<filter[\s\S]*?<\/filter>/g, "");
    svg = svg.replace(/\sfilter="url\(#s\)"/g, "");
    svg = svg.replace(/<!--[\s\S]*?-->/g, "");
    await sharp(Buffer.from(svg))
      .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(pngPath);
    console.log("wrote", path.basename(pngPath));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
