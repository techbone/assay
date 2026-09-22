import { exportSnapshot } from "../src/publish/export.js";

const db = process.argv[2] ?? "data/assay.db";
const out = process.argv[3] ?? "web/public/data";
const r = exportSnapshot(db, out);
console.log(`exported ${r.files} files (${(r.bytes / 1024).toFixed(0)} KB) -> ${out}`);
