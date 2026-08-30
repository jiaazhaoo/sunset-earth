#!/usr/bin/env node
// Converts a Supabase/Postgres CSV export into SQL that D1 (SQLite) can execute.
//
//   node d1/csv-to-sql.mjs camera_ytb path/to/camera_ytb_rows.csv > d1/seed-cameras.sql
//   npx wrangler d1 execute sunset-earth --remote --file=d1/seed-cameras.sql
//
// Three conversions matter, because SQLite has none of these Postgres types:
//   * boolean      "true"/"false"                -> 1/0
//   * timestamptz  "2026-03-11 07:11:58.946+00"  -> "2026-03-11T07:11:58.946Z"
//   * jsonb                                      -> TEXT (passed through verbatim)
//
// The timestamp rewrite is not cosmetic: the app compares these values as
// strings, and a space sorts before "T", so mixing the two formats would break
// every freshness filter.

import { readFileSync } from "node:fs";

const TEXT = "text";
const NUMBER = "number";
const BOOL = "bool";
const TIMESTAMP = "timestamp";

/**
 * Target tables. Columns absent from the CSV become NULL; columns present in
 * the CSV but missing here are ignored (the legacy camera_ytb export carries
 * active/des_0/des_1, which are empty in every row and unused by the app).
 */
const TABLES = {
  camera_ytb: {
    conflictKey: "camera_id",
    columns: {
      camera_id: TEXT,
      link: TEXT,
      placename: TEXT,
      city: TEXT,
      country: TEXT,
      latitude: NUMBER,
      longitude: NUMBER,
      timezone: TEXT,
      info_0: TEXT,
      tag: TEXT,
      host_link: TEXT,
      ytb_title: TEXT,
      link_available: BOOL,
      sunset_delay: NUMBER,
      sunrise_advance: NUMBER,
      last_check: TIMESTAMP,
      camera_metadata: TEXT, // JSON document, stored verbatim
    },
  },
  camera_rankings: {
    conflictKey: "camera_id",
    columns: {
      camera_id: TEXT,
      score: NUMBER,
      label: TEXT,
      distance_minutes: NUMBER,
      is_clear: BOOL,
      weather_class: TEXT,
      timezone: TEXT,
      sunrise: TIMESTAMP,
      sunset: TIMESTAMP,
      next_event_type: TEXT,
      next_event_time: TIMESTAMP,
      following_event_type: TEXT,
      following_event_time: TIMESTAMP,
      available: BOOL,
      computed_at: TIMESTAMP,
    },
  },
  camera_weather_cache: {
    conflictKey: "camera_id",
    columns: {
      camera_id: TEXT,
      lat: NUMBER,
      lng: NUMBER,
      data: TEXT, // JSON document, stored verbatim
      fetched_at: TIMESTAMP,
    },
  },
};

/** Minimal RFC-4180 CSV parser (handles quotes, escaped quotes, embedded newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSqlValue(kind, raw, context) {
  const value = raw?.trim() ?? "";

  if (value === "" || value.toLowerCase() === "null") {
    return "NULL";
  }

  if (kind === BOOL) {
    return ["true", "t", "1", "yes"].includes(value.toLowerCase()) ? "1" : "0";
  }

  if (kind === NUMBER) {
    const num = Number.parseFloat(value);
    if (Number.isNaN(num)) {
      warn(`${context}: not a number (${JSON.stringify(value)}) -> NULL`);
      return "NULL";
    }
    return String(num);
  }

  if (kind === TIMESTAMP) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      warn(`${context}: unparseable timestamp (${JSON.stringify(value)}) -> NULL`);
      return "NULL";
    }
    // Normalize every date to the ISO-8601 UTC form the app compares against.
    return sqlString(parsed.toISOString());
  }

  return sqlString(value);
}

const warnings = [];
function warn(message) {
  warnings.push(message);
}

// --- main ----------------------------------------------------------------

const [tableName, file] = process.argv.slice(2);

if (!tableName || !file || !TABLES[tableName]) {
  console.error("usage: node d1/csv-to-sql.mjs <table> <export.csv> > seed.sql");
  console.error(`tables: ${Object.keys(TABLES).join(", ")}`);
  process.exit(1);
}

const table = TABLES[tableName];
const columns = Object.keys(table.columns);

const rows = parseCsv(readFileSync(file, "utf8"));
if (rows.length < 2) {
  console.error("error: CSV needs a header row plus at least one data row");
  process.exit(1);
}

const header = rows[0].map((h) => h.trim().replace(/^﻿/, ""));
const indexOf = new Map(header.map((name, i) => [name, i]));

const ignored = header.filter((h) => h && !columns.includes(h));
const missing = columns.filter((c) => !indexOf.has(c));

if (!indexOf.has(table.conflictKey)) {
  console.error(`error: CSV has no ${table.conflictKey} column`);
  process.exit(1);
}

console.log(`-- ${tableName}: generated by d1/csv-to-sql.mjs from ${file}`);
console.log("-- Re-runnable: existing rows with the same key are replaced.");
console.log("BEGIN TRANSACTION;");

let count = 0;
for (const [i, row] of rows.slice(1).entries()) {
  const values = columns.map((column) => {
    const index = indexOf.get(column);
    if (index === undefined) return "NULL";
    return toSqlValue(table.columns[column], row[index], `row ${i + 2}.${column}`);
  });

  console.log(
    `INSERT OR REPLACE INTO ${tableName} (${columns.join(", ")}) VALUES (${values.join(", ")});`
  );
  count++;
}

console.log("COMMIT;");

console.error(`ok: ${count} rows -> ${tableName}`);
if (ignored.length) console.error(`   ignored CSV columns: ${ignored.join(", ")}`);
if (missing.length) console.error(`   columns not in CSV (NULL): ${missing.join(", ")}`);
for (const message of warnings.slice(0, 20)) console.error(`   warn: ${message}`);
if (warnings.length > 20) console.error(`   ... and ${warnings.length - 20} more warnings`);
