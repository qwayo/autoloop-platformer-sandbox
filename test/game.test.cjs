'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createGame, step } = require('../game.js');

function play(game, frames, input = {}) {
  for (let frame = 0; frame < frames; frame += 1) {
    step(game, { ...input, jump: frame === 0 && input.jump });
  }
}

test('可以向左右移动，角色会被石块挡住', () => {
  const game = createGame();
  const startX = game.player.x;
  play(game, 4, { left: true });
  assert.ok(game.player.x < startX);
  play(game, 80, { right: true });
  const atWall = game.player.x;
  assert.ok(atWall > startX);
  assert.equal(game.player.grounded, true);
  play(game, 5, { right: true });
  assert.equal(game.player.x, atWall);
  play(game, 27, { right: true, jump: true });
  play(game, 18);
  assert.ok(game.player.x > atWall);
  assert.equal(game.player.grounded, true);
});

test('起跳后能落到平台上并拾取种子', () => {
  const game = createGame();
  const startY = game.player.y;
  play(game, 1, { jump: true, right: true });
  assert.ok(game.player.y < startY);
  assert.equal(game.player.grounded, false);
  play(game, 20, { right: true });
  assert.equal(game.collected, 0);
  play(game, 22);
  assert.ok(game.player.y < startY);
  assert.equal(game.player.grounded, true);
  assert.equal(game.collected, 1);
  play(game, 22);
  assert.equal(game.collected, 1);
});

test('跨过三个断崖，能拾取全部种子并走到旗子', () => {
  const game = createGame();
  const right = { right: true };
  const jumpRight = { right: true, jump: true };

  // 落到第一个平台拾取种子，再越过石块到第一个断崖边。
  play(game, 21, jumpRight);
  play(game, 22);
  play(game, 47, jumpRight);
  assert.equal(game.player.grounded, true);
  play(game, 41, jumpRight);

  // 跳上第二个平台，拾取种子后下到断崖边。
  play(game, 31, jumpRight);
  play(game, 27, right);
  play(game, 12);
  assert.equal(game.collected, 2);
  play(game, 42, jumpRight);

  // 翻过石块，跳过最后一个断崖，到达带有第三颗种子的平台。
  play(game, 11, right);
  play(game, 43, jumpRight);
  play(game, 30, jumpRight);
  play(game, 22);
  assert.equal(game.collected, 3);
  assert.equal(game.status, 'playing');
  play(game, 36, right);
  assert.equal(game.status, 'won');
});

test('跌落后停止移动，重试时恢复起点与种子', () => {
  const game = createGame();
  play(game, 21, { right: true, jump: true });
  play(game, 22);
  play(game, 47, { right: true, jump: true });
  play(game, 70, { right: true });
  assert.equal(game.status, 'fallen');
  assert.equal(game.collected, 1);
  const position = { x: game.player.x, y: game.player.y };
  play(game, 60, { left: true, jump: true });
  assert.equal(game.player.x, position.x);
  assert.equal(game.player.y, position.y);
  const restarted = createGame();
  assert.equal(restarted.status, 'playing');
  assert.equal(restarted.collected, 0);
  assert.ok(restarted.seeds.every((seed) => !seed.collected));
  assert.ok(restarted.player.x < position.x);
  assert.ok(restarted.player.grounded);
});
