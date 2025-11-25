import fs from "fs";
import path from "path";
import Papa from "papaparse";
import tzLookup from "tz-lookup";

const DEFAULT_PATH =
  "../sunset-earth-file/data/camera_ytb_rows (2).csv";

async function main() {
  const target = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), DEFAULT_PATH);

  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(target, "utf8");
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const fields = parsed.meta.fields ?? [];
  const rows = parsed.data ?? [];
  let updates = 0;

  for (const row of rows) {
    const lat = toNumber(row.latitude);
    const lng = toNumber(row.longitude);
    if (lat === null || lng === null) {
      continue;
    }

    try {
      const timezone = tzLookup(lat, lng);
      if (row.timezone !== timezone) {
        row.timezone = timezone;
        updates += 1;
      }
    } catch (error) {
      console.warn(
        `Failed to resolve timezone for ${row.camera_id ?? "unknown"}:`,
        error
      );
    }
  }

  const output = Papa.unparse(rows, {
    columns: fields.length ? fields : undefined,
  });

  fs.writeFileSync(target, `${output}\n`, "utf8");
  console.log(`Updated ${updates} rows in ${target}`);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
