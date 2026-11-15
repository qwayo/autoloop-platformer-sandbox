(() => {
  'use strict';

  const VIEW_WIDTH = 960;
  const VIEW_HEIGHT = 450;
  const WALK_SPEED = 5;
  const JUMP_SPEED = 11.6;
  const GRAVITY = 0.56;
  const STEP_MS = 1000 / 60;

  const level = {
    width: 1780,
    spawn: { x: 64, y: 349 },
    finish: { x: 1660, y: 303, width: 36, height: 84 },
    seeds: [
      { x: 173, y: 291, width: 14, height: 16 },
      { x: 770, y: 275, width: 14, height: 16 },
      { x: 1511, y: 291, width: 14, height: 16 },
    ],
    solids: [
      { x: 0, y: 387, width: 420, height: 104 },
      { x: 504, y: 387, width: 416, height: 104 },
      { x: 1006, y: 387, width: 354, height: 104 },
      { x: 1444, y: 387, width: 336, height: 104 },
      { x: 264, y: 349, width: 39, height: 38 },
      { x: 640, y: 342, width: 56, height: 45 },
      { x: 1180, y: 349, width: 46, height: 38 },
      { x: 145, y: 319, width: 85, height: 14 },
      { x: 728, y: 303, width: 102, height: 14 },
      { x: 1478, y: 319, width: 94, height: 14 },
    ],
  };

  function createGame() {
    return {
      player: {
        ...level.spawn,
        width: 26,
        height: 38,
        velocityY: 0,
        grounded: true,
        facing: 1,
      },
      seeds: level.seeds.map((seed) => ({ ...seed, collected: false })),
      collected: 0,
      status: 'playing',
    };
  }

  function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function step(game, input = {}) {
    if (game.status !== 'playing') return;

    const { player } = game;
    const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
    if (direction) {
      player.facing = direction;
      player.x = Math.max(0, Math.min(level.width - player.width, player.x + direction * WALK_SPEED));
      for (const solid of level.solids) {
        if (intersects(player, solid)) {
          player.x = direction > 0 ? solid.x - player.width : solid.x + solid.width;
        }
      }
    }

    if (input.jump && player.grounded) player.velocityY = -JUMP_SPEED;
    player.velocityY += GRAVITY;
    player.y += player.velocityY;
    player.grounded = false;

    for (const solid of level.solids) {
      if (!intersects(player, solid)) continue;
      if (player.velocityY >= 0) {
        player.y = solid.y - player.height;
        player.grounded = true;
      } else {
        player.y = solid.y + solid.height;
      }
      player.velocityY = 0;
    }

    for (const seed of game.seeds) {
      if (!seed.collected && intersects(player, seed)) {
        seed.collected = true;
        game.collected += 1;
      }
    }

    if (player.y > VIEW_HEIGHT + 30) game.status = 'fallen';
    if (intersects(player, level.finish)) game.status = 'won';
  }

  function draw(ctx, game) {
    const { player } = game;
    const cameraX = Math.round(Math.max(0, Math.min(level.width - VIEW_WIDTH, player.x - 320)));
    ctx.fillStyle = '#f5d6a7';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.fillStyle = '#edac6f';
    ctx.fillRect(660 - Math.floor(cameraX / 8), 75, 57, 57);
    ctx.fillStyle = '#fbedc9';
    for (let x = -40; x < VIEW_WIDTH; x += 217) {
      const cloudX = x - Math.floor(cameraX / 10) + 75;
      const cloudY = 78 + (x % 3) * 13;
      ctx.fillRect(cloudX, cloudY, 53, 6);
      ctx.fillRect(cloudX + 12, cloudY - 6, 25, 6);
    }

    ridge(ctx, cameraX / 4, 285, 134, 58, '#b6b688');
    ridge(ctx, cameraX / 2, 353, 207, 52, '#889b76');
    ctx.fillStyle = '#586f59';
    ctx.fillRect(0, 354, VIEW_WIDTH, VIEW_HEIGHT - 354);
    ctx.fillStyle = '#465c4d';
    ctx.fillRect(0, 417, VIEW_WIDTH, VIEW_HEIGHT - 417);

    ctx.save();
    ctx.translate(-cameraX, 0);
    for (const solid of level.solids) {
      ctx.fillStyle = '#76533d';
      ctx.fillRect(solid.x, solid.y + 6, solid.width, solid.height - 6);
      ctx.fillStyle = '#849050';
      ctx.fillRect(solid.x, solid.y, solid.width, 6);
      ctx.fillStyle = '#946c46';
      for (let x = 9; x < solid.width - 8; x += 21) {
        ctx.fillRect(solid.x + x, solid.y + 9 + x % 3, 5, 3);
        if (solid.height > 50) ctx.fillRect(solid.x + x + 4, solid.y + 32, 8, 5);
      }
    }

    for (const seed of game.seeds) {
      if (seed.collected) continue;
      ctx.fillStyle = '#9d612d';
      ctx.fillRect(seed.x + 3, seed.y, 8, 16);
      ctx.fillRect(seed.x, seed.y + 3, 14, 10);
      ctx.fillStyle = '#ffd269';
      ctx.fillRect(seed.x + 3, seed.y + 3, 8, 10);
      ctx.fillStyle = '#fff0b0';
      ctx.fillRect(seed.x + 4, seed.y + 4, 3, 4);
    }

    const { finish } = level;
    ctx.fillStyle = '#3d493c';
    ctx.fillRect(finish.x + 10, finish.y, 4, finish.height);
    ctx.fillRect(finish.x + 3, finish.y + finish.height - 4, 18, 4);
    ctx.fillStyle = '#af4a3e';
    ctx.fillRect(finish.x + 14, finish.y + 2, 24, 19);
    ctx.fillRect(finish.x + 38, finish.y + 2, 6, 13);
    ctx.fillStyle = '#ffd49a';
    ctx.fillRect(finish.x + 19, finish.y + 6, 6, 6);

    drawPlayer(ctx, player);
    ctx.restore();
  }

  function ridge(ctx, offset, y, spacing, height, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_HEIGHT);
    for (let x = -(offset % spacing); x < VIEW_WIDTH + spacing; x += spacing) {
      ctx.lineTo(x, y);
      ctx.lineTo(x + spacing * 0.34, y - height);
      ctx.lineTo(x + spacing * 0.56, y - height);
    }
    ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
    ctx.fill();
  }

  function drawPlayer(ctx, player) {
    ctx.save();
    ctx.translate(Math.round(player.x) + (player.facing < 0 ? player.width : 0), Math.round(player.y));
    ctx.scale(player.facing, 1);
    ctx.fillStyle = '#274538';
    ctx.fillRect(5, 0, 17, 19);
    ctx.fillRect(4, 22, 19, 11);
    ctx.fillRect(5, 31, 7, 7);
    ctx.fillRect(16, 31, 8, 7);
    ctx.fillStyle = '#466955';
    ctx.fillRect(8, 2, 14, 8);
    ctx.fillStyle = '#f4d79a';
    ctx.fillRect(12, 8, 14, 8);
    ctx.fillStyle = '#2b483a';
    ctx.fillRect(21, 10, 3, 4);
    ctx.fillStyle = '#b75e3b';
    ctx.fillRect(0, 18, 8, 14);
    ctx.fillStyle = '#efa755';
    ctx.fillRect(6, 17, 17, 5);
    ctx.restore();
  }

  function runBrowserGame() {
    const ctx = document.getElementById('game').getContext('2d');
    if (!ctx) return;
    const counter = document.getElementById('counter');
    const result = document.getElementById('result');
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    const retry = document.getElementById('retry');
    const restartButton = document.getElementById('restart-button');
    const pauseButton = document.getElementById('pause-button');
    const pausePanel = document.getElementById('pause');
    const resume = document.getElementById('resume');
    const keys = new Set();
    const touchButtons = [...document.querySelectorAll('[data-touch-action]')];
    const touchPointers = new Map();
    const buttonKeys = new Map();
    let buttonJumpQueued = false;
    let touchJumpQueued = false;

    function buttonHeld(action) {
      return [...buttonKeys.values()].some((button) => button.dataset.touchAction === action);
    }

    function clearButtonKeyboardInput(button) {
      for (const [code, owner] of buttonKeys) {
        if (!button || owner === button) buttonKeys.delete(code);
      }
      if (!button || button.dataset.touchAction === 'jump') buttonJumpQueued = false;
      updateTouchButtons();
    }

    function touchHeld(action) {
      return [...touchPointers.values()].some((button) => button.dataset.touchAction === action);
    }

    function updateTouchButtons() {
      for (const button of touchButtons) {
        button.classList.toggle('is-held',
          [...touchPointers.values()].includes(button) || [...buttonKeys.values()].includes(button));
      }
    }

    function clearTouchInput() {
      const captured = [...touchPointers.entries()];
      touchPointers.clear();
      touchJumpQueued = false;
      for (const [pointerId, button] of captured) {
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      }
      updateTouchButtons();
    }

    function releaseTouch(event) {
      const button = touchPointers.get(event.pointerId);
      if (!button) return;
      touchPointers.delete(event.pointerId);
      // 普通松手保留待消费的跳跃；取消或丢失捕获仍清理输入。
      if (event.type !== 'pointerup' && !touchHeld('jump')) touchJumpQueued = false;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      updateTouchButtons();
    }
    let game = createGame();
    let paused = false;
    let jumpQueued = false;
    let previousTime;
    let elapsed = 0;

    function resetInputAndTiming() {
      clearButtonKeyboardInput();
      clearTouchInput();
      keys.clear();
      jumpQueued = false;
      previousTime = undefined;
      elapsed = 0;
    }

    function pauseGame() {
      resetInputAndTiming();
      if (game.status !== 'playing') return;
      paused = true;
      pausePanel.hidden = false;
      pauseButton.disabled = true;
      restartButton.disabled = true;
    }

    function focusResume() {
      if (paused && !document.hidden && document.hasFocus()) {
        resume.focus({ preventScroll: true });
      }
    }

    function resumeGame() {
      if (!paused || document.hidden || !document.hasFocus()) return;
      resetInputAndTiming();
      paused = false;
      pausePanel.hidden = true;
      pauseButton.disabled = false;
      restartButton.disabled = false;
      document.getElementById('game').focus({ preventScroll: true });
    }

    function updateCounter() {
      counter.textContent = `种子 ${game.collected} / ${game.seeds.length}`;
    }

    function restart() {
      game = createGame();
      resetInputAndTiming();
      paused = false;
      pausePanel.hidden = true;
      pauseButton.disabled = false;
      restartButton.disabled = false;
      result.hidden = true;
      document.getElementById('game').focus({ preventScroll: true });
      updateCounter();
    }

    function showResult() {
      clearButtonKeyboardInput();
      clearTouchInput();
      keys.clear();
      jumpQueued = false;
      pauseButton.disabled = true;
      restartButton.disabled = true;
      const won = game.status === 'won';
      title.textContent = won ? '已到达旗子' : '掉下山谷了';
      detail.textContent = won ? `找到 ${game.collected} / ${game.seeds.length} 颗种子。` : '走到断崖边再起跳。';
      retry.textContent = won ? '再玩一次' : '重试';
      result.hidden = false;
      retry.focus({ preventScroll: true });
    }

    for (const button of touchButtons) {
      button.addEventListener('keydown', (event) => {
        if (!['Space', 'Enter'].includes(event.code)) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (document.hidden) pauseGame();
        if (paused || game.status !== 'playing' || event.repeat || buttonKeys.has(event.code)) return;
        buttonKeys.set(event.code, button);
        if (button.dataset.touchAction === 'jump') buttonJumpQueued = true;
        updateTouchButtons();
      });
      button.addEventListener('blur', () => clearButtonKeyboardInput(button));
      button.addEventListener('pointerdown', (event) => {
        if (document.hidden) pauseGame();
        if (paused || game.status !== 'playing' || event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        if (button.dataset.touchAction === 'jump' && !touchHeld('jump')) touchJumpQueued = true;
        touchPointers.set(event.pointerId, button);
        updateTouchButtons();
      });
      button.addEventListener('pointerup', releaseTouch);
      button.addEventListener('pointercancel', releaseTouch);
      button.addEventListener('lostpointercapture', releaseTouch);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    window.addEventListener('keydown', (event) => {
      if (document.hidden) pauseGame();
      if (paused) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const code = event.code;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyR', 'KeyA', 'KeyD'].includes(code)) return;
      if (code === 'Space'
        && (event.target === retry || event.target === pauseButton || event.target === restartButton
          || touchButtons.includes(event.target))) return;
      event.preventDefault();
      if (code === 'KeyR' && !event.repeat) {
        restart();
        return;
      }
      // 重复事件不能重新登记暂停或重开时已清除的输入。
      if (!event.repeat) keys.add(code);
      if ((code === 'Space' || code === 'ArrowUp') && !event.repeat) jumpQueued = true;
    });
    window.addEventListener('keyup', (event) => {
      keys.delete(event.code);
      if (buttonKeys.delete(event.code)) updateTouchButtons();
    });
    window.addEventListener('blur', pauseGame);
    window.addEventListener('focus', focusResume);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseGame();
      else focusResume();
    });
    pauseButton.addEventListener('click', () => {
      pauseGame();
      focusResume();
    });
    resume.addEventListener('click', resumeGame);
    retry.addEventListener('click', restart);
    function restartWhilePlaying() {
      if (document.hidden) pauseGame();
      if (!paused && game.status === 'playing') restart();
    }

    // 多指触屏的非主触点不会生成普通点击事件，松开时单独处理。
    restartButton.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch' && !event.isPrimary) restartWhilePlaying();
    });
    restartButton.addEventListener('click', restartWhilePlaying);

    if (document.hidden) pauseGame();

    function frame(time) {
      if (document.hidden && !paused) pauseGame();
      if (paused) {
        draw(ctx, game);
        window.requestAnimationFrame(frame);
        return;
      }
      elapsed += Math.min(time - (previousTime ?? time), 4 * STEP_MS);
      previousTime = time;
      while (elapsed >= STEP_MS) {
        if (game.status === 'playing') {
          const previousCount = game.collected;
          step(game, {
            left: keys.has('ArrowLeft') || keys.has('KeyA') || touchHeld('left') || buttonHeld('left'),
            right: keys.has('ArrowRight') || keys.has('KeyD') || touchHeld('right') || buttonHeld('right'),
            jump: jumpQueued || touchJumpQueued || buttonJumpQueued,
          });
          if (game.collected !== previousCount) updateCounter();
          if (game.status !== 'playing') showResult();
        }
        jumpQueued = false;
        touchJumpQueued = false;
        buttonJumpQueued = false;
        elapsed -= STEP_MS;
      }
      draw(ctx, game);
      window.requestAnimationFrame(frame);
    }

    draw(ctx, game);
    window.requestAnimationFrame(frame);
  }

  if (typeof module === 'object' && module.exports) module.exports = { createGame, step };
  if (typeof document === 'object') runBrowserGame();
})();
