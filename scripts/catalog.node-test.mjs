import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderBadgeReply } from "./badge-replies.mjs";
import { generateCatalog } from "./generate-catalog.mjs";

test("indexes local and authenticated remote entries offline while retaining validation records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toolsdk-catalog-"));
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    for (const dir of ["indexes", "packages/developer-tools", "docs/_templates", "assets"])
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    const config = {
      type: "mcp-server",
      runtime: "node",
      packageName: "example",
      description: "<script>alert(1)</script>",
    };
    write("packages/developer-tools/example.json", config);
    write("packages/developer-tools/remote.json", {
      ...config,
      packageName: "@toolsdk-remote/example",
      remotes: [
        { type: "streamable-http", url: "https://example.com/mcp", auth: { type: "oauth2" } },
      ],
    });
    write("packages/developer-tools/duplicate.json", config);
    write("packages/developer-tools/blacklisted.json", {
      ...config,
      packageName: "mcp-minecraft-remote",
    });
    write("indexes/packages-list.json", {
      example: {
        path: "developer-tools/example.json",
        category: "developer-tools",
        validated: true,
        tools: { search: {} },
      },
      removed: { path: "gone.json" },
    });
    fs.cpSync(path.join(source, "docs/_templates"), path.join(root, "docs/_templates"), {
      recursive: true,
    });
    fs.copyFileSync(path.join(source, "assets/logo.png"), path.join(root, "assets/logo.png"));
    write("package.json", { dependencies: { unchanged: "1.0.0" } });
    const index = generateCatalog(root);
    assert.deepEqual(Object.keys(index).sort(), ["@toolsdk-remote/example", "example"]);
    assert.equal(index.example.path, "developer-tools/example.json");
    assert.equal(index.example.validated, true);
    assert.deepEqual(index.example.tools, { search: {} });
    assert.equal(Object.hasOwn(index["@toolsdk-remote/example"], "validated"), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "package.json"))), {
      dependencies: { unchanged: "1.0.0" },
    });
    const site = fs.readFileSync(path.join(root, "catalog-site/index.html"), "utf8");
    assert.match(site, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(site, /@toolsdk-remote\/example/);
    const snapshot = fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8");
    generateCatalog(root);
    assert.equal(fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8"), snapshot);
    assert.match(
      fs.readFileSync(path.join(root, "docs/ALL-MCP-SERVERS.md"), "utf8"),
      /@toolsdk-remote\/example/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("badge replies use scoped registry keys and distinguish listing from runtime validation", () => {
  const body = renderBadgeReply([
    { key: "@toolsdk-remote/example", file: "developer-tools/example.json" },
  ]);
  assert.match(body, /badges\.toolsdk\.ai\/badge\/@toolsdk-remote\/example/);
  assert.match(body, /#%40toolsdk-remote%2Fexample/);
  assert.match(body, /packages\/developer-tools\/example\.json/);
  assert.match(body, /not an official endorsement/);
});
