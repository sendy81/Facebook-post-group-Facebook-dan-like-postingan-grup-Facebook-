"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");

puppeteer.use(StealthPlugin());

// ===== Fungsi klik aman (element langsung)
async function safeClickEl(el) {
  if (!el) return false;
  try {
    await el.click();
    return true;
  } catch (e) {
    console.log("⚠️ Gagal klik element:", e.message);
    return false;
  }
}

// ===== Fungsi klik by XPath
async function safeClickXpath(page, xpath, desc = "elemen") {
  try {
    const el = await page.waitForXPath(xpath, { visible: true, timeout: 8000 });
    await el.click();
    console.log(`✅ Klik ${desc}`);
    return true;
  } catch (e) {
    console.log(`❌ Gagal klik ${desc}:`, e.message);
    return false;
  }
}

// ===== Fungsi scan elemen verbose
async function scanAllElementsVerbose(page, label = "Scan") {
  console.log(`\n🔎 ${label} (50 elemen pertama)`);
  const elements = await page.evaluate(() => {
    return [...document.querySelectorAll("div, span, a, button, textarea, input")]
      .slice(0, 50)
      .map((el, i) => ({
        index: i,
        tag: el.tagName,
        txt: (el.innerText || "").trim(),
        aria: el.getAttribute("aria-label"),
        placeholder: el.getAttribute("placeholder"),
        role: el.getAttribute("role"),
        href: el.getAttribute("href"),
        contenteditable: el.getAttribute("contenteditable"),
        classes: el.className
      }));
  });
  elements.forEach(el => console.log(`#${el.index}`, el));
  return elements;
}

// ===== Fungsi download media dari GitHub Release
const mediaFolder = path.join(__dirname, "media");
if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder);

async function downloadMedia(url, filename) {
  const mediaFolder = path.join(__dirname, "media");
  if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

  const filePath = path.join(mediaFolder, filename);
  const options = {
    headers: { "User-Agent": "Mozilla/5.0 (PuppeteerBot)" }
  };

  return new Promise((resolve, reject) => {
    const request = https.get(url, options, (res) => {
      // 🔁 Handle redirect (301, 302)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log("🔁 Redirect ke:", res.headers.location);
        return resolve(downloadMedia(res.headers.location, filename));
      }

      // ❌ Handle error status
      if (res.statusCode !== 200) {
        reject(new Error(`❌ Gagal download media: ${res.statusCode}`));
        return;
      }

      // 💾 Tulis file ke disk
      const file = fs.createWriteStream(filePath);
      res.pipe(file);

      file.on("finish", () => {
        file.close(() => {
          try {
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
              reject(new Error(`❌ File ${filename} kosong! Download gagal.`));
              return;
            }
            console.log(`✅ Media selesai diunduh (${(stats.size / 1024).toFixed(2)} KB): ${filePath}`);
            resolve(filePath);
          } catch (err) {
            reject(err);
          }
        });
      });
    });

    request.on("error", (err) => {
      console.log("❌ Error saat download:", err.message);
      reject(err);
    });
  });
}


  async function uploadMedia(page, filePath, fileName) {
  console.log(`🚀 Mulai upload media: ${fileName}`);

  const ext = path.extname(fileName).toLowerCase();
  const isVideo = [".mp4", ".mov"].includes(ext);
///  let label = isVideo ? "Video" : "Photos";
    
  let label = "Photos";
  if ([".mp4", ".mov"].includes(ext)) label = "Video";

  console.log(`🧩 Deteksi ekstensi ${ext}, target tombol: ${label}`);

    //klik tombol Photos/Video 
  const clicked = await page.evaluate((label) => {
  const btn = [...document.querySelectorAll('div[role="button"]')].find(div => {
    const txt = (div.innerText || "").toLowerCase();
    const aria = (div.getAttribute("aria-label") || "").toLowerCase();
    return txt.includes("Photos") || txt.includes("Video") || txt.includes("foto") || aria.includes("photo") || aria.includes("video");
  });

  if (!btn) return false;
  ["pointerdown","mousedown","touchstart","mouseup","pointerup","touchend","click"].forEach(evt => {
    btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
  });
  return true;
}, label);

  
 
 // Tunggu input file muncul
    await page.waitForTimeout(3000);
// 3️⃣ Cari input file 
   const fileInput = (await page.$('input[type="file"][accept="image/*"]')) ||
                     (await page.$('input[type="file"][accept*="video/*"]')) || 
                      (await page.$('input[type="file"]'));
            if (!fileInput)
            { console.log("❌ Input file tidak ditemukan, upload gagal"); 
             return false; }
  
    // Upload file
////  await fileInput.uploadFile(filePath);
 /// console.log(`✅ File ${fileName} berhasil di-upload ke input`);
    
    
// ✅ Upload file ke input dan pastikan React detect File object asli
const fileNameOnly = path.basename(filePath);
///const mimeType = isVideo ? "video/mp4" : "image/jpeg";
const mimeType = ext === ".mp4" ? "video/mp4" : "image/png";
const fileBuffer = fs.readFileSync(filePath);
const base64Data = fileBuffer.toString("base64");

await page.evaluate(
  async ({ fileNameOnly, base64Data, mimeType }) => {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], fileNameOnly, { type: mimeType });

    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error("❌ Input file tidak ditemukan");

    // Buat DataTransfer agar React tahu file benar-benar berubah
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;

    // Trigger event React
    ["input", "change"].forEach(evt =>
      input.dispatchEvent(new Event(evt, { bubbles: true }))
    );

    console.log("⚡ File injected ke React dengan File API browser");
  },
  { fileNameOnly, base64Data, mimeType }
);

