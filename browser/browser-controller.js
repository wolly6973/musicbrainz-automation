const http = require("http");
const { spawn } = require("child_process");

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://dashboard:8080";
const POLL_INTERVAL_MS = 5000;
const UPLOADER_PATH = "/app/upload-cover-art.js";

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on("error", reject);
  });
}

function waitForBrowser(timeoutMs = 120000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(
        "http://127.0.0.1:9222/json/version",
        (res) => {
          let body = "";

          res.setEncoding("utf8");

          res.on("data", (chunk) => {
            body += chunk;
          });

          res.on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const info = JSON.parse(body);

                console.log(
                  `Chromium CDP ready: ${info.Browser || "unknown"}`
                );

                resolve(info);
                return;
              } catch (_) {}
            }

            retry();
          });
        }
      );

      req.on("error", retry);

      function retry() {
        if (Date.now() - start >= timeoutMs) {
          reject(
            new Error(
              "Timed out waiting for Chromium CDP."
            )
          );
          return;
        }

        setTimeout(check, 2000);
      }
    };

    check();
  });
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          let parsedBody = null;

          try {
            parsedBody = JSON.parse(responseBody);
          } catch (_) {}

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${responseBody}`
              )
            );
            return;
          }

          resolve(parsedBody);
        });
      }
    );

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

function selectArtwork(job) {
  const artwork = Array.isArray(job.artwork)
    ? job.artwork
    : [];

  const usable = artwork.filter((item) => {
    const url = String(item?.url || "").trim();

    if (!url) {
      return false;
    }

    return /^https?:\/\//i.test(url);
  });

  if (!usable.length) {
    throw new Error(
      "Job contains no usable artwork URLs."
    );
  }

  const front = usable.find((item) => {
    const types = Array.isArray(item.types)
      ? item.types
      : [];

    return types.includes("front");
  });

  return front || usable[0];
}

function runUploader(releaseMbid, artworkUrl) {
  return new Promise((resolve, reject) => {
    console.log();
    console.log("========================================");
    console.log("STARTING MUSICBRAINZ COVER ART UPLOADER");
    console.log("========================================");
    console.log("Release MBID:", releaseMbid);
    console.log("Artwork URL: ", artworkUrl);
    console.log();

    const child = spawn(
      "node",
      [
        UPLOADER_PATH,
        releaseMbid,
        artworkUrl,
      ],
      {
        stdio: "inherit",
        env: process.env,
      }
    );

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        console.log();
        console.log("Cover art uploader completed successfully.");
        resolve();
        return;
      }

      if (signal) {
        reject(
          new Error(
            `Cover art uploader terminated by signal ${signal}.`
          )
        );
        return;
      }

      reject(
        new Error(
          `Cover art uploader exited with code ${code}.`
        )
      );
    });
  });
}

async function processArtworkJob(job) {
  const mbid = String(
    job.release_mbid || ""
  ).trim();

  console.log();
  console.log("========================================");
  console.log("ARTWORK JOB");
  console.log("========================================");
  console.log("Release MBID:", mbid);
  console.log("Deezer:      ", job.deezer || "");
  console.log("GTIN:        ", job.gtin || "");
  console.log(
    "Artwork items:",
    Array.isArray(job.artwork)
      ? job.artwork.length
      : 0
  );
  console.log();

  const selected = selectArtwork(job);

  console.log("Selected artwork:");
  console.log("URL:      ", selected.url);
  console.log(
    "Thumbnail:",
    selected.thumbUrl || ""
  );
  console.log(
    "Types:    ",
    Array.isArray(selected.types)
      ? selected.types.join(", ")
      : ""
  );
  console.log(
    "Provider: ",
    selected.provider || ""
  );
  console.log();

  await runUploader(
    mbid,
    selected.url
  );
}

async function main() {
  console.log("========================================");
  console.log("MUSICBRAINZ BROWSER CONTROLLER");
  console.log("========================================");
  console.log(`Dashboard: ${DASHBOARD_URL}`);
  console.log(`Uploader:  ${UPLOADER_PATH}`);
  console.log();

  console.log("Waiting for Chromium CDP...");

  await waitForBrowser();

  console.log();

  while (true) {
    try {
      const data = await getJson(
        `${DASHBOARD_URL}/harmony-release-jobs`
      );

      const jobs = Array.isArray(data.jobs)
        ? data.jobs
        : [];

      for (const job of jobs) {
        const mbid = String(
          job.release_mbid || ""
        ).trim();

        const status = String(
          job.status || ""
        ).trim();

        if (!mbid || status !== "artwork_ready") {
          continue;
        }

        console.log();
        console.log("========================================");
        console.log("ARTWORK JOB FOUND");
        console.log("========================================");
        console.log(`Release MBID: ${mbid}`);
        console.log(`Deezer:       ${job.deezer || ""}`);
        console.log(`GTIN:         ${job.gtin || ""}`);
        console.log(`Detected:     ${job.detected_at || ""}`);
        console.log(
          `Artwork ready: ${job.artwork_ready_at || ""}`
        );
        console.log();

        console.log("Checking Chromium CDP before claiming job...");

        try {
          await waitForBrowser();
        } catch (error) {
          console.error(
            `Chromium CDP is not ready: ${error.message}`
          );
          continue;
        }

        console.log("Chromium CDP ready.");

        console.log("Claiming artwork job...");

        let claim;

        try {
          claim = await postJson(
            `${DASHBOARD_URL}/harmony-release-job/claim`,
            {
              release_mbid: mbid,
            }
          );
        } catch (error) {
          console.error(
            `Job claim failed: ${error.message}`
          );
          continue;
        }

        console.log(
          `Claim response: ${JSON.stringify(claim)}`
        );

        if (!claim || claim.claimed !== true) {
          console.log("Job was not claimed.");
          continue;
        }

        console.log();
        console.log("========================================");
        console.log("ARTWORK JOB CLAIMED");
        console.log("========================================");
        console.log(`Release MBID: ${mbid}`);
        console.log();

        try {
          await processArtworkJob(job);

          const completion = await postJson(
            `${DASHBOARD_URL}/harmony-release-job/complete`,
            {
              release_mbid: mbid,
              status: "completed",
            }
          );

          console.log(
            `Completion response: ${JSON.stringify(completion)}`
          );

          console.log();
          console.log("========================================");
          console.log("ARTWORK JOB COMPLETED");
          console.log("========================================");
          console.log(`Release MBID: ${mbid}`);
          console.log("Status:       completed");
          console.log("========================================");
          console.log();

        } catch (error) {
          console.error();
          console.error(
            "ARTWORK PROCESSING ERROR:",
            error.message
          );
          console.error();

          try {
            const failure = await postJson(
              `${DASHBOARD_URL}/harmony-release-job/complete`,
              {
                release_mbid: mbid,
                status: "failed",
                error: error.message,
              }
            );

            console.log(
              `Failure response: ${JSON.stringify(failure)}`
            );
          } catch (completionError) {
            console.error(
              `Could not record failure: ${completionError.message}`
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Controller poll failed: ${error.message}`
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, POLL_INTERVAL_MS)
    );
  }
}

main().catch((error) => {
  console.error();
  console.error("========================================");
  console.error("BROWSER CONTROLLER ERROR");
  console.error("========================================");
  console.error(error);
  process.exit(1);
});
