#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/normalize-bun-cjs.cjs <bundle-path>");
  process.exit(1);
}

const source = readFileSync(filePath, "utf8");
const normalized = source.replaceAll("import.meta.require", "require");

if (normalized !== source) {
  writeFileSync(filePath, normalized);
}
