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
  for (const [index, action] of ['left', 'right', 'jump', 'pause'].entries()) {
    const selector = action === 'pause' ? '#pause-button' : `[data-touch-action="${action}"]`;
    const box = await page.locator(selector).boundingBox();
    points[action] = { id: index + 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return {
    points,
    async touch(type, actions = [], offsetX = 0) {
      // 继续按钮在暂停后才显示，按下前读取实际位置。
      if (type === 'touchStart' && actions.includes('resume')) {
        const box = await page.locator('#resume').boundingBox();
        points.resume = { id: 5, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      // 结算按钮在跌落或通关后才显示，按下前读取实际位置。
      if (type === 'touchStart' && actions.includes('retry')) {
        const box = await page.locator('#retry').boundingBox();
        points.retry = { id: 6, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: actions.map((action) => ({
          ...points[action],
          x: points[action].x + offsetX,
        })),
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

for (const action of ['left', 'right']) {
  test(`鼠标组合按键松开主键后立即释放${action === 'left' ? '向左' : '向右'}按钮`, async ({ page }) => {
    const { points } = await setup(page);
    const button = page.locator(`[data-touch-action="${action}"]`);
    const direction = action === 'left' ? -1 : 1;
    const start = await position(page);
    await page.mouse.move(points[action].x, points[action].y);
    await page.mouse.down({ button: 'left' });
    await expect(button).toHaveClass(/is-held/);
    await advance(page, 2);
    const held = await position(page);
    expect((held.x - start.x) * direction).toBeGreaterThan(0);

    await page.mouse.down({ button: 'right' });
    await expect(button).toHaveClass(/is-held/);
    await page.mouse.up({ button: 'left' });
    // 不移动鼠标，也不先松开右键，直接核对主键释放结果。
    await expect(button).not.toHaveClass(/is-held/);
    const released = await position(page);
    await advance(page, 3);
    expect((await position(page)).x).toBe(released.x);

    await page.mouse.up({ button: 'right' });
    await page.mouse.down({ button: 'left' });
    await expect(button).toHaveClass(/is-held/);
    await advance(page, 2);
    const pressedAgain = await position(page);
    expect((pressedAgain.x - released.x) * direction).toBeGreaterThan(0);

    // 普通左键移出按钮后仍保持捕获，松开后停止移动。
    await page.mouse.move(5, 5);
    await expect(button).toHaveClass(/is-held/);
    await advance(page, 2);
    const outside = await position(page);
    expect((outside.x - pressedAgain.x) * direction).toBeGreaterThan(0);
    await page.mouse.up({ button: 'left' });
    await expect(button).not.toHaveClass(/is-held/);
    const stopped = await position(page);
    await advance(page, 3);
    expect((await position(page)).x).toBe(stopped.x);
  });
}

for (const moving of [false, true]) {
  test(`快速点按跳跃在下一物理帧起跳${moving ? '，同时保留方向输入' : ''}`, async ({ page }) => {
    const { touch } = await setup(page);
    const start = await position(page);
    if (moving) await touch('touchStart', ['right']);
    await touch('touchStart', moving ? ['right', 'jump'] : ['jump']);
    await touch('touchEnd', ['jump']);
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

for (const key of ['Space', 'Enter']) {
  test(`按钮 ${key} 与真实触屏方向分别释放`, async ({ page }) => {
    const { touch } = await setup(page);
    const right = page.locator('[data-touch-action="right"]');
    // 按实际焦点查找目标按钮，避免依赖固定的 Tab 次数。
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      if (await right.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(right).toBeFocused();
    await page.keyboard.down(key);
    await touch('touchStart', ['right']);
    await advance(page, 2);
    const before = await position(page);
    await page.keyboard.up(key);
    await expect(right).toHaveClass(/is-held/);
    await advance(page, 2);
    expect((await position(page)).x).toBeGreaterThan(before.x);
    await page.keyboard.down(key);
    await touch('touchEnd');
    await expect(right).toHaveClass(/is-held/);
    const released = await position(page);
    await advance(page, 2);
    expect((await position(page)).x).toBeGreaterThan(released.x);
    await page.keyboard.up(key);
    await expect(right).not.toHaveClass(/is-held/);
    const stopped = await position(page);
    await advance(page, 3);
    expect(await position(page)).toEqual(stopped);
  });
}

for (const source of ['取消', '丢失捕获', '失焦', '隐藏', '暂停', '重开']) {
  test(`${source}清除触屏方向及尚未消费的跳跃`, async ({ page }) => {
    const { touch } = await setup(page);
    const start = await position(page);
    await touch('touchStart', ['right']);
    await touch('touchStart', ['right', 'jump']);
    // 实际移动触点以触发指针事件，使待处理捕获生效后再主动释放。
    if (source === '丢失捕获') await touch('touchMove', ['right', 'jump'], 1);
    await page.evaluate((kind) => {
      if (kind === '取消' || kind === '丢失捕获') {
        for (const action of ['right', 'jump']) {
          const button = document.querySelector(`[data-touch-action="${action}"]`);
          const pointerId = window.测试指针[action];
          if (kind === '取消') {
            button.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'touch' }));
          } else {
            if (!button.hasPointerCapture(pointerId)) throw new Error('测试触点尚未获得捕获');
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
    if (source === '丢失捕获') {
      // 再次移动触点，让浏览器在普通松手前处理捕获释放并派发捕获丢失事件。
      await touch('touchMove', ['right', 'jump'], 2);
      await expect(page.locator('.is-held')).toHaveCount(0);
    }
    if (source === '重开') await page.keyboard.press('r');
    if (source === '暂停') {
      await page.evaluate(() => document.getElementById('pause-button').click());
    }
    // 结束真实触摸序列。
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

for (const queuedJump of [false, true]) {
  test(`保持方向触点时第二指暂停和继续保留进度，清除输入${queuedJump ? '及待处理跳跃' : ''}`, async ({ page }) => {
    const { touch } = await setup(page);
    // 先收集种子并落在平台上，避免零进度或空中状态掩盖回归。
    await touch('touchStart', ['right', 'jump']);
    await advance(page, 21);
    await touch('touchEnd');
    await advance(page, 22);
    await expect(page.locator('#counter')).toHaveText('种子 1 / 3');

    await touch('touchStart', ['right']);
    await advance(page, 2);
    if (queuedJump) {
      await touch('touchStart', ['right', 'jump']);
      await touch('touchEnd', ['jump']);
    }
    const before = await position(page);
    const counter = await page.locator('#counter').textContent();
    await touch('touchStart', ['right', 'pause']);
    await expect(page.locator('#pause')).toBeHidden();
    // 仅松开第二指，方向触点始终保留。
    await touch('touchEnd', ['pause']);
    await expect(page.locator('#pause')).toBeVisible();
    await expect(page.locator('#resume')).toBeFocused();
    await expect(page.locator('#pause-button')).toBeDisabled();
    await expect(page.locator('.is-held')).toHaveCount(0);
    await advance(page, 120);
    expect(await position(page)).toEqual(before);
    await expect(page.locator('#counter')).toHaveText(counter);
    await expect(page.locator('#result')).toBeHidden();

    // 第一指始终不离屏，第二指点按继续，必须在松开时恢复。
    await touch('touchStart', ['right', 'resume']);
    await expect(page.locator('#pause')).toBeVisible();
    await touch('touchEnd', ['resume']);
    await expect(page.locator('#pause')).toBeHidden();
    await expect(page.locator('#pause-button')).toBeEnabled();
    await expect(page.locator('#game')).toBeFocused();
    await expect(page.locator('.is-held')).toHaveCount(0);
    // 恢复后的首帧即使相隔一分钟，也不能补帧或消费旧输入。
    await page.evaluate(() => {
      window.测试时刻 += 60000;
      window.测试帧(window.测试时刻);
    });
    expect(await position(page)).toEqual(before);
    await touch('touchMove', ['right'], 1);
    await advance(page, 3);
    expect(await position(page)).toEqual(before);
    await expect(page.locator('#counter')).toHaveText(counter);
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('.is-held')).toHaveCount(0);
    await touch('touchEnd');
    await advance(page, 3);
    expect(await position(page)).toEqual(before);

    await touch('touchStart', ['right', 'jump']);
    await advance(page, 2);
    expect((await position(page)).x).toBeGreaterThan(before.x);
    expect((await position(page)).y).toBeLessThan(before.y);
    await touch('touchEnd');
  });
}

test('单指点按暂停仍可正常暂停和继续', async ({ page }) => {
  await setup(page);
  const before = await position(page);
  await page.getByRole('button', { name: '暂停游戏', exact: true }).tap();
  await expect(page.locator('#pause')).toBeVisible();
  await advance(page, 120);
  expect(await position(page)).toEqual(before);
  await page.getByRole('button', { name: '继续游戏', exact: true }).tap();
  await expect(page.locator('#pause')).toBeHidden();
  await advance(page, 3);
  expect(await position(page)).toEqual(before);
});

for (const outcome of ['跌落', '通关']) for (const held of [false, true]) {
  test(`全程使用触屏${outcome}后${held ? '保持第一指，用第二指' : '用单指'}重玩`, async ({ page }) => {
    const { touch } = await setup(page);
    const start = await position(page);
    async function play(frames, moving = false, jump = false) {
      const actions = [...(moving ? ['right'] : []), ...(jump ? ['jump'] : [])];
      if (actions.length) await touch('touchStart', actions);
      await advance(page, frames);
      // 进入结算时保留最后一段移动的第一指，直到第二指完成重玩。
      if (actions.length && !(held && await page.locator('#result').isVisible())) {
        await touch('touchEnd');
      }
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
    const finished = await position(page);
    await expect(page.locator('#pause-button')).toBeDisabled();
    if (!held) await touch('touchStart', ['right']);
    await touch('touchStart', ['right', 'pause']);
    await touch('touchEnd', ['pause']);
    if (!held) await touch('touchEnd');
    await advance(page, 3);
    await expect(page.locator('#pause')).toBeHidden();
    await expect(page.locator('#result')).toBeVisible();
    expect(await position(page)).toEqual(finished);
    await expect(page.locator('.is-held')).toHaveCount(0);
    if (held) {
      // 每次重开都会写入结算面板的 hidden 属性，用实际界面变更检查只重开一次。
      await page.evaluate(() => {
        window.测试重玩次数 = 0;
        new MutationObserver((records) => {
          window.测试重玩次数 += records.length;
        }).observe(document.getElementById('result'), {
          attributes: true,
          attributeFilter: ['hidden'],
        });
      });
      await touch('touchStart', ['right', 'retry']);
      await advance(page, 3);
      await expect(page.locator('#result')).toBeVisible();
      expect(await position(page)).toEqual(finished);
      expect(await page.evaluate(() => window.测试重玩次数)).toBe(0);
      // 仅松开第二指，第一指继续贴屏。
      await touch('touchEnd', ['retry']);
    } else {
      await page.getByRole('button', { name: outcome === '通关' ? '再玩一次' : '重试', exact: true }).tap();
    }
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#game')).toBeFocused();
    await expect(page.locator('.is-held')).toHaveCount(0);
    await advance(page, 3);
    expect(await position(page)).toEqual(start);
    await expect(page.locator('#counter')).toHaveText('种子 0 / 3');
    if (held) {
      await touch('touchMove', ['right'], 1);
      await advance(page, 3);
      expect(await position(page)).toEqual(start);
      await touch('touchEnd');
      await advance(page, 3);
      expect(await position(page)).toEqual(start);
      expect(await page.evaluate(() => window.测试重玩次数)).toBe(1);
    }
    await play(2, true, true);
    expect((await position(page)).x).toBeGreaterThan(start.x);
    expect((await position(page)).y).toBeLessThan(start.y);
  });
}
