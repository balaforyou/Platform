const fs = require('fs');
const path = require('path');

/**
 * Recursively copies all files and folders from source to destination.
 * WHY: Cross-platform utility to ensure generated Prisma client types and assets
 * are available in the compiled dist directory on both Windows dev and Linux CI environments.
 */
function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach((element) => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

const srcDir = path.join(__dirname, '../src/generated/client');
const destDir = path.join(__dirname, '../dist/generated/client');

if (fs.existsSync(srcDir)) {
  copyFolderSync(srcDir, destDir);
  console.log('Prisma Client copied to dist successfully.');
} else {
  console.error('Source Prisma Client not found at: ' + srcDir);
  process.exit(1);
}
