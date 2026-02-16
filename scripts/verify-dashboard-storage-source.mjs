import { readFileSync } from 'fs';
import { resolve } from 'path';

const filePath = resolve(process.cwd(), 'src/services/dashboardStorage.js');
const source = readFileSync(filePath, 'utf8');

const exportName = 'fetchSharedDashboardProfile';
const exportRegex = new RegExp(`export\\s+const\\s+${exportName}\\b`, 'g');
const matches = source.match(exportRegex) || [];

if (matches.length !== 1) {
  console.error(`[verify] ${filePath}: expected exactly 1 export for '${exportName}', found ${matches.length}.`);
  console.error('[verify] This usually means a stale/merged duplicate block was pasted into the source file.');
  process.exit(1);
}

if (source.includes('//# sourceMappingURL=data:application/json;base64,')) {
  console.error(`[verify] ${filePath}: found inline base64 sourceMappingURL in source file.`);
  console.error('[verify] Remove generated/bundled source map text from the source file and keep only valid module code.');
  process.exit(1);
}

if (source.includes('readCachedProfileData(')) {
  console.error(`[verify] ${filePath}: found stale symbol 'readCachedProfileData'.`);
  console.error('[verify] The current storage module should not reference this symbol.');
  process.exit(1);
}

console.log('[verify] dashboardStorage source looks valid.');
