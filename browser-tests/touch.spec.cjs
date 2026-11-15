'use strict';

const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test.use({ viewport: { width: 800, height: 800 }, hasTouch: true });

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

async function setup(page) {
  await page.addInitScript(() => {
    window.测试时刻 = 0;
    window.测试指针 = {};
    window.requestAnimationFrame = (callback) => {
      window.测试帧 = callback;
      return 1;
    };
    document.addEventListener('pointerdown', (event) => {
      const action = event.target.dataset.touchAction;
      if (action) window.测试指针[action] = event.pointerId;
    }, true);
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
  const client = await page.context().newCDPSession(page);
  const points = {};
  for (const [index, action] of ['left', 'right', 'jump'].entries()) {
    const box = await page.locator(`[data-touch-action="${action}"]`).boundingBox();
    points[action] = { id: index + 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return {
    points,
    async touch(type, actions = []) {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: actions.map((action) => points[action]),
      });
    },
    async moveOutside() {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...points.right, x: 5, y: 5 }],
      });
    },
  };
}

for (const moving of [false, true]) {
  test(`快速点按跳跃在下一物理帧起跳${moving ? '，同时保留方向输入' : ''}`, async ({ page }) => {
    const { touch } = await setup(page);
    const start = await position(page);
    if (moving) await touch('touchStart', ['right']);
    await touch('touchStart', moving ? ['right', 'jump'] : ['jump']);
    await touch('touchEnd', moving ? ['right'] : []);
    await expect(page.locator('[data-touch-action="jump"]')).not.toHaveClass(/is-held/);
    expect(await position(page)).toEqual(start);

    await advance(page, 2);
    const jumped = await position(page);
    expect(jumped.y).toBeLessThan(start.y);
    if (moving) expect(jumped.x).toBeGreaterThan(start.x);
    else expect(jumped.x).toBe(start.x);
    if (moving) await touch('touchEnd');
    await advance(page, 60);
    expect(await position(page)).toEqual({ x: jumped.x, y: start.y });
  });
}

test('长按跳跃落地后不会再次起跳', async ({ page }) => {
  const { touch } = await setup(page);
  const start = await position(page);
  await touch('touchStart', ['jump']);
  await advance(page, 2);
  expect((await position(page)).y).toBeLessThan(start.y);
  await advance(page, 60);
  expect(await position(page)).toEqual(start);
  await advance(page, 3);
  expect(await position(page)).toEqual(start);
  await touch('touchEnd');
  await advance(page, 3);
  expect(await position(page)).toEqual(start);
});

test('真实多指触屏可同时移动和跳跃，松手后停止且不连续起跳', async ({ page }) => {
  const { touch, moveOutside } = await setup(page);
  const start = await position(page);
  const stage = await page.locator('.stage').boundingBox();
  const buttons = await page.locator('.touch-controls').boundingBox();
  expect(buttons.y).toBeGreaterThanOrEqual(stage.y + stage.height);
  await touch('touchStart', ['right']);
  await touch('touchStart', ['right', 'jump']);
  await advance(page, 2);
  expect((await position(page)).x).toBeGreaterThan(start.x);
  expect((await position(page)).y).toBeLessThan(start.y);
  await touch('touchEnd', ['right']);
  const stoppedX = (await position(page)).x;
  await advance(page, 60);
  expect(await position(page)).toEqual({ x: stoppedX, y: start.y });
  await touch('touchEnd');
  await expect(page.locator('.is-held')).toHaveCount(0);

  // 移出按钮后仍由原按钮捕获，松手不留下方向输入。
  await touch('touchStart', ['right']);
  await moveOutside();
  await advance(page, 2);
  expect((await position(page)).x).toBeGreaterThan(stoppedX);
  await touch('touchEnd');
  const released = await position(page);
  await advance(page, 3);
  expect(await position(page)).toEqual(released);

  // 键盘与触屏独立释放，任意一方仍按住时继续移动。
  await page.keyboard.down('ArrowRight');
  await touch('touchStart', ['right']);
  await touch('touchEnd');
  await advance(page, 2);
  expect((await position(page)).x).toBeGreaterThan(released.x);
  await touch('touchStart', ['right']);
  await page.keyboard.up('ArrowRight');
  const keyboardReleased = await position(page);
  await advance(page, 2);
  expect((await position(page)).x).toBeGreaterThan(keyboardReleased.x);
  await touch('touchEnd');
  const idle = await position(page);
  await advance(page, 3);
  expect(await position(page)).toEqual(idle);
});

