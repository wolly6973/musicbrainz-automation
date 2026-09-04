const { chromium } = require("playwright");
const fs = require("fs");

const RELEASE_MBID = process.argv[2];
const ARTWORK_URL = process.argv[3];
const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";

console.log("DRY_RUN:", DRY_RUN);

if (!RELEASE_MBID || !ARTWORK_URL) {
  console.error(
    "Usage: node upload-cover-art.js <release-mbid> <artwork-url>"
  );
  process.exit(1);
}

const DOWNLOAD_PATH = `/tmp/mb-cover-${RELEASE_MBID}.jpg`;

(async () => {
  let browser = null;
  let page = null;

  try {
    browser = await chromium.connectOverCDP(
      "http://127.0.0.1:9222"
    );

    const contexts = browser.contexts();

    if (!contexts.length) {
      throw new Error("No Chromium browser context found.");
    }

    const context = contexts[0];

    // Use a new tab so the user's existing dashboard/MusicBrainz
    // tab is not disturbed.
    page = await context.newPage();

    const addCoverUrl =
      `https://musicbrainz.org/release/${RELEASE_MBID}/add-cover-art`;

    console.log("========================================");
    console.log("MusicBrainz Cover Art Upload");
    console.log("========================================");
    console.log("Release:", RELEASE_MBID);
    console.log("Artwork:", ARTWORK_URL);
    console.log();

    // ------------------------------------------------------------
    // Download artwork
    // ------------------------------------------------------------
    console.log("Downloading artwork...");

    const response = await fetch(ARTWORK_URL);

    if (!response.ok) {
      throw new Error(
        `Artwork download failed: HTTP ${response.status}`
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      throw new Error("Downloaded artwork is empty");
    }

    fs.writeFileSync(DOWNLOAD_PATH, buffer);

    console.log(
      `Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`
    );
    console.log("Saved:", DOWNLOAD_PATH);
    console.log();

    // ------------------------------------------------------------
    // Open MusicBrainz Add Cover Art
    // ------------------------------------------------------------
    console.log("Opening MusicBrainz Add Cover Art page...");

    await page.goto(addCoverUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("TITLE:", await page.title());
    console.log("URL:", page.url());
    console.log();

    // ------------------------------------------------------------
    // Select artwork
    // ------------------------------------------------------------
    const fileInput = page.locator(
      'input[type="file"][name="files[]"]'
    );

    await fileInput.setInputFiles(DOWNLOAD_PATH);

    console.log("Artwork selected.");

    // ------------------------------------------------------------
    // Select Front cover
    // ------------------------------------------------------------
    const front = page.locator(
      'input[name="add-cover-art.type_id"][value="1"]'
    );

    await front.evaluate(el => {
      el.checked = true;

      el.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      el.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    });

    if (!(await front.isChecked())) {
      throw new Error("Failed to select Front cover type");
    }

    console.log("Cover type: Front");
    console.log();

    // ------------------------------------------------------------
    // Submit cover-art edit
    // ------------------------------------------------------------
    console.log("Submitting cover art...");
    console.log();

    await page.locator("#add-cover-art-submit").click();

    try {
      await page.waitForURL(
        url => !url.toString().includes("/add-cover-art"),
        {
          timeout: 120000
        }
      );
    } catch (err) {
      console.error(
        "Timed out waiting for MusicBrainz to finish."
      );
      console.error("Current URL:", page.url());
      throw err;
    }

    console.log("========================================");
    console.log("UPLOAD COMPLETE");
    console.log("========================================");
    console.log("TITLE:", await page.title());
    console.log("URL:", page.url());

  } finally {
    // Clean up the downloaded image.
    try {
      fs.unlinkSync(DOWNLOAD_PATH);
    } catch (_) {}

    // Close ONLY our temporary tab.
    // NEVER close the remote Chromium browser itself.
    if (page) {
      try {
        await page.close();
      } catch (_) {}
    }

    // IMPORTANT:
    // Do not call browser.close().
    //
    // This browser is the persistent Chromium instance owned by
    // start-browser.sh. Closing the CDP browser would shut it down.
  }
})().catch(err => {
  console.error();
  console.error("========================================");
  console.error("COVER ART UPLOAD ERROR");
  console.error("========================================");
  console.error(err);
  process.exit(1);
});
