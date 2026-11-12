import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const [path, w] of [["/en/events/gala-night", 1440], ["/en", 1440], ["/en/programs", 390]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
  await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  // slow, human-like scroll
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 250) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } await new Promise((r) => setTimeout(r, 600)); });
  const stuck = await p.evaluate(() => [...document.querySelectorAll("[data-reveal],[data-stagger-item],[data-hero-item],[data-hero-card]")].filter((e) => getComputedStyle(e).opacity === "0").map((e) => `${e.tagName} ${(e.textContent || "").trim().slice(0, 30)} | top=${Math.round(e.getBoundingClientRect().top + scrollY)} H=${document.documentElement.scrollHeight}`));
  console.log(path, w, "slow-scroll stuck:", stuck);
}
await b.close();