for (const source of ['取消', '丢失捕获', '失焦', '隐藏', '暂停', '重开']) {
  test(`${source}清除触屏方向及尚未消费的跳跃`, async ({ page }) => {
    const { touch } = await setup(page);
    const start = await position(page);
    await touch('touchStart', ['right']);
    await touch('touchStart', ['right', 'jump']);
    await page.evaluate((kind) => {
      if (kind === '取消' || kind === '丢失捕获') {
        for (const action of ['right', 'jump']) {
          const button = document.querySelector(`[data-touch-action="${action}"]`);
          const pointerId = window.测试指针[action];
          if (kind === '取消') {
            button.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'touch' }));
          } else {
            button.releasePointerCapture(pointerId);
          }
        }
      } else if (kind === '失焦') {
        window.dispatchEvent(new Event('blur'));
      } else if (kind === '隐藏') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    }, source);
    if (source === '重开') await page.keyboard.press('r');
    if (source === '暂停') {
      await page.evaluate(() => document.getElementById('pause-button').click());
    }
    // 结束真实触摸序列，也让浏览器派发待处理的捕获丢失事件。
    await touch('touchEnd');
    await expect(page.locator('.is-held')).toHaveCount(0);
    if (source === '失焦' || source === '隐藏' || source === '暂停') {
      await expect(page.locator('#pause')).toBeVisible();
      await advance(page, 120);
      expect(await position(page)).toEqual(start);
      await page.evaluate(() => {
        delete document.hidden;
        window.dispatchEvent(new Event('focus'));
      });
      await page.getByRole('button', { name: '继续游戏' }).click();
    }
    await advance(page, 3);
    expect(await position(page)).toEqual(start);
    await touch('touchStart', ['left']);
    await advance(page, 2);
    expect((await position(page)).x).toBeLessThan(start.x);
    await touch('touchEnd');
  });
}

for (const outcome of ['跌落', '通关']) {
  test(`全程使用触屏${outcome}后可重玩`, async ({ page }) => {
    const { touch } = await setup(page);
    const start = await position(page);
    async function play(frames, moving = false, jump = false) {
      const actions = [...(moving ? ['right'] : []), ...(jump ? ['jump'] : [])];
      if (actions.length) await touch('touchStart', actions);
      await advance(page, frames);
      if (actions.length) await touch('touchEnd');
    }
    await play(21, true, true);
    await play(22);
    await play(47, true, true);
    if (outcome === '跌落') {
      await play(70, true);
    } else {
      for (const [frames, moving, jump] of [
        [41, true, true], [31, true, true], [27, true, false], [12, false, false],
        [42, true, true], [11, true, false], [43, true, true], [30, true, true],
        [22, false, false], [36, true, false],
      ]) await play(frames, moving, jump);
      await expect(page.locator('#counter')).toHaveText('种子 3 / 3');
    }
    await expect(page.locator('#result-title')).toHaveText(outcome === '通关' ? '已到达旗子' : '掉下山谷了');
    await expect(page.locator('.is-held')).toHaveCount(0);
    await page.getByRole('button', { name: outcome === '通关' ? '再玩一次' : '重试', exact: true }).tap();
    await advance(page, 3);
    expect(await position(page)).toEqual(start);
    await expect(page.locator('#counter')).toHaveText('种子 0 / 3');
    await play(2, true, true);
    expect((await position(page)).x).toBeGreaterThan(start.x);
    expect((await position(page)).y).toBeLessThan(start.y);
  });
}
