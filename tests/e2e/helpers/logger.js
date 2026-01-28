import fs from "node:fs";
import path from "node:path";

let logFilePath = null;
let logInitialized = false;

function ensureLogFile() {
  if (logInitialized) return logFilePath;
  const logDir = path.join(process.cwd(), "logs", "playwright");
  fs.mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  logFilePath = path.join(logDir, `steps-${timestamp}.log`);
  fs.appendFileSync(logFilePath, `Playwright steps log: ${new Date().toISOString()}\n`);
  logInitialized = true;
  return logFilePath;
}

export function logStep(message, testInfo = null) {
  ensureLogFile();
  const prefix = testInfo?.title ? `[${testInfo.title}] ` : "";
  const line = `${new Date().toISOString()} ${prefix}${message}`;
  console.log(line);
  fs.appendFileSync(logFilePath, `${line}\n`);
}

function stripDom(html, maxLength) {
  if (!html) return "";
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/data:[^"')\s]+/gi, "data:[omitted]");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength)}…(truncated)`;
  }
  return cleaned;
}

export async function logDomSnapshot(page, label = "DOM snapshot", testInfo = null, maxLength = 6000) {
  ensureLogFile();
  try {
    const snapshot = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      html: document.body ? document.body.innerHTML : "",
    }));
    const header = `${label} (${snapshot.url})`;
    logStep(header, testInfo);
    const stripped = stripDom(snapshot.html, maxLength);
    if (stripped) {
      fs.appendFileSync(logFilePath, `${stripped}\n`);
      console.log(stripped);
    } else {
      logStep("DOM snapshot empty.", testInfo);
    }
  } catch (error) {
    logStep(`DOM snapshot failed: ${error.message || error}`, testInfo);
  }
}

export async function logFailureArtifacts(page, testInfo, label = "Failure") {
  ensureLogFile();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTitle = (testInfo?.title || "test").replace(/[^a-z0-9_-]+/gi, "_");
  const screenshotPath = path.join(
    path.dirname(logFilePath),
    `${safeTitle}-${label}-${timestamp}.png`
  );
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logStep(`Saved screenshot: ${screenshotPath}`, testInfo);
  } catch (error) {
    logStep(`Screenshot failed: ${error.message || error}`, testInfo);
  }
  await logDomSnapshot(page, `${label} DOM`, testInfo);
}
