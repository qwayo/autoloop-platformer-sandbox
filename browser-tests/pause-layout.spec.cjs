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

async function progress(page) {
  return page.evaluate(() => ({
    position: window.测试位置,
    counter: document.getElementById('counter').textContent,
  }));
}

for (const width of [320, 360, 1280]) {
  for (const textSize of [100, 200]) {
    test(`${width} 像素宽、${textSize}% 文字下暂停内容完整且继续保留进度`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      // 控制帧时钟，从实际绘制记录位置，不修改游戏逻辑。
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
      // 改变文字尺寸，保留实际窄屏宽度，不使用整体页面缩放。
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}%`;
        window.测试帧(0);
      }, textSize);
      const canvasBefore = await page.locator('#game').boundingBox();
      expect(canvasBefore.height).toBeCloseTo(canvasBefore.width * 450 / 960, 1);
      const stageBefore = await page.locator('.stage').boundingBox();

      await advance(page, 21, ['ArrowRight', 'Space']);
      await advance(page, 22);
      const before = await progress(page);
      expect(before.counter).toBe('种子 1 / 3');
      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      await expect(page.locator('#pause')).toBeVisible();
      await expect(page.locator('#resume')).toBeFocused();

      const layout = await page.evaluate(() => {
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        const panel = document.getElementById('pause');
        return {
          panel: box(panel),
          stage: box(document.querySelector('.stage')),
          header: box(document.querySelector('header')),
          touch: box(document.querySelector('.touch-controls')),
          instructions: box(document.getElementById('controls')),
          children: [...panel.children].map((element) => ({
            ...box(element),
            fits: element.scrollWidth <= element.clientWidth + 1
              && element.scrollHeight <= element.clientHeight + 1,
          })),
          fits: panel.scrollWidth <= panel.clientWidth + 1
            && panel.scrollHeight <= panel.clientHeight + 1,
        };
      });
      expect(layout.fits).toBe(true);
      expect(layout.panel.left).toBeGreaterThanOrEqual(0);
      expect(layout.panel.right).toBeLessThanOrEqual(width);
      expect(layout.panel.top).toBeGreaterThanOrEqual(layout.stage.top - 1);
      expect(layout.panel.bottom).toBeLessThanOrEqual(layout.stage.bottom + 1);
      expect(layout.header.bottom).toBeLessThanOrEqual(layout.panel.top);
      expect(layout.touch.top).toBeGreaterThanOrEqual(layout.panel.bottom);
      expect(layout.instructions.top).toBeGreaterThanOrEqual(layout.touch.bottom);
      for (const [index, child] of layout.children.entries()) {
        expect(child.fits).toBe(true);
        expect(child.left).toBeGreaterThanOrEqual(layout.panel.left);
        expect(child.right).toBeLessThanOrEqual(layout.panel.right);
        expect(child.top).toBeGreaterThanOrEqual(layout.panel.top);
        expect(child.bottom).toBeLessThanOrEqual(layout.panel.bottom);
        if (index > 0) {
          expect(child.top).toBeGreaterThanOrEqual(layout.children[index - 1].bottom);
        }
      }
      if (width === 1280 && textSize === 100) {
        expect(layout.stage.bottom - layout.stage.top).toBeCloseTo(stageBefore.height, 1);
      }

      await advance(page, 120);
      expect(await progress(page)).toEqual(before);
      await page.getByRole('button', { name: '继续游戏', exact: true }).click();
      await expect(page.locator('#pause')).toBeHidden();
      await expect(page.locator('#game')).toBeFocused();
      await advance(page, 3);
      expect(await progress(page)).toEqual(before);
      const stageAfter = await page.locator('.stage').boundingBox();
      expect(stageAfter.height).toBeCloseTo(stageBefore.height, 1);
      await advance(page, 2, ['ArrowRight']);
      expect((await progress(page)).position.x).toBeGreaterThan(before.position.x);
    });
  }
}
