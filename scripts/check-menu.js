const fs = require("fs");
const s = fs.readFileSync("js/menu-data.js", "utf8");
console.log(s.slice(0, 450));
console.log(s.match(/icon: "[^"]+"/g));
