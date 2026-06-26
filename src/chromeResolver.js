'use strict';

/**
 * Resolves the Chrome/Chromium executable path at runtime.
 *
 * Puppeteer pins a specific Chrome version at install time. If that exact
 * version is missing from the cache (e.g. a system wipe, cache relocation, or
 * a later `npx puppeteer browsers install chrome` run), the launch fails.
 *
 * Resolution order — stops at the first path that exists:
 *   1. Puppeteer's own executablePath()          — fast path when cache matches
 *   2. Any version in the Puppeteer cache dir     — newest first, all platforms
 *   3. Windows system Chrome / Edge              — LOCALAPPDATA, ProgramFiles
 *   4. Linux system Chrome / Chromium            — /usr/bin, snap
 *   5. macOS system Chrome / Chromium            — /Applications
 *   6. Returns undefined — Puppeteer will throw a descriptive error
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

function resolveChromePath() {
  // 1. Puppeteer's own executablePath — works when the pinned version is cached.
  try {
    const puppeteer = require('puppeteer');
    const exe = puppeteer.executablePath();
    if (exe && fs.existsSync(exe)) return exe;
  } catch { /* puppeteer not resolvable in this context — continue */ }

  // 2. Scan the Puppeteer cache for any installed Chrome version (newest first).
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(cacheDir)) {
    const versions = fs.readdirSync(cacheDir).sort().reverse();
    for (const ver of versions) {
      const candidates = [
        // macOS Apple Silicon
        path.join(cacheDir, ver, 'chrome-mac-arm64',
          'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        // macOS Intel
        path.join(cacheDir, ver, 'chrome-mac-x64',
          'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        // Linux
        path.join(cacheDir, ver, 'chrome-linux64', 'chrome'),
        // Windows
        path.join(cacheDir, ver, 'chrome-win64', 'chrome.exe'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
  }

  // 3. Windows — system Chrome and Edge (Edge is Chromium-based and ships with Windows 11).
  if (process.platform === 'win32') {
    const localAppData  = process.env.LOCALAPPDATA  || '';
    const programFiles  = process.env.ProgramFiles  || 'C:\\Program Files';
    const programFiles86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const windowsCandidates = [
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
    for (const c of windowsCandidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }

  // 4. Linux — standard package manager and snap locations.
  if (process.platform === 'linux') {
    const linuxCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
    ];
    for (const c of linuxCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // 5. macOS — system Chrome and Chromium in /Applications.
  if (process.platform === 'darwin') {
    const macosCandidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      // User-level installation
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ];
    for (const c of macosCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // 6. Give up — Puppeteer will throw its own descriptive "Could not find Chrome" error.
  return undefined;
}

module.exports = { resolveChromePath };