console.log(`✅ File ${fileNameOnly} berhasil diinject sebagai File object`);


  // 4️⃣ Trigger semua event agar React detect perubahan
  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]');
    if (input) {
      const events = ["input", "change", "focus", "blur", "keydown", "keyup"];
      events.forEach(evt => input.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true })));
    }
  });
  console.log("⚡ Event React input/change/keydown/keyup dikirim");

    // 3️⃣ Tunggu preview media (foto/video)
let previewOk = false;
let bufferTime = 10000;

try {
  const ext = path.extname(fileName).toLowerCase();
  const isVideo = [".mp4", ".mov"].includes(ext);
  let previewOk = false;

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    console.log("⏳ Tunggu foto preview...");
    await page.waitForSelector(
      [
        'div[data-mcomponent="ImageArea"] img[src^="data:image"]', // base64 inline
        'img[src^="blob:"]',                                       // foto blob CDN
        'div[aria-label="Photo preview"] img',                     // fallback
      ].join(", "),
      { timeout: 60000 }
    );
    console.log("✅ Foto preview ready");
    previewOk = true;

  } else if (isVideo) {
    console.log("⏳ Tunggu preview video ...");
   
    // 1️⃣ Tunggu elemen ImageArea muncul dulu
  await page.waitForSelector('div[data-mcomponent="ImageArea"] img[data-type="image"]', { timeout: 120000 });
  console.log("🔍 Elemen ImageArea terdeteksi (placeholder)");

    await page.waitForFunction(() => {
    const thumbs = [...document.querySelectorAll('div[data-mcomponent="ImageArea"] img[data-type="image"]')];
    return thumbs.some(img => 
      img.src && 
      !img.src.includes("rsrc.php") &&  // hindari placeholder
      !img.src.startsWith("data:,") && 
      (img.src.includes("fbcdn.net") || img.src.startsWith("blob:"))
    );
  }, 
    { timeout: 60000 }
    );
    console.log("✅ Video thumbnail sudah berubah → preview ready");
    previewOk = true;
  }

  // Tambah buffer agar Facebook encode selesai
  await page.waitForTimeout(3000);
  console.log("⏳ Tambahan waktu encode 3 detik selesai");

} catch (e) {
  console.log("⚠️ Preview tidak muncul dalam batas waktu, paksa lanjut...");
      }
      

    
  // 6️⃣ Screenshot hasil preview
  const screenshotPath = path.join(__dirname, "media", "after_upload.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot preview media tersimpan: ${screenshotPath}`);

  const exists = fs.existsSync(screenshotPath);
  console.log(exists ? "✅ Screenshot tersimpan dengan baik" : "❌ Screenshot gagal disimpan");

   return true; //selesai 
}


module.exports = { uploadMedia };

 // 7️⃣ Optional: upload screenshot ke artifact GitHub
  if (process.env.GITHUB_ACTIONS) {
    console.log(`📤 Screenshot siap di-upload ke artifact (gunakan actions/upload-artifact di workflow)`);
  }
                                          
