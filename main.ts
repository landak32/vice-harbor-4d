// Vice Harbor — make.fun entry builder.
//
// WHAT GETS HANDED IN
// -------------------
// Two directories sit beside this file and together are the whole entry:
//
//   game/         the playable build as plain static files: game/index.html is the page the browser
//                 opens, game/src/*.js are the ES modules it imports, game/vendor/three.module.min.js
//                 is the library those modules import. No bundler, no install, no network.
//   screenshots/  three or four renders of the running game (PNG or JPEG). Sorted by name, the first
//                 one is the cover.
//
// `node main.ts` measures both directories against the scorer's caps, mirrors them into the output
// directory (MAKEFUN_OUTPUT_DIR, ./out by default, created if it is missing), then writes
// <out>/dossier.json from the vendored library at ./vendor/makefun-game.ts. The judge recomputes that
// dossier with its own byte-identical copy of the library, so this program must not reshape anything:
// the same game/ and screenshots/ have to yield the same bytes.
//
// The caps are measured BEFORE the copy starts. A violation prints one line naming the cap that broke
// and exits 1, so a refused entry is never left half-written on disk.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts    build the entry
//   node main.ts --serve [--port 8080]                     serve game/ to a browser
//
// Caps enforced here: at most 4 screenshots, each at most 262144 bytes; game/ under 993 entries
// (files and directories counted alike) and under 50331648 bytes; no path under game/ over 1000
// UTF-8 bytes; the dossier's text field under 163840 bytes.

import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The scorer's numbers in one place, so the preflight and the dossier call cannot drift apart. */
const CAPS = {
  shots: 4,
  shotBytes: 262144,
  gameEntries: 993,
  gameBytes: 50331648,
  pathBytes: 1000,
  dossierText: 163840,
};

/** game/ and screenshots/ are read from the directory holding this script. */
const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, 'game');
const SHOTS = join(HERE, 'screenshots');

/** End the build with one readable line: the scorer would refuse this entry anyway. */
function bail(why: string): never {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
}

/** What walking a directory adds up to, in the units the scorer uses. */
type Totals = {
  /** Files plus directories, the way the platform counts entries. */
  entries: number;
  /** Sum of file sizes; directories weigh nothing. */
  bytes: number;
  /** Longest relative path, in UTF-8 bytes. */
  longestPath: number;
};

/**
 * Total up a directory tree. Directories are descended into and counted; symlinks and other special
 * files are refused, because the scorer refuses them and copying around them would produce a dossier
 * that disagrees with the judge's.
 */
function measure(root: string): Totals {
  const totals: Totals = { entries: 0, bytes: 0, longestPath: 0 };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const info = statSync(abs);
      const isDir = info.isDirectory();
      if (!isDir && !info.isFile()) bail(`${relative(HERE, abs)} is a symlink or special file`);
      totals.entries += 1;
      const len = Buffer.byteLength(relative(root, abs).split(sep).join('/'), 'utf8');
      if (len > totals.longestPath) totals.longestPath = len;
      if (isDir) walk(abs);
      else totals.bytes += info.size;
    }
  };
  walk(root);
  return totals;
}

/** The images that make up the entry: visible regular files with a PNG or JPEG extension, by name. */
function collectShots(): string[] {
  if (!existsSync(SHOTS)) bail('screenshots/ does not exist');
  return readdirSync(SHOTS)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => statSync(join(SHOTS, name)).isFile())
    .filter((name) => /\.(png|jpe?g)$/i.test(name))
    .sort();
}

/** Measure the entry against every cap; returns the screenshot names for the copy step. */
function preflight(): string[] {
  if (!existsSync(join(GAME, 'index.html'))) bail('game/index.html is missing: the game has no page to open');

  const tree = measure(GAME);
  if (tree.entries >= CAPS.gameEntries) bail(`game/ has ${tree.entries} entries, cap is under ${CAPS.gameEntries}`);
  if (tree.bytes >= CAPS.gameBytes) bail(`game/ is ${tree.bytes} bytes, cap is under ${CAPS.gameBytes}`);
  if (tree.longestPath > CAPS.pathBytes) {
    bail(`a path under game/ is ${tree.longestPath} bytes, cap is ${CAPS.pathBytes}`);
  }

  const shots = collectShots();
  if (shots.length === 0) bail('screenshots/ holds no PNG or JPEG: the entry needs a cover');
  if (shots.length > CAPS.shots) bail(`screenshots/ has ${shots.length} images, cap is ${CAPS.shots}`);
  for (const name of shots) {
    const size = statSync(join(SHOTS, name)).size;
    if (size > CAPS.shotBytes) bail(`screenshots/${name} is ${size} bytes, cap is ${CAPS.shotBytes}`);
  }
  return shots;
}

/** Mirror game/ and the screenshots into `out`, creating every directory it needs. */
function stage(out: string, shots: string[]): void {
  mkdirSync(out, { recursive: true });

  const mirror = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      const src = join(from, name);
      const dst = join(to, name);
      if (statSync(src).isDirectory()) mirror(src, dst);
      else copyFileSync(src, dst);
    }
  };

  mirror(GAME, join(out, 'game'));
  const shotOut = join(out, 'screenshots');
  mkdirSync(shotOut, { recursive: true });
  for (const name of shots) copyFileSync(join(SHOTS, name), join(shotOut, name));
}

/* ------------------------------------------------------------------ static server */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serve game/ read-only on `port`. Nothing outside game/ is reachable through it. */
function serveGame(port: number): void {
  const base = resolve(GAME);

  createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const wanted = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = resolve(join(base, wanted));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    let size: number;
    try {
      const info = statSync(file);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(size),
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  }).listen(port, () => {
    console.log(`game/ served at http://localhost:${port}`);
  });
}

/* ------------------------------------------------------------------ entry */

const argv = process.argv.slice(2);

if (argv.includes('--serve')) {
  const at = argv.indexOf('--port');
  const asked = at === -1 ? 8080 : Number(argv[at + 1]);
  serveGame(Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : 8080);
} else {
  const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? './out');

  const shots = preflight();
  stage(out, shots);

  const dossier = buildDossier(out, {
    text_max_bytes: CAPS.dossierText,
    screenshots: { max: CAPS.shots, max_bytes: CAPS.shotBytes },
    game_max_files: CAPS.gameEntries,
    game_max_bytes: CAPS.gameBytes,
    game_path_max_bytes: CAPS.pathBytes,
  });
  const dossierPath = join(out, 'dossier.json');
  writeFileSync(dossierPath, dossier);

  // The cap is on the dossier's `text` string, not on the file: base64 renders ride in the same
  // document, so the file is always the bigger of the two. Read the field back and check what the
  // scorer actually measures.
  const onDisk = readFileSync(dossierPath);
  const textBytes = Buffer.byteLength((JSON.parse(onDisk.toString('utf8')) as { text: string }).text, 'utf8');
  if (textBytes >= CAPS.dossierText) bail(`dossier text is ${textBytes} bytes, cap is under ${CAPS.dossierText}`);

  console.log(`wrote ${dossierPath} (${onDisk.byteLength} bytes, text ${textBytes} of ${CAPS.dossierText})`);
  console.log(`copied game/ and ${shots.length} screenshot(s) into ${out}`);
}
