const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, '../../index.html');

test('annotation anchor and box drag updates state and leader alignment', async ({ page }) => {
  await page.goto(fileUrl);
  await page.waitForSelector('#wrap');

  await page.click('#addAnno');
  await page.click('#wrap', { position: { x: 420, y: 320 } });
  await page.fill('#annoInput', 'Тестовая выноска');
  await page.click('#annoOk');

  const before = await page.evaluate(() => {
    const state = window.__BUS_STATE__;
    const view = window.viewMode;
    return { ...state.annos[0].pos[view] };
  });

  const anchor = page.locator('.anchor-dot').first();
  await anchor.dragTo(page.locator('#wrap'), { targetPosition: { x: 520, y: 280 } });

  const box = page.locator('.anno').first();
  await box.dragTo(page.locator('#wrap'), { targetPosition: { x: 580, y: 360 } });

  const after = await page.evaluate(() => {
    const state = window.__BUS_STATE__;
    const view = window.viewMode;
    return { ...state.annos[0].pos[view] };
  });

  expect(after.ax).not.toBeCloseTo(before.ax);
  expect(after.ay).not.toBeCloseTo(before.ay);
  expect(after.bx).not.toBeCloseTo(before.bx);
  expect(after.by).not.toBeCloseTo(before.by);

  const alignment = await page.evaluate(() => {
    const wrapRect = document.getElementById('wrap').getBoundingClientRect();
    const anchorEl = document.querySelector('.anchor-dot');
    const boxEl = document.querySelector('.anno');
    const lineEl = document.querySelector('.anno-line');
    const anchorRect = anchorEl.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();

    const ax = anchorRect.left - wrapRect.left + anchorRect.width / 2;
    const ay = anchorRect.top - wrapRect.top + anchorRect.height / 2;
    const tx = Math.max(boxRect.left - wrapRect.left, Math.min(boxRect.right - wrapRect.left, ax));
    const ty = Math.max(boxRect.top - wrapRect.top, Math.min(boxRect.bottom - wrapRect.top, ay));

    const angleMatch = /rotate\(([-\d.]+)deg\)/.exec(lineEl.style.transform || '') || ['0', '0'];
    const angle = (parseFloat(angleMatch[1]) * Math.PI) / 180;
    const length = parseFloat(lineEl.style.width);

    const lineStart = {
      x: lineRect.left - wrapRect.left,
      y: lineRect.top - wrapRect.top,
    };
    const lineEnd = {
      x: lineStart.x + Math.cos(angle) * length,
      y: lineStart.y + Math.sin(angle) * length,
    };

    return {
      anchorGap: Math.hypot(lineStart.x - ax, lineStart.y - ay),
      boxGap: Math.hypot(lineEnd.x - tx, lineEnd.y - ty),
    };
  });

  expect(alignment.anchorGap).toBeLessThan(1.5);
  expect(alignment.boxGap).toBeLessThan(1.5);
});