// ===== Ambil tanggal hari ini
function getTodayString() {
  const today = new Date();
 const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
// 🕒 Fungsi delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Main Puppeteer
(async () => {
  try {
    console.log("🚀 Start bot...");

    const cookies = JSON.parse(fs.readFileSync(__dirname + "/cookies.json", "utf8"));
    const groupUrl = "https://m.facebook.com/groups/5763845890292336/";
    const caption = "🚀 Caption otomatis masuk dari Puppeteer!";

    const browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ],
    });

    const page = await browser.newPage();
     // 🔊 Monitor semua console dari browser
page.on("console", msg => console.log("📢 [Browser]", msg.text()));
page.on("pageerror", err => console.log("💥 [Browser Error]", err.message));
page.on("response", res => {
  if (!res.ok()) console.log(`⚠️ [HTTP ${res.status()}] ${res.url()}`);
});
  
    // ===== Mulai rekaman
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start("recording.mp4");

    // ===== Anti-detect
    await page.setUserAgent(
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36"
    );
    await page.setViewport({ width: 390, height: 844, isMobile: true });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, "languages", { get: () => ["id-ID", "id"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    // ===== Pasang cookies
    await page.setCookie(...cookies);
    console.log("✅ Cookies set");

    // ===== Buka grup
    await page.goto(groupUrl, { waitUntil: "networkidle2" });
    await page.waitForTimeout(3000);

    // ===== 1️⃣ Klik composer / write something
    let writeClicked = await safeClickXpath(page, "//*[contains(text(),'Write something')]", "Composer");
    if (!writeClicked) {
      console.log("⚠️ Composer tidak ditemukan, fallback scan");
      await scanAllElementsVerbose(page, "Composer");
    }
    await page.waitForTimeout(2000);
   // 1️⃣ Klik placeholder composer
const clickResult = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("div[role='button']")]
    .find(el => {
      const t = (el.innerText || "").toLowerCase();
      return t.includes("write something") || t.includes("buat postingan") || t.includes("tulis sesuatu");
    });
  if (!btn) return { ok: false, msg: "Placeholder tidak ditemukan" };
  ["mousedown", "mouseup", "click"].forEach(type => {
    btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  });
  return { ok: true, msg: "Klik placeholder berhasil" };
});
console.log("CLICK:", clickResult);
await page.waitForTimeout(1000);

// 2️⃣ Isi caption
const fillResult = await page.evaluate((text) => {
  const selectors = [
    "textarea[name='xc_message']",
    "textarea",
    "div[role='textbox'][contenteditable='true']",
    "div[contenteditable='true']"
  ];

  for (const s of selectors) {
    const tb = document.querySelector(s);
    if (tb) {
      tb.focus();
      if ("value" in tb) {
        tb.value = text;
        tb.dispatchEvent(new Event("input", { bubbles: true }));
        tb.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        tb.innerText = text;
        tb.dispatchEvent(new InputEvent("input", { bubbles: true }));
        tb.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return { ok: true, selector: s, msg: "Caption berhasil diisi" };
    }
  }
  return { ok: false, msg: "Textbox tidak ditemukan" };
}, caption);

console.log("FILL:", fillResult);
   await delay(3000); // kasih waktu 3 detik minimal


  // ===== 3️⃣ Download + upload media
 const today = process.env.DATE;
 const fileName = `akun1_${today}.png`; // bisa .mp4
const mediaUrl ="https://github.com/Rulispro/Coba-post-group-Facebook-/releases/download/V1.0/Screenshot_20250909-071607.png";
// download media → simpan return value ke filePat
  const filePath = await downloadMedia(mediaUrl, fileName);
console.log(`✅ Media ${fileName} berhasil di-download.`);

const stats = fs.statSync(filePath);
if (stats.size === 0) {
  throw new Error(`❌ File ${fileName} kosong! Download gagal.`);
}


// upload ke Facebook

  
await uploadMedia(page, filePath, fileName, "Photos");
   
// Cari tombol POST dengan innerText
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('div[role="button"]')];
  const postBtn = buttons.find(b => b.innerText.trim().toUpperCase() === "POST");
  if (postBtn) {
    postBtn.click();
  }
});
console.log("✅ Klik POST berhasil (via innerText)");

   await delay(3000); // kasih waktu 3 detik minimal

    // ===== Stop recorder
    await recorder.stop();
    console.log("🎬 Rekaman selesai: recording.mp4");

    await browser.close();
  } catch (err) {
    console.error("❌ Error utama:", err);
  }
})();
