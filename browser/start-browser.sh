#!/bin/sh
set -u

export DISPLAY=:99

rm -f /tmp/.X99-lock

echo "Starting Xvfb..."
Xvfb :99 -screen 0 1280x900x24 -ac &

echo "Waiting for X server..."
for i in $(seq 1 30); do
    if [ -S /tmp/.X11-unix/X99 ]; then
        break
    fi
    sleep 1
done

if [ ! -S /tmp/.X11-unix/X99 ]; then
    echo "ERROR: X11 socket /tmp/.X11-unix/X99 was not created"
    exit 1
fi

echo "Starting MusicBrainz automation controller supervisor..."

(
    while true; do
        echo
        echo "========================================"
        echo "Starting MusicBrainz browser controller..."
        echo "========================================"

        node /app/browser-controller.js

        EXIT_CODE=$?

        echo
        echo "Browser controller exited with code: $EXIT_CODE"
        echo "Restarting controller in 2 seconds..."
        sleep 2
    done
) &

CONTROLLER_SUPERVISOR_PID=$!

cd /app

while true; do
    echo
    echo "========================================"
    echo "Starting Chromium..."
    echo "========================================"

    node - <<'NODE'
const { chromium } = require("playwright");

const DASHBOARD_BROWSER_URL = process.env.DASHBOARD_BROWSER_URL || "http://localhost:8088";

(async () => {
  let context = null;

  try {
    context = await chromium.launchPersistentContext(
      "/ms-playwright-profile",
      {
        headless: false,
        args: [
          "--remote-debugging-port=9222"
        ],
        viewport: {
          width: 1280,
          height: 900
        }
      }
    );

    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    await page.goto(
      DASHBOARD_BROWSER_URL,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    console.log("Browser started.");
    console.log("TITLE:", await page.title());
    console.log("URL:", page.url());

    /*
     * Keep the Chromium session alive.
     *
     * Automation will be handled separately so that an
     * automation error cannot take down the browser.
     */
    await new Promise((resolve) => {
      context.on("close", resolve);
    });

    console.log("Browser context closed.");
  } catch (err) {
    console.error();
    console.error("========================================");
    console.error("BROWSER PROCESS ERROR");
    console.error("========================================");
    console.error(err);
    console.error();
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (_) {}
    }
  }
})();
NODE

    EXIT_CODE=$?

    echo
    echo "Chromium process exited with code: $EXIT_CODE"
    echo "Restarting Chromium in 2 seconds..."
    sleep 2
done
