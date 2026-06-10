import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Get current git commit hash
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  console.warn('Could not get git commit');
}

// Get current version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const version = packageJson.version || '1.0.0';

// Create version.json
const versionData = {
  version,
  timestamp: new Date().toISOString(),
  commit,
};

// Write to public/version.json
const versionJsonPath = path.join('public', 'version.json');
fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));
console.log(`✓ Updated ${versionJsonPath} with version ${version} (commit: ${commit})`);
