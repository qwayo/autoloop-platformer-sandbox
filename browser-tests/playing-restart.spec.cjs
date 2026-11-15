'use strict';

const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function advance(page, frames, keys = []) {
  for (const key of keys) await page.keyboard.down(key);
  await page.evaluate((count) => {
    for (let i = 0; i < count; i += 1) {
      window.测试时刻 += 1000 / 60 + 0.001;
      window.测试帧(window.测试时刻);
    }
  }, frames);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

async function position(page) {
  return page.evaluate(() => window.测试位置);
}

async function collectFirstSeed(page) {
  await advance(page, 1, ['ArrowRight', 'Space']);
  await advance(page, 20, ['ArrowRight']);
  await advance(page, 22);
  await expect(page.locator('#counter')).toHaveText('种子 1 / 3');
}

test.beforeEach(async ({ page }) => {
  // 观察实际绘制坐标并手动推进帧，不向游戏添加测试接口。
  await page.addInitScript(() => {
    window.测试时刻 = 0;
    window.requestAnimationFrame = (callback) => {
      window.测试帧 = callback;
      return 1;
    };
    const translate = CanvasRenderingContext2D.prototype.translate;
    const scale = CanvasRenderingContext2D.prototype.scale;
    let playerPosition;
    CanvasRenderingContext2D.prototype.translate = function (x, y) {
      playerPosition = y !== 0 ? { x, y } : null;
      return translate.call(this, x, y);
    };
    CanvasRenderingContext2D.prototype.scale = function (x, y) {
      if (playerPosition) {
        window.测试位置 = {
          x: playerPosition.x - (x < 0 ? 26 : 0),
          y: playerPosition.y,
        };
        playerPosition = null;
      }
      return scale.call(this, x, y);
    };
  });
  await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  await page.bringToFront();
  await page.evaluate(() => window.测试帧(0));
});

for (const activation of ['触屏', '鼠标', '回车', '空格']) {
  test(`游玩中用${activation}重新开始，清空进度和输入并恢复操作`, async ({ page }) => {
    const start = await position(page);
    const restart = page.getByRole('button', { name: '重新开始', exact: true });
    await expect(restart).toBeVisible();
    await expect(restart).toBeEnabled();
    const box = await restart.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    await collectFirstSeed(page);
    expect((await position(page)).x).toBeGreaterThan(start.x);

    if (activation === '回车' || activation === '空格') {
      // 通过真实 Tab 顺序访问按钮，检查键盘可达性。
      await page.locator('#game').focus();
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        if (await restart.evaluate((button) => document.activeElement === button)) break;
      }
      await expect(restart).toBeFocused();
    }

    // 在重开前留下尚未消费的移动和跳跃输入。
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');
    let client;
    if (activation === '触屏') {
      client = await page.context().newCDPSession(page);
      const points = [];
      for (const [index, selector] of [
        '[data-touch-action="right"]',
        '[data-touch-action="jump"]',
        '#restart-button',
      ].entries()) {
        const bounds = await page.locator(selector).boundingBox();
        points.push({ id: index + 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
      }
      // 两指按住方向和跳跃，第三指点按重开。
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, 1) });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, 2) });
      await expect(page.locator('.is-held')).toHaveCount(2);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points.slice(0, 2) });
    } else if (activation === '鼠标') {
      await restart.click();
    } else {
      await page.keyboard.press(activation === '回车' ? 'Enter' : 'Space');
    }

    await expect(page.locator('#counter')).toHaveText('种子 0 / 3');
    await expect(page.locator('#game')).toBeFocused();
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#pause')).toBeHidden();
    await expect(page.locator('.is-held')).toHaveCount(0);
    await advance(page, 4);
    expect(await position(page)).toEqual(start);
    if (client) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
    }
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowRight');
    await advance(page, 3);
    expect(await position(page)).toEqual(start);

    // 重开后能正常移动、起跳，并再次拾取同一颗种子。
    await advance(page, 1, ['ArrowRight', 'Space']);
    expect((await position(page)).x).toBeGreaterThan(start.x);
    expect((await position(page)).y).toBeLessThan(start.y);
    await advance(page, 20, ['ArrowRight']);
    await advance(page, 22);
    await expect(page.locator('#counter')).toHaveText('种子 1 / 3');
    await expect(restart).toBeEnabled();
  });
}
