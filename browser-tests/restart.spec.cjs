'use strict';

const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

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

for (const outcome of ['跌落', '通关']) {
  for (const activation of ['鼠标', '回车', '空格']) {
    test(`${outcome}后用${activation}重玩，立即恢复游戏输入`, async ({ page }) => {
      // 手动推进真实游戏帧，避免机器速度影响路线与输入断言。
      await page.addInitScript(() => {
        window.测试时刻 = 0;
        window.requestAnimationFrame = (callback) => {
          window.测试帧 = callback;
          return 1;
        };
        const translate = CanvasRenderingContext2D.prototype.translate;
        CanvasRenderingContext2D.prototype.translate = function (x, y) {
          if (y !== 0) window.测试位置 = { x, y };
          return translate.call(this, x, y);
        };
      });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.evaluate(() => window.测试帧(0));
      const start = await position(page);
      const right = ['ArrowRight'];
      const jumpRight = ['ArrowRight', 'Space'];
      await advance(page, 1, jumpRight);
      await advance(page, 20, right);
      await advance(page, 22);
      await advance(page, 1, jumpRight);
      await advance(page, 46, right);

      if (outcome === '跌落') {
        await advance(page, 70, right);
      } else {
        // 每段只在第一帧起跳，与逻辑测试的通关路线一致。
        for (const [frames, jump] of [
          [41, true], [31, true], [27, false], [12, null],
          [42, true], [11, false], [43, true], [30, true],
          [22, null], [36, false],
        ]) {
          if (jump) {
            await advance(page, 1, jumpRight);
            await advance(page, frames - 1, right);
          } else {
            await advance(page, frames, jump === null ? [] : right);
          }
        }
      }

      const retry = page.getByRole('button', { name: outcome === '通关' ? '再玩一次' : '重试' });
      await expect(page.locator('#result-title')).toHaveText(outcome === '通关' ? '已到达旗子' : '掉下山谷了');
      await expect(retry).toBeFocused();
      if (activation === '鼠标') await retry.click();
      else await page.keyboard.press(activation === '回车' ? 'Enter' : 'Space');
      await expect(page.locator('#result')).toBeHidden();
      await expect(page.locator('#game')).toBeFocused();
      await advance(page, 1);
      expect(await position(page)).toEqual(start);

      await page.keyboard.press('Space');
      await advance(page, 1);
      expect((await position(page)).y).toBeLessThan(start.y);
      await expect(page.locator('#result')).toBeHidden();
      await advance(page, 1, right);
      expect((await position(page)).x).toBeGreaterThan(start.x);
      await advance(page, 2, ['ArrowLeft']);
      expect((await position(page)).x).toBeLessThan(start.x);
      await page.keyboard.press('r');
      await advance(page, 1);
      expect(await position(page)).toEqual(start);
      await expect(page.locator('#game')).toBeFocused();
      await page.keyboard.press('Space');
      await advance(page, 1);
      expect((await position(page)).y).toBeLessThan(start.y);
    });
  }
}
