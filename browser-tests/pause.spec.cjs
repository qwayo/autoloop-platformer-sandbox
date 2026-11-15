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

async function snapshot(page) {
  return page.evaluate(() => ({
    position: window.测试位置,
    counter: document.getElementById('counter').textContent,
    resultHidden: document.getElementById('result').hidden,
    resultTitle: document.getElementById('result-title').textContent,
  }));
}

async function suspend(page, source) {
  if (source === '主动暂停') {
    await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
    return;
  }
  await page.evaluate((kind) => {
    if (kind === '失焦') {
      window.dispatchEvent(new Event('blur'));
    } else {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  }, source);
}

async function returnToGame(page, source) {
  if (source === '主动暂停') return;
  await page.evaluate((kind) => {
    if (kind === '隐藏') {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    }
    window.dispatchEvent(new Event('focus'));
  }, source);
}

for (const source of ['失焦', '隐藏', '主动暂停']) {
  test(`${source}时冻结断崖上方的进度，继续时不补帧或沿用输入`, async ({ page }) => {
    // 控制帧时钟并记录实际绘制坐标，不向游戏添加测试接口。
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
    const start = await snapshot(page);
    const right = ['ArrowRight'];
    const jumpRight = ['ArrowRight', 'Space'];
    await advance(page, 1, jumpRight);
    await advance(page, 20, right);
    await advance(page, 22);
    await advance(page, 1, jumpRight);
    await advance(page, 46, right);
    await advance(page, 1, jumpRight);
    await advance(page, 7, right);
    const airborne = await snapshot(page);
    expect(airborne.position.x).toBeGreaterThan(420);
    expect(airborne.position.x).toBeLessThan(504 - 26);
    expect(airborne.position.y).toBeLessThan(start.position.y);
    expect(airborne.counter).toBe('种子 1 / 3');
    expect(airborne.resultHidden).toBe(true);

    // 保留按下状态，验证各种暂停入口都会清空移动和跳跃输入。
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await suspend(page, source);
    await expect(page.locator('#pause')).toBeVisible();
    await expect(page.locator('#pause-button')).toBeDisabled();
    if (source === '主动暂停') {
      await expect(page.getByRole('button', { name: '继续游戏' })).toBeFocused();
    }
    await advance(page, 600);
    expect(await snapshot(page)).toEqual(airborne);
    await returnToGame(page, source);
    await advance(page, 60);
    expect(await snapshot(page)).toEqual(airborne);
    await expect(page.locator('#pause')).toBeVisible();

    // 暂停期间的输入也不能进入下一段游戏。
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('r');
    await advance(page, 1);
    expect(await snapshot(page)).toEqual(airborne);
    await expect(page.getByRole('button', { name: '继续游戏' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pause')).toBeHidden();
    await expect(page.locator('#pause-button')).toBeEnabled();
    await expect(page.locator('#game')).toBeFocused();

    // 即使恢复后的首帧相隔一分钟，也不补算暂停期间的时间。
    await page.evaluate(() => {
      window.测试时刻 += 60000;
      window.测试帧(window.测试时刻);
    });
    expect(await snapshot(page)).toEqual(airborne);
    await advance(page, 2);
    expect((await snapshot(page)).position.x).toBe(airborne.position.x);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    await advance(page, 60);
    expect((await snapshot(page)).resultHidden).toBe(false);
    await expect(page.locator('#result-title')).toHaveText('掉下山谷了');
    await expect(page.locator('#pause-button')).toBeDisabled();
    await page.evaluate(() => document.getElementById('pause-button').click());
    await suspend(page, '失焦');
    await expect(page.locator('#pause')).toBeHidden();

    await page.getByRole('button', { name: '重试', exact: true }).click();
    await advance(page, 1);
    expect((await snapshot(page)).position).toEqual(start.position);

    // 在地面排队的跳跃必须清除，避免空中测试掩盖残留跳跃。
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await suspend(page, source);
    await advance(page, 120);
    await returnToGame(page, source);
    await page.keyboard.press('ArrowUp');
    await page.getByRole('button', { name: '继续游戏' }).click();
    await advance(page, 3);
    expect((await snapshot(page)).position).toEqual(start.position);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    await advance(page, 1, jumpRight);
    const moving = await snapshot(page);
    expect(moving.position.x).toBeGreaterThan(start.position.x);
    expect(moving.position.y).toBeLessThan(start.position.y);

    if (source === '主动暂停') {
      // 空格可激活暂停和继续按钮，不能同时把跳跃排入游戏。
      await page.keyboard.press('r');
      await advance(page, 1);
      await expect(page.locator('#pause-button')).toBeEnabled();
      await page.locator('#pause-button').focus();
      await page.keyboard.press('Space');
      await expect(page.locator('#pause')).toBeVisible();
      await expect(page.locator('#resume')).toBeFocused();
      await advance(page, 120);
      expect((await snapshot(page)).position).toEqual(start.position);
      await page.keyboard.press('Space');
      await expect(page.locator('#pause')).toBeHidden();
      await advance(page, 3);
      expect((await snapshot(page)).position).toEqual(start.position);

      // 通关后也不能通过主动入口或失焦事件打开暂停面板。
      await page.keyboard.press('r');
      await advance(page, 1);
      await advance(page, 21, jumpRight);
      await advance(page, 22);
      await advance(page, 47, jumpRight);
      await advance(page, 41, jumpRight);
      await advance(page, 31, jumpRight);
      await advance(page, 27, right);
      await advance(page, 12);
      await advance(page, 42, jumpRight);
      await advance(page, 11, right);
      await advance(page, 43, jumpRight);
      await advance(page, 30, jumpRight);
      await advance(page, 22);
      await advance(page, 36, right);
      await expect(page.locator('#result-title')).toHaveText('已到达旗子');
      await expect(page.locator('#pause-button')).toBeDisabled();
      await page.evaluate(() => document.getElementById('pause-button').click());
      await suspend(page, '失焦');
      await expect(page.locator('#pause')).toBeHidden();
      await expect(page.locator('#result')).toBeVisible();
      await page.getByRole('button', { name: '再玩一次', exact: true }).click();
      await expect(page.locator('#pause-button')).toBeEnabled();
    }
  });
}
