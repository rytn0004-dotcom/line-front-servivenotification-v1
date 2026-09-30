'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const base = path.join(__dirname, 'richmenu');
  const jsonPath = path.join(base, 'richmenu.json');
  const imagePath = path.join(base, 'richmenu.png');
  const definition = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const meta = await sharp(imagePath).metadata();
  const failures = [];

  if (definition.size?.width !== meta.width || definition.size?.height !== meta.height) {
    failures.push(`image ${meta.width}x${meta.height} != config ${definition.size?.width}x${definition.size?.height}`);
  }
  if (!Array.isArray(definition.areas) || definition.areas.length < 1 || definition.areas.length > 20) failures.push('areas must contain 1-20 items');
  if (String(definition.chatBarText || '').length > 14) failures.push('chatBarText exceeds 14 chars');
  if (fs.statSync(imagePath).size > 1024 * 1024) failures.push('image exceeds 1 MB');

  if (failures.length) {
    console.error('Rich Menu config test FAILED', failures);
    process.exitCode = 1;
    return;
  }
  console.log('Rich Menu config test PASS', {
    image: `${meta.width}x${meta.height}`,
    bytes: fs.statSync(imagePath).size,
    areas: definition.areas.length,
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
