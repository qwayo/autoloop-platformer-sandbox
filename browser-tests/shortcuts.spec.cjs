'use strict';

const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function advance(page, frames) {
  await page.evaluate((count) => {
    for (let i = 0; i < count; i += 1) {
      window.测试时刻 += 1000 / 60 + 0.001;
      window.测试帧(window.测试时刻);
    }
  }, frames);
}

async function position(page) {
  return page.evaluate(() => window.测试位置);
}

async function sendKey(page, type, code, modifiers = {}) {
  return page.evaluate(({ type, code, modifiers }) => {
    // 合成事件不会执行浏览器快捷键，但可以检查游戏是否取消默认行为。
    const event = new KeyboardEvent(type, {
      code,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, code, modifiers });
}

async function press(page, code) {
  expect(await sendKey(page, 'keydown', code)).toBe(true);
  await advance(page, 2);
  await sendKey(page, 'keyup', code);
}

test.beforeEach(async ({ page }) => {
  // 沿用现有浏览器测试的帧时钟和绘制坐标观测方式。
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

for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
  for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyR', 'KeyA', 'KeyD']) {
    test(`${modifier} + ${code} 不取消默认行为，也不记录游戏输入`, async ({ page }) => {
      const start = await position(page);
      await press(page, 'KeyD');
      const moved = await position(page);
      expect(moved.x).toBeGreaterThan(start.x);

      // 在离开出生点后检查，确保组合键 R 不能悄悄重开游戏。
      expect(await sendKey(page, 'keydown', code, { [modifier]: true })).toBe(false);
      await advance(page, 2);
      expect(await position(page)).toEqual(moved);

      // 先松开修饰键，游戏按键仍保持按下；不能残留移动或跳跃。
      const modifierCode = { ctrlKey: 'ControlLeft', metaKey: 'MetaLeft', altKey: 'AltLeft' }[modifier];
      await sendKey(page, 'keyup', modifierCode);
      await advance(page, 2);
      expect(await position(page)).toEqual(moved);
      expect(await sendKey(page, 'keyup', code)).toBe(false);
      await advance(page, 2);
      expect(await position(page)).toEqual(moved);
    });
  }
}

test('普通方向键、A/D、空格和 R 保留游戏操作', async ({ page }) => {
  const start = await position(page);
  for (const code of ['ArrowRight', 'KeyD', 'ArrowLeft', 'KeyA']) {
    const before = await position(page);
    await press(page, code);
    const after = await position(page);
    if (code === 'ArrowRight' || code === 'KeyD') expect(after.x).toBeGreaterThan(before.x);
    else expect(after.x).toBeLessThan(before.x);
  }
  for (const code of ['ArrowUp', 'Space']) {
    await press(page, code);
    expect((await position(page)).y).toBeLessThan(start.y);
    await press(page, 'KeyR');
    expect(await position(page)).toEqual(start);
    await expect(page.locator('#game')).toBeFocused();
  }
  await press(page, 'KeyD');
  expect((await position(page)).x).toBeGreaterThan(start.x);
  await press(page, 'KeyR');
  expect(await position(page)).toEqual(start);
});

test('松开普通移动键时即使带修饰键也会清除输入', async ({ page }) => {
  const start = await position(page);
  await sendKey(page, 'keydown', 'KeyD');
  await advance(page, 2);
  const moved = await position(page);
  expect(moved.x).toBeGreaterThan(start.x);
  expect(await sendKey(page, 'keyup', 'KeyD', { ctrlKey: true })).toBe(false);
  await advance(page, 3);
  expect(await position(page)).toEqual(moved);
});
