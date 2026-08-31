const sharp = require("sharp");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "img", "logo-src.jpg");
const out = path.join(root, "img", "logo.png");

/** همه‌ی پیکسل‌های کرم/سفید → شفاف */
function creamAlpha(r, g, b) {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;

  // سفید / کرم روشن
  if (brightness >= 232 && chroma <= 35) return 0;
  if (brightness >= 218 && chroma <= 28 && b <= g + 5 && b <= r + 5) return 0;

  // لبه‌های نیمه‌کرم (آنتی‌الیاس)
  if (brightness >= 200 && chroma <= 40 && b <= r + 8 && b <= g + 8) {
    const t = (brightness - 200) / 32;
    return Math.round(255 * (1 - Math.min(1, Math.max(0, t))));
  }

  return 255;
}

async function main() {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    data[i + 3] = creamAlpha(data[i], data[i + 1], data[i + 2]);
  }

  await sharp(data, { raw: { width: w, height: h, channels } })
    .trim()
    .png()
    .toFile(out);

  const check = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: d, info: inf } = check;
  const mid = (Math.floor(inf.height / 2) * inf.width + Math.floor(inf.width / 2)) * 4;
  let transparent = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 16) transparent++;
  console.log("Wrote", out, inf.width + "x" + inf.height);
  console.log("center alpha", d[mid + 3]);
  console.log(
    "transparent %",
    ((100 * transparent) / (inf.width * inf.height)).toFixed(1)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
