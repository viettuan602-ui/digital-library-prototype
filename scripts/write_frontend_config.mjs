import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const apiBaseUrl = process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");

if (!apiBaseUrl || !apiBaseUrl.startsWith("https://")) {
    throw new Error("Set PUBLIC_API_BASE_URL to the HTTPS URL of the deployed FastAPI service.");
}

const outputPath = fileURLToPath(new URL("../Frontend/js/api.config.js", import.meta.url));
await writeFile(
    outputPath,
    `// Generated for this Netlify deploy. Do not add secrets to this file.\nwindow.DIGITAL_LIBRARY_API_URL = ${JSON.stringify(apiBaseUrl)};\n`,
    "utf8"
);
console.log(`Configured frontend API URL: ${apiBaseUrl}`);
