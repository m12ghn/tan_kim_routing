// Kiểm tra src/changelog.json và đồng bộ số phiên bản vào package.json.
// Chạy: npm run changelog
import { readFileSync, writeFileSync } from 'node:fs';

const TYPES = ['new', 'change', 'fix', 'system'];
const log = JSON.parse(readFileSync('src/changelog.json', 'utf8'));
const errors = [];

log.forEach((e, i) => {
  if (!/^\d+\.\d+\.\d+$/.test(e.version)) errors.push(`Dòng ${i}: version "${e.version}" phải dạng x.y.z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push(`Dòng ${i}: date "${e.date}" phải dạng yyyy-mm-dd`);
  if (!Array.isArray(e.items) || !e.items.length) errors.push(`Dòng ${i}: thiếu items`);
  for (const it of e.items ?? []) if (!TYPES.includes(it.type)) errors.push(`Dòng ${i}: loại "${it.type}" không thuộc ${TYPES.join('/')}`);
});
const cmp = (a, b) => a.split('.').map(Number).reduce((r, n, k) => r || n - b.split('.').map(Number)[k], 0);
for (let i = 1; i < log.length; i++)
  if (cmp(log[i - 1].version, log[i].version) <= 0) errors.push(`Phiên bản mới nhất phải nằm đầu: ${log[i - 1].version} ≤ ${log[i].version}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== log[0].version) {
  pkg.version = log[0].version;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(`package.json → v${pkg.version}`);
}
console.log(`changelog OK · v${log[0].version} · ${log[0].date}`);
