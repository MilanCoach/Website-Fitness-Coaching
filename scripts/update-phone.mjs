import { copyFile } from "node:fs/promises";
await copyFile(new URL("../node_modules/libphonenumber-js/bundle/libphonenumber-max.js", import.meta.url), new URL("../assets/vendor/libphonenumber-max.js", import.meta.url));
await copyFile(new URL("../node_modules/libphonenumber-js/LICENSE", import.meta.url), new URL("../assets/vendor/libphonenumber-LICENSE.txt", import.meta.url));
console.log("Phone metadata updated from the installed libphonenumber-js package.");
