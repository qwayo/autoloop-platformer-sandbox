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

async function focusAction(page, action) {
  const button = page.locator(`[data-touch-action="${action}"]`);
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    if (await button.evaluate((element) => element === document.activeElement)) return button;
  }
  await expect(button).toBeFocused();
  return button;
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

for (const key of ['Space', 'Enter']) {
  for (const action of ['left', 'right']) {
    test(`Tab 聚焦 ${action} 后按住 ${key} 只移动，松键后停止`, async ({ page }) => {
      const start = await position(page);
      const button = await focusAction(page, action);
      await page.keyboard.down(key);
      await advance(page, 2);
      const moved = await position(page);
      expect(moved.y).toBe(start.y);
      if (action === 'left') expect(moved.x).toBeLessThan(start.x);
      else expect(moved.x).toBeGreaterThan(start.x);
      await expect(button).toHaveClass(/is-held/);
      await page.keyboard.down(key);
      await advance(page, 2);
      const held = await position(page);
      expect(held.y).toBe(start.y);
      if (action === 'left') expect(held.x).toBeLessThan(moved.x);
      else expect(held.x).toBeGreaterThan(moved.x);
      await page.keyboard.up(key);
      await advance(page, 3);
      expect(await position(page)).toEqual(held);
      await expect(button).not.toHaveClass(/is-held/);
    });
  }

  test(`Tab 聚焦跳跃后 ${key} 每次按下只起跳一次`, async ({ page }) => {
    const start = await position(page);
    await focusAction(page, 'jump');
    await page.keyboard.down(key);
    await advance(page, 2);
    expect((await position(page)).y).toBeLessThan(start.y);
    await advance(page, 60);
    expect(await position(page)).toEqual(start);
    await page.keyboard.down(key);
    await advance(page, 3);
    expect(await position(page)).toEqual(start);
    await page.keyboard.up(key);
    // 在下一帧前松键，仍保留本次明确按下产生的跳跃。
    await page.keyboard.press(key);
    await advance(page, 2);
    expect((await position(page)).y).toBeLessThan(start.y);
  });

  for (const action of ['right', 'jump']) {
    for (const source of ['焦点离开', '暂停', '失焦', '隐藏', '重开']) {
      test(`${action} 的 ${key} 输入在${source}后清除`, async ({ page }) => {
        const start = await position(page);
        const button = await focusAction(page, action);
        await page.keyboard.down(key);
        // 不推进帧，同时检查尚未消费的跳跃是否被清除。
        if (source === '焦点离开') {
          await page.keyboard.press('Tab');
        } else if (source === '暂停') {
          await page.locator('#pause-button').click();
        } else if (source === '重开') {
          await page.keyboard.press('r');
        } else {
          await page.evaluate((kind) => {
            if (kind === '失焦') window.dispatchEvent(new Event('blur'));
            else {
              Object.defineProperty(document, 'hidden', { configurable: true, value: true });
              document.dispatchEvent(new Event('visibilitychange'));
            }
          }, source);
        }
        await expect(button).not.toHaveClass(/is-held/);
        if (['暂停', '失焦', '隐藏'].includes(source)) {
          await expect(page.locator('#pause')).toBeVisible();
          await page.evaluate(() => {
            delete document.hidden;
            window.dispatchEvent(new Event('focus'));
          });
          await page.locator('#resume').click();
        }
        await advance(page, 3);
        expect(await position(page)).toEqual(start);
        await focusAction(page, action);
        // 原键仍按住时的自动重复不能重新激活已清除的输入。
        await page.keyboard.down(key);
        await advance(page, 3);
        expect(await position(page)).toEqual(start);
        await page.keyboard.up(key);
        await page.keyboard.down(key);
        await advance(page, 2);
        if (action === 'right') expect((await position(page)).x).toBeGreaterThan(start.x);
        else expect((await position(page)).y).toBeLessThan(start.y);
        await page.keyboard.up(key);
      });
    }
  }
}

for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
  for (const code of ['Space', 'Enter']) {
    test(`操作按钮保留 ${modifier} + ${code} 的浏览器默认行为`, async ({ page }) => {
      const start = await position(page);
      await focusAction(page, 'right');
      const prevented = await page.evaluate(({ modifier, code }) => {
        const event = new KeyboardEvent('keydown', {
          code, bubbles: true, cancelable: true, [modifier]: true,
        });
        document.activeElement.dispatchEvent(event);
        return event.defaultPrevented;
      }, { modifier, code });
      expect(prevented).toBe(false);
      await advance(page, 3);
      expect(await position(page)).toEqual(start);
      await expect(page.locator('.is-held')).toHaveCount(0);
    });
  }
}

test('按钮键盘输入与原有方向快捷键分别释放', async ({ page }) => {
  const button = await focusAction(page, 'right');
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await advance(page, 2);
  const before = await position(page);
  await page.keyboard.up('Space');
  await advance(page, 2);
  expect((await position(page)).x).toBeGreaterThan(before.x);
  await expect(button).not.toHaveClass(/is-held/);
  await page.keyboard.down('Space');
  await page.keyboard.up('ArrowRight');
  const released = await position(page);
  await advance(page, 2);
  expect((await position(page)).x).toBeGreaterThan(released.x);
  await page.keyboard.up('Space');
  const stopped = await position(page);
  await advance(page, 3);
  expect(await position(page)).toEqual(stopped);
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
