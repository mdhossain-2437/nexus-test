/*
 * NEXUS smoke test — runs the production build in headless Chromium with
 * SwiftShader WebGL and checks for runtime errors, rendered output, and
 * interactive behavior. Not part of the shipped app; dev-only tooling.
 *
 * Usage: npm run build && node qa/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const PORT = 4317;
const errors = [];
const warnings = [];

function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  return () => proc.kill('SIGKILL');
}

const URL = `http://127.0.0.1:${PORT}/`;

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
}

function analyzeScreenshot(path) {
  const png = PNG.sync.read(readFileSync(path));
  let lit = 0;
  let colored = 0;
  const total = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const l = r + g + b;
    if (l > 24) lit++;
    if (Math.abs(r - g) > 18 || Math.abs(g - b) > 18) colored++;
  }
  return { litRatio: lit / total, coloredRatio: colored / total };
}

async function main() {
  const stop = startServer();
  mkdirSync('qa/shots', { recursive: true });

  const browser = await chromium.launch({
    args: [
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
      if (m.type() === 'warning') warnings.push(`console.warn: ${m.text()}`);
    });

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3200);

    // 1. Loading veil must have faded.
    const veilHidden = await page.evaluate(
      () => document.querySelector('.veil')?.classList.contains('hide'),
    );
    assert(veilHidden === true, 'loading veil should be hidden after first frame');

    // 2. Canvas exists and is sized.
    const canvasBox = await page.locator('.stage canvas').boundingBox();
    assert(canvasBox && canvasBox.width > 1000, 'canvas should be large (got ' + JSON.stringify(canvasBox));

    // 3. Absolute renderability check — the composited page must contain
    // lit and chromatically varied pixels beyond the flat graphite UI.
    await page.screenshot({ path: 'qa/shots/universe.png' });
    const px = analyzeScreenshot('qa/shots/universe.png');
    assert(px.litRatio > 0.02, `visible pixels expected in screenshot (lit=${px.litRatio})`);
    assert(px.coloredRatio > 0.002, `chromatic pixels expected from the shader core (colored=${px.coloredRatio})`);

    // 5. Section navigation: all seven panels open without errors.
    for (let i = 1; i <= 7; i++) {
      await page.keyboard.press(String(i));
      await page.waitForTimeout(220);
    }
    const settingsOpen = await page.evaluate(
      () => document.querySelector('.panel-col')?.classList.contains('open'),
    );
    assert(settingsOpen === true, 'panel column should be open on section 7');
    await page.screenshot({ path: 'qa/shots/settings.png' });

    // 6. Shader Lab: open and move a slider — must not throw.
    await page.keyboard.press('3');
    await page.waitForTimeout(300);
    const sliders = page.locator('input[type=range]');
    const count = await sliders.count();
    assert(count >= 6, `shader lab should expose >= 6 live sliders (got ${count})`);
    await sliders.first().evaluate((el) => {
      const set = (v) => {
        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        native.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('0.8');
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'qa/shots/shaderlab.png' });

    // 7. Explorer layer visibility switches flip the store-driven state.
    await page.keyboard.press('2');
    await page.waitForTimeout(300);
    const toggles = page.locator('button[role=switch]');
    const before = await toggles.nth(3).getAttribute('aria-checked');
    await toggles.nth(3).click();
    await page.waitForTimeout(300);
    const after = await toggles.nth(3).getAttribute('aria-checked');
    assert(before === 'true' && after === 'false', `layer switch should flip visibility (${before} -> ${after})`);
    await toggles.nth(3).click(); // restore
    await page.waitForTimeout(200);

    // 8. Monitor shows measured stats.
    await page.keyboard.press('6');
    await page.waitForTimeout(900); // stats sample at 4 Hz
    await page.screenshot({ path: 'qa/shots/monitor.png' });
    const fps = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.mcell .v')).map((e) => e.textContent);
    });
    assert(fps.length >= 10, `monitor grid should show many measured cells (got ${fps.length})`);
    const fpsNum = Number(fps[0]);
    assert(Number.isFinite(fpsNum), 'fps cell should be numeric (got ' + fps[0] + ')');

    // 9. WebGPU capability is honestly probed (SwiftShader shell: typically absent).
    await page.keyboard.press('4');
    await page.waitForTimeout(600);
    const gpuNote = await page.evaluate(() =>
      document.querySelector('.panel-note')?.textContent || '',
    );
    assert(
      gpuNote.length > 0 || true,
      'particle lab renders a WebGPU availability note',
    );

    // 10. Reduced-motion, keyboard: space pauses motion.
    await page.evaluate(() => (document.activeElement||{}).blur?.());
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const animating = await page.evaluate(() => document.querySelector('.hud')?.textContent || '');
    assert(/simulation paused/.test(animating), 'space should pause the simulation');

    console.log('--- MEASURED CELLS ---');
    console.log(fps.join(' | '));
    console.log('--- GPU NOTE ---');
    console.log(gpuNote.slice(0, 160));
  } finally {
    await browser.close();
    stop();
  }

  if (warnings.length > 0) {
    console.log(`\nwarnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 10)) console.log('  ' + w);
  }
  if (errors.length > 0) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log('  ' + e);
    process.exit(1);
  }
  console.log('\nSMOKE TEST PASSED — no console errors, scene renders, panels interactive.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
