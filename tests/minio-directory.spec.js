const { test, expect } = require("@playwright/test");

// MinIO DIRECTORY setting (shared smd-minio.js).
//
// The bucket may hold other apps' backups, so an app can pin a bucket-relative
// Directory (empty = bucket root). Saving writes inside it, and the import page
// lists only that directory: its own files, its subdirectory names, and a
// "<subdirectory>:latest" shortcut that loads the newest JSON file inside that
// subdirectory.

const KEYS = {
  enabled: "planmydays_minio_enabled",
  server: "planmydays_minio_server",
  username: "planmydays_minio_username",
  password: "planmydays_minio_password",
  bucket: "planmydays_minio_bucket",
  directory: "planmydays_minio_directory"
};

async function enableMinio(page, extra = {}) {
  await page.goto("/PlanMyDay/");
  await page.evaluate(({ keys, overrides }) => {
    const config = Object.assign({
      enabled: "true",
      server: "http://minio:9000",
      username: "minioadmin",
      password: "minioadmin",
      bucket: "pmd",
      directory: ""
    }, overrides);
    Object.keys(config).forEach((field) => {
      localStorage.setItem(keys[field], config[field]);
    });
  }, { keys: KEYS, overrides: extra });
  await page.reload();
}

function xmlList({ contents = [], prefixes = [] }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    "<Name>pmd</Name>",
    "<KeyCount>" + (contents.length + prefixes.length) + "</KeyCount>",
    "<MaxKeys>1000</MaxKeys>",
    "<IsTruncated>false</IsTruncated>"
  ].concat(
    prefixes.map((p) => "<CommonPrefixes><Prefix>" + p + "</Prefix></CommonPrefixes>"),
    contents.map((key) => "<Contents><Key>" + key + "</Key>" +
      "<LastModified>2026-08-01T10:00:00.000Z</LastModified>" +
      '<ETag>"abc"</ETag><Size>1024</Size><StorageClass>STANDARD</StorageClass></Contents>'),
    ["</ListBucketResult>"]
  ).join("");
}

test.describe("MinIO - directory setting", () => {
  test("the Minio settings tab has an optional Directory field that persists", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.evaluate(() => openSettings());
    await page.locator("#filesync-tab").click();
    await expect(page.locator("#minioDirectory")).toBeVisible();
    await page.locator("#minioEnabled").check();
    await page.locator("#minioDirectory").fill("backups/2026/");
    await page.locator("#minioDirectory").blur();
    expect(await page.evaluate(() => localStorage.getItem("planmydays_minio_directory"))).toBe("backups/2026");
    await expect(page.locator("#minioDirectory")).toHaveValue("backups/2026/");
  });

  test("export writes the file inside the configured directory", async ({ page }) => {
    await enableMinio(page, { directory: "backups/2026" });
    await page.evaluate(() => {
      window.__minioPut = null;
      minioPutObject = (bucket, key, body) => {
        window.__minioPut = { bucket, key, body };
        return Promise.resolve("");
      };
    });
    await page.evaluate(() => exportToMinio());
    await expect.poll(async () => page.evaluate(() => window.__minioPut && window.__minioPut.key))
      .toMatch(/^backups\/2026\/planmydays-\d{12}\.json$/);
    const put = await page.evaluate(() => window.__minioPut);
    expect(put.bucket).toBe("pmd");
  });

  test("the import list shows files, subdirectory names and <dir>:latest in the configured directory", async ({ page }) => {
    const requests = [];
    const latest = "backups/2026/My Board/board-202602020000.json";
    await page.route((url) => url.hostname === "minio" && url.port === "9000", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      requests.push({
        method: req.method(),
        path: decodeURIComponent(url.pathname),
        prefix: url.searchParams.get("prefix"),
        delimiter: url.searchParams.get("delimiter")
      });
      if (req.method() === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") || "";
        if (prefix === "backups/2026/My Board/") {
          return route.fulfill({
            status: 200,
            body: xmlList({
              contents: [
                "backups/2026/My Board/board-202601010000.json",
                latest
              ]
            })
          });
        }
        return route.fulfill({
          status: 200,
          body: xmlList({
            contents: ["backups/2026/root.json", "backups/2026/alpha.json"],
            prefixes: ["backups/2026/My Board/"]
          })
        });
      }
      // GET object (latest shortcut)
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ version: 1, streams: [{ name: "Latest stream", image: "" }], images: [] })
      });
    });

    await enableMinio(page, { directory: "backups/2026" });
    await page.evaluate(() => importFromMinio());

    await expect(page.locator("#minioImportPage")).toHaveAttribute("open", "");
    await expect(page.locator("#minioImportBody .minio-folder-item")).toHaveText(["My Board"]);
    await expect(page.locator("#minioImportBody .minio-latest-item")).toHaveText(["My Board:latest"]);
    await expect(page.locator("#minioImportBody .minio-file-item")).toHaveText(["root.json", "alpha.json"]);

    // Every list request is scoped to the configured directory.
    expect(requests.filter((r) => r.method === "GET" && r.delimiter === "/")
      .every((r) => (r.prefix || "").indexOf("backups/2026/") === 0)).toBeTruthy();

    // A subdirectory is navigable: its files + an Up row, and Up goes back.
    await page.locator("#minioImportBody .minio-folder-item").click();
    await expect(page.locator("#minioImportBody .minio-file-item"))
      .toHaveText(["board-202602020000.json", "board-202601010000.json"]);
    await expect(page.locator("#minioImportBody .minio-up-item")).toHaveText(["Up"]);
    await page.locator("#minioImportBody .minio-up-item").click();
    await expect(page.locator("#minioImportBody .minio-folder-item")).toHaveText(["My Board"]);

    await page.locator("#minioImportBody .minio-latest-item").click();
    await expect.poll(() => page.evaluate(() => {
      const streams = JSON.parse(localStorage.getItem("planmydays_streams") || "[]");
      return streams[0] && streams[0].name;
    })).toBe("Latest stream");
    // The LATEST filename (not the older one) was downloaded.
    expect(requests.some((r) => r.method === "GET" && r.path.endsWith("/" + latest))).toBeTruthy();
  });

  test("CountMyDays' app-owned export also writes inside the configured directory", async ({ page }) => {
    await page.goto("/CountMyDays/");
    await page.evaluate(() => {
      localStorage.setItem("countmydays_minio_enabled", "true");
      localStorage.setItem("countmydays_minio_server", "http://minio:9000");
      localStorage.setItem("countmydays_minio_username", "minioadmin");
      localStorage.setItem("countmydays_minio_password", "minioadmin");
      localStorage.setItem("countmydays_minio_bucket", "myapps");
      localStorage.setItem("countmydays_minio_directory", "cmd");
    });
    await page.reload();
    await page.evaluate(() => {
      window.__minioPut = null;
      minioPutObject = (bucket, key, body) => {
        window.__minioPut = { bucket, key, body };
        return Promise.resolve("");
      };
      doMinioExport({ dates: [], categories: [], images: [] });
    });
    await expect.poll(() => page.evaluate(() => window.__minioPut && window.__minioPut.key))
      .toMatch(/^cmd\/countmydays-\d{12}\.json$/);
  });
});
