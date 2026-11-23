/* 咩咩回家 —— Q版羊妈妈草地收集小羊，躲开大灰狼，全员回家即通关 */
(() => {
  "use strict";

  const W = 960, H = 600;
  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");
  const $ = id => document.getElementById(id);
  const el = {
    hud: $("hud"), hearts: $("hearts"), lambs: $("lambs"), timer: $("timer"), difficulty: $("difficulty"),
    menu: $("menu"), pause: $("pause"), win: $("win"), lose: $("lose"),
    btnStart: $("btnStart"), btnEasy: $("btnEasy"), btnHard: $("btnHard"),
    btnResume: $("btnResume"), btnPauseMenu: $("btnPauseMenu"),
    btnWinAgain: $("btnWinAgain"), btnWinMenu: $("btnWinMenu"),
    btnLoseAgain: $("btnLoseAgain"), btnLoseMenu: $("btnLoseMenu"),
    winSub: $("winSub"), loseSub: $("loseSub"), toast: $("toast"),
  };

  const TOTAL = 6;
  const HOME = { x: 852, y: 498, r: 78 };

  // 障碍物：石头 / 大树 / 灌木。玩家和狼都不能穿过，可绕柱遛狼
  const obstacles = [
    { x: 330, y: 260, r: 30, type: "rock" },
    { x: 620, y: 180, r: 24, type: "tree" },
    { x: 700, y: 420, r: 26, type: "rock" },
    { x: 240, y: 480, r: 30, type: "bush" },
    { x: 120, y: 250, r: 24, type: "tree" },
    { x: 520, y: 470, r: 28, type: "rock" },
    { x: 840, y: 240, r: 28, type: "bush" },
  ];
  // 圆-圆碰撞：把实体沿法线推出障碍，斜向移动自然沿边缘滑行
  function collideObstacles(e, r) {
    for (const o of obstacles) {
      const dx = e.x - o.x, dy = e.y - o.y;
      const d = Math.hypot(dx, dy);
      const min = r + o.r;
      if (d < min && d > 0.001) {
        e.x = o.x + dx / d * min;
        e.y = o.y + dy / d * min;
      }
    }
  }

  /* ---------------- 音效 ---------------- */
  let AC = null, master = null, muted = false, musicTimer = null, nextNote = 0, step = 0;
  const MELODY = [523, 659, 784, 659, 440, 523, 659, 523, 349, 440, 523, 440, 392, 494, 587, 392];
  const BASS = [131, 0, 110, 0, 87, 0, 98, 0];

  function initAudio() {
    if (AC) { if (AC.state === "suspended") AC.resume(); return; }
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.8;
    master.connect(AC.destination);
    startMusic();
  }
  function beep(freq, dur, type = "triangle", vol = 0.22, slideTo = 0, when = 0) {
    if (!AC) return;
    const t = AC.currentTime + when;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    collect() { beep(660, 0.12); beep(880, 0.2, "triangle", 0.22, 0, 0.1); },
    hurt() { beep(200, 0.35, "sawtooth", 0.25, 90); },
    alert() { beep(110, 0.3, "sawtooth", 0.15, 70); },
    win() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.35, "triangle", 0.25, 0, i * 0.13)); },
    lose() { [392, 330, 262].forEach((f, i) => beep(f, 0.4, "sine", 0.22, 0, i * 0.22)); },
  };
  function startMusic() {
    nextNote = AC.currentTime + 0.1;
    step = 0;
    musicTimer = setInterval(() => {
      if (!AC || muted) { nextNote = Math.max(nextNote, AC.currentTime + 0.1); return; }
      while (nextNote < AC.currentTime + 0.18) {
        const when = nextNote - AC.currentTime;
        beep(MELODY[step % 16], 0.22, "triangle", 0.07, 0, when);
        if (step % 2 === 0) {
          const b = BASS[(step / 2) % 8];
          if (b) beep(b, 0.4, "sine", 0.09, 0, when);
        }
        nextNote += 0.25;
        step++;
      }
    }, 50);
  }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.8;
    toast(muted ? "已静音" : "声音开启", 900);
  }

  /* ---------------- 草地装饰（一次性生成） ---------------- */
  const grass = [], flowers = [], patches = [];
  for (let i = 0; i < 150; i++) {
    grass.push({ x: Math.random() * W, y: 60 + Math.random() * (H - 70), s: 0.6 + Math.random() * 0.8 });
  }
  for (let i = 0; i < 26; i++) {
    flowers.push({
      x: 30 + Math.random() * (W - 60), y: 70 + Math.random() * (H - 110),
      c: ["#fff3f5", "#ffe9f0", "#fff8dc", "#f3e8ff"][i % 4], s: 0.7 + Math.random() * 0.5,
    });
  }
  for (let i = 0; i < 14; i++) {
    patches.push({ x: Math.random() * W, y: 60 + Math.random() * (H - 60), rx: 60 + Math.random() * 90, ry: 30 + Math.random() * 40 });
  }

  /* ---------------- 游戏状态 ---------------- */
  const state = {
    playing: false, over: false, paused: false,
    difficulty: "easy",
    hearts: 3, collected: 0, time: 0,
  };
  const player = { x: 760, y: 520, r: 22, speed: 230, face: 1, inv: 0, moving: false, vx: 0, vy: 0 };
  let lambs = [];    // {x,y,got,phase}
  let wolves = [];   // {x,y,tx,ty,mode,face,alertCd,legT}
  let trail = [];    // 羊妈妈轨迹，小羊排队跟随
  let particles = []; // {x,y,vx,vy,life,maxLife,type,color,size}
  let homeHintCd = 0;
  const keys = new Set();

  /* ---------------- 手机触控：虚拟轮盘 ---------------- */
  // ?touch=1 可在桌面预览手机版（轮盘可用鼠标拖动）
  const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0 || /[?&]touch=1/.test(location.search);
  if (isTouch) document.body.classList.add("is-touch");
  const joy = { active: false, x: 0, y: 0, baseX: 0, baseY: 0, radius: 56 };
  let joyPortraitHinted = false;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  // 随机寻找安全出生点：避开障碍物和家，并与玩家及其他同类保持距离
  function randomSpot(radius, minPlayerDist = 0, others = [], minOtherDist = 70) {
    for (let tries = 0; tries < 300; tries++) {
      const p = { x: rand(55, W - 55), y: rand(100, H - 55) };
      if (dist(p, HOME) < HOME.r + radius + 25) continue;
      if (obstacles.some(o => dist(p, o) < o.r + radius + 10)) continue;
      if (dist(p, player) < minPlayerDist) continue;
      if (others.some(e => dist(p, e) < minOtherDist)) continue;
      return p;
    }
    return { x: 460, y: 540 };
  }

  function spawnLambs() {
    lambs = [];
    for (let i = 0; i < TOTAL; i++) {
      const p = randomSpot(16, 90, lambs, 75);
      lambs.push({ x: p.x, y: p.y, got: false, phase: Math.random() * Math.PI * 2 });
    }
  }
  function spawnWolves() {
    wolves = [];
    for (let i = 0; i < 2; i++) {
      const p = randomSpot(20, 300, wolves, 180);
      const target = randomSpot(20);
      wolves.push({
        x: p.x, y: p.y, tx: target.x, ty: target.y,
        mode: "patrol", role: "chaser", face: 1, alertCd: 0, legT: 0, wanderT: 0,
      });
    }
  }

  function resetGame() {
    state.hearts = 3;
    state.collected = 0;
    state.time = 0;
    state.over = false;
    state.paused = false;
    player.x = HOME.x; player.y = HOME.y + 20;
    player.inv = 0; player.face = 1; player.moving = false;
    player.vx = 0; player.vy = 0;
    trail = [];
    particles = [];
    homeHintCd = 0;
    state.pincerHinted = false;
    spawnLambs();
    spawnWolves();
    updateHud();
  }

  function startGame() {
    initAudio();
    resetGame();
    state.playing = true;
    el.menu.classList.add("hidden");
    el.win.classList.add("hidden");
    el.lose.classList.add("hidden");
    el.pause.classList.add("hidden");
    el.hud.classList.remove("hidden");
    setMobileControls(true);
    toast(state.difficulty === "hard" ? "困难模式：小心双狼配合包抄！" : "简单模式：狼只会直追，去找小羊吧！", 1800);
  }
  function quitToMenu() {
    state.playing = false;
    state.over = false;
    state.paused = false;
    el.pause.classList.add("hidden");
    el.win.classList.add("hidden");
    el.lose.classList.add("hidden");
    el.hud.classList.add("hidden");
    el.menu.classList.remove("hidden");
    setMobileControls(false);
    resetJoy();
  }
  function togglePause() {
    if (!state.playing || state.over) return;
    state.paused = !state.paused;
    el.pause.classList.toggle("hidden", !state.paused);
  }
  function endGame(win) {
    state.over = true;
    state.playing = false;
    setMobileControls(false);
    resetJoy();
    const t = fmtTime(state.time);
    if (win) {
      sfx.win();
      el.winSub.textContent = `6 只小羊全部安全到家！用时 ${t}，剩余 ${state.hearts} 颗心`;
      el.win.classList.remove("hidden");
      for (let i = 0; i < 70; i++) {
        particles.push({
          x: rand(0, W), y: rand(-H * 0.4, 0),
          vx: rand(-30, 30), vy: rand(80, 200),
          life: 4, maxLife: 4, type: "confetti",
          color: ["#ff8c42", "#ffd23f", "#7fb48d", "#ff9fb0", "#8ec9ff"][i % 5],
          size: rand(5, 9),
        });
      }
    } else {
      sfx.lose();
      el.loseSub.textContent = `带回了 ${state.collected} / ${TOTAL} 只小羊，坚持了 ${t}。再试一次吧！`;
      el.lose.classList.remove("hidden");
    }
  }

  /* ---------------- HUD / 提示 ---------------- */
  function setDifficulty(mode) {
    state.difficulty = mode;
    const hard = mode === "hard";
    el.btnEasy.classList.toggle("selected", !hard);
    el.btnHard.classList.toggle("selected", hard);
    el.btnEasy.setAttribute("aria-pressed", String(!hard));
    el.btnHard.setAttribute("aria-pressed", String(hard));
  }
  function updateHud() {
    const hard = state.difficulty === "hard";
    el.hearts.textContent = "❤".repeat(state.hearts) + "♡".repeat(Math.max(0, 3 - state.hearts));
    el.lambs.textContent = `🐑 ${state.collected} / ${TOTAL}`;
    el.difficulty.textContent = hard ? "困难模式" : "简单模式";
    el.difficulty.classList.toggle("hard", hard);
  }
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let toastTimer = null;
  function toast(text, dur = 1600) {
    el.toast.textContent = text;
    el.toast.classList.remove("hidden");
    positionToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), dur);
  }

  // 把提示条放到画布上方的深色背景区（完全不挡游戏）；上方没空间时回退到画布内顶部 + 低透明度
  function positionToast() {
    const wrap = $("wrap");
    if (!wrap || !el.toast) return;
    void el.toast.offsetWidth; // 强制重排，确保 offsetHeight 准确
    const wrapRect = wrap.getBoundingClientRect();
    const toastH = el.toast.offsetHeight || 44;
    const gap = 10;
    if (wrapRect.top > toastH + gap + 6) {
      el.toast.style.top = (wrapRect.top - toastH - gap) + "px";
      el.toast.classList.add("toast-outside");
    } else {
      el.toast.style.top = Math.max(8, wrapRect.top + 10) + "px";
      el.toast.classList.remove("toast-outside");
    }
  }

  /* ---------------- 输入 ---------------- */
  window.addEventListener("keydown", ev => {
    const k = ev.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) ev.preventDefault();
    if (k === "escape") {
      if (state.over) { quitToMenu(); return; }
      togglePause();
      return;
    }
    if (k === "m") { toggleMute(); return; }
    if (!state.playing && !state.over && (k === " " || k === "enter")) {
      if (!el.menu.classList.contains("hidden")) { startGame(); return; }
    }
    if (state.over && (k === " " || k === "enter")) { startGame(); return; }
    keys.add(k);
  });
  window.addEventListener("keyup", ev => keys.delete(ev.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  el.btnEasy.addEventListener("click", () => setDifficulty("easy"));
  el.btnHard.addEventListener("click", () => setDifficulty("hard"));
  el.btnStart.addEventListener("click", startGame);
  el.btnResume.addEventListener("click", togglePause);
  el.btnPauseMenu.addEventListener("click", quitToMenu);
  el.btnWinAgain.addEventListener("click", startGame);
  el.btnWinMenu.addEventListener("click", quitToMenu);
  el.btnLoseAgain.addEventListener("click", startGame);
  el.btnLoseMenu.addEventListener("click", quitToMenu);

  /* ---------------- 手机：轮盘 / 按钮 ---------------- */
  const joyEl = $("joystick"), joyBase = $("joyBase"), joyKnob = $("joyKnob");
  const mobileBtns = $("mobileBtns");
  const controlPad = $("controlPad");
  const btnMuteMobile = $("btnMuteMobile"), btnPauseMobile = $("btnPauseMobile");

  // 竖屏分屏：上半屏游戏画面 + 下半屏控制区；横屏：全屏 + 左下角固定轮盘
  function isPortraitSplit() {
    return isTouch && window.innerHeight > window.innerWidth;
  }
  function updateLayout() {
    const portrait = isPortraitSplit();
    document.body.classList.toggle("split-portrait", portrait);
    document.body.classList.toggle("split-landscape", !portrait);
    // 清掉摇杆内联定位：横屏交回 CSS 默认位置，竖屏由按下事件重新定位
    joyEl.style.left = "";
    joyEl.style.top = "";
    joyEl.style.bottom = "";
    resetJoy();
    const wrap = $("wrap");
    if (portrait) {
      joyEl.classList.add("hidden"); // 竖屏默认隐藏，按下才浮出
      // 游戏画面在「上半屏」区域内垂直居中
      if (wrap) {
        const h = wrap.getBoundingClientRect().height;
        const top = Math.max(0, (window.innerHeight * 0.5 - h) / 2);
        wrap.style.marginTop = top + "px";
      }
    } else {
      if (wrap) wrap.style.marginTop = "";
    }
    setMobileControls(state.playing);
    positionToast();
  }

  function updateMuteIcon() { btnMuteMobile.textContent = muted ? "🔇" : "🔊"; }
  function setMobileControls(visible) {
    if (!isTouch) return;
    const portrait = isPortraitSplit();
    if (portrait) {
      controlPad.classList.toggle("hidden", !visible);
      joyEl.classList.add("hidden"); // 竖屏由控制区的按下事件控制显示
    } else {
      controlPad.classList.add("hidden");
      joyEl.classList.toggle("hidden", !visible);
    }
    mobileBtns.classList.toggle("hidden", !visible);
    btnPauseMobile.classList.toggle("hidden", !visible || !state.playing || state.over);
  }
  function resetJoy() {
    joy.active = false; joy.x = 0; joy.y = 0;
    joyKnob.style.transform = "translate(-50%, -50%)";
    joyEl.classList.remove("on");
  }

  function setupJoystick() {
    const updateJoy = (cx, cy) => {
      let dx = cx - joy.baseX, dy = cy - joy.baseY;
      const d = Math.hypot(dx, dy);
      const max = joy.radius;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      joyKnob.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
      joy.x = dx / max;
      joy.y = dy / max;
    };
    // 以当前摇杆中心为基准开始（横屏固定中心 / 竖屏浮动到触点）
    const startAt = (cx, cy) => {
      if (!state.playing || state.paused || state.over) return;
      // 必须先显示再读尺寸：display:none 时 getBoundingClientRect 全为 0，会导致基准点错误
      joyEl.classList.remove("hidden");
      const rect = joyBase.getBoundingClientRect();
      joy.baseX = rect.left + rect.width / 2;
      joy.baseY = rect.top + rect.height / 2;
      joy.active = true;
      joyEl.classList.add("on");
      updateJoy(cx, cy);
    };
    const onMove = (e) => {
      if (!joy.active) return;
      if (e.cancelable) e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      updateJoy(t.clientX, t.clientY);
    };
    const onEnd = () => {
      resetJoy();
      if (isPortraitSplit()) joyEl.classList.add("hidden"); // 竖屏抬起即隐藏
    };

    // 横屏：固定轮盘直接接收触摸
    joyBase.addEventListener("touchstart", (e) => {
      if (isPortraitSplit()) return; // 竖屏交给下半屏控制区
      if (e.cancelable) e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      startAt(t.clientX, t.clientY);
    }, { passive: false });
    joyBase.addEventListener("touchmove", onMove, { passive: false });
    joyBase.addEventListener("touchend", onEnd);
    joyBase.addEventListener("touchcancel", onEnd);

    // 竖屏：下半屏控制区，手指/鼠标按下处以触点为中心浮出摇杆
    const beginFloat = (cx, cy) => {
      if (!isPortraitSplit()) return false;
      if (!state.playing || state.paused || state.over) return false;
      const pad = controlPad.getBoundingClientRect();
      // 摇杆 128×128，中心对准触点，并钳制在控制区内不越界
      let left = cx - 64, top = cy - 64;
      left = clamp(left, pad.left, pad.right - 128);
      top = clamp(top, pad.top, pad.bottom - 128);
      joyEl.style.left = left + "px";
      joyEl.style.top = top + "px";
      joyEl.style.bottom = "auto";
      startAt(cx, cy);
      return true;
    };
    if (controlPad) {
      controlPad.addEventListener("touchstart", (e) => {
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0];
        beginFloat(t.clientX, t.clientY);
      }, { passive: false });
      controlPad.addEventListener("touchmove", onMove, { passive: false });
      controlPad.addEventListener("touchend", onEnd);
      controlPad.addEventListener("touchcancel", onEnd);
      // 桌面预览（?touch=1）：鼠标按下控制区同样可用
      controlPad.addEventListener("mousedown", (e) => { beginFloat(e.clientX, e.clientY); });
    }

    // 桌面鼠标调试（?touch=1 预览）
    joyBase.addEventListener("mousedown", (e) => startAt(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => { if (joy.active) updateJoy(e.clientX, e.clientY); });
    window.addEventListener("mouseup", onEnd);
  }

  if (isTouch) {
    setupJoystick();
    updateMuteIcon();
    updateLayout();
    // 首次触控解锁 WebAudio
    const unlockAudio = () => { initAudio(); document.removeEventListener("touchstart", unlockAudio); };
    document.addEventListener("touchstart", unlockAudio, { once: true });
    btnMuteMobile.addEventListener("click", () => { toggleMute(); updateMuteIcon(); });
    btnPauseMobile.addEventListener("click", togglePause);
    // 横竖屏切换时重排布局
    window.addEventListener("resize", updateLayout);
    window.addEventListener("orientationchange", () => setTimeout(updateLayout, 200));
  }

  // 桌面端（非触控）窗口尺寸变化时也重算提示条位置；触控端由 updateLayout 负责
  if (!isTouch) {
    window.addEventListener("resize", positionToast);
  }

  /* ---------------- 更新 ---------------- */
  function update(dt, now) {
    if (!state.playing || state.paused || state.over) return;
    state.time += dt;
    el.timer.textContent = fmtTime(state.time);
    if (player.inv > 0) player.inv -= dt;
    if (homeHintCd > 0) homeHintCd -= dt;

    // 羊妈妈移动（键盘 或 手机轮盘，斜向归一化）
    let dx = 0, dy = 0;
    if (joy.active) {
      dx = joy.x; dy = joy.y;
      if (Math.hypot(dx, dy) < 0.18) { dx = 0; dy = 0; }   // 轮盘死区，防拇指误触漂移
    } else {
      if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
      if (keys.has("d") || keys.has("arrowright")) dx += 1;
      if (keys.has("w") || keys.has("arrowup")) dy -= 1;
      if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    }
    player.moving = Math.hypot(dx, dy) > 0.05;
    if (player.moving) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      player.x = clamp(player.x + dx * player.speed * dt, 36, W - 36);
      player.y = clamp(player.y + dy * player.speed * dt, 70, H - 36);
      if (dx !== 0) player.face = dx > 0 ? 1 : -1;
    }
    player.vx = dx * player.speed;   // 供包抄狼预判走位
    player.vy = dy * player.speed;
    collideObstacles(player, 18);
    // 记录轨迹（小羊跟随用）
    trail.unshift({ x: player.x, y: player.y });
    if (trail.length > 900) trail.pop();

    // 收集小羊
    for (const lb of lambs) {
      if (!lb.got && dist(player, lb) < 44) {
        lb.got = true;
        state.collected++;
        sfx.collect();
        updateHud();
        for (let i = 0; i < 6; i++) {
          particles.push({
            x: lb.x, y: lb.y - 20, vx: rand(-25, 25), vy: rand(-70, -30),
            life: 0.9, maxLife: 0.9, type: "heart", color: "#ff9fb0", size: rand(8, 12),
          });
        }
        toast(state.collected === TOTAL ? "小羊集齐啦！快回家！" : `小羊跟上你了（${state.collected}/${TOTAL}）`, 1400);
      }
    }

    // 简单模式全部直追；困难模式一只直追，另一只预判走位绕前包抄
    const chasers = wolves.filter(w => w.mode === "chase");
    if (state.difficulty === "hard" && chasers.length === 2) {
      const [a, b] = chasers;
      const da = dist(a, player), db = dist(b, player);
      a.role = da <= db ? "chaser" : "flanker";
      b.role = da <= db ? "flanker" : "chaser";
      if (!state.pincerHinted) {
        state.pincerHinted = true;
        toast("两只狼包抄你了！绕石头甩开它们！", 1800);
      }
    }

    for (const w of wolves) {
      const d = dist(w, player);
      if (w.alertCd > 0) w.alertCd -= dt;
      if (w.mode === "patrol" && d < 230) {
        w.mode = "chase";
        if (w.alertCd <= 0) {
          sfx.alert();
          toast("大灰狼发现你了！快跑！", 1200);
          w.alertCd = 6;
        }
      } else if (w.mode === "chase" && d > 330) {
        w.mode = "patrol";
        w.tx = rand(80, W - 200); w.ty = rand(90, H - 120);
        w.wanderT = 0;
      }
      let tx, ty, speed;
      if (w.mode === "chase") {
        speed = 195;
        if (state.difficulty === "hard" && w.role === "flanker" && chasers.length === 2) {
          // 包抄：玩家在移动时拦截其前方 0.75 秒的位置；不动则绕到侧翼
          if (Math.hypot(player.vx, player.vy) > 30) {
            tx = player.x + player.vx * 0.75;
            ty = player.y + player.vy * 0.75;
          } else {
            const other = wolves.find(o => o !== w);
            const px = player.x - other.x, py = player.y - other.y;
            const pl = Math.hypot(px, py) || 1;
            tx = player.x + (-py / pl) * 110;
            ty = player.y + (px / pl) * 110;
          }
          tx = clamp(tx, 40, W - 40);
          ty = clamp(ty, 80, H - 40);
        } else {
          tx = player.x; ty = player.y;
        }
      } else {
        tx = w.tx; ty = w.ty; speed = 85;
        w.wanderT += dt;
        // 到达目标或卡住太久都换一个新巡逻点
        if (Math.hypot(w.x - tx, w.y - ty) < 20 || w.wanderT > 6) {
          w.tx = rand(80, W - 200); w.ty = rand(90, H - 120);
          w.wanderT = 0;
        }
      }
      let mx = tx - w.x, my = ty - w.y;
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml; my /= ml;
      // 狼不敢靠近家，绕开门口
      const dh = dist(w, HOME);
      if (dh < 190) {
        const push = (190 - dh) / 190 * 2.2;
        mx += (w.x - HOME.x) / (dh || 1) * push;
        my += (w.y - HOME.y) / (dh || 1) * push;
        const l2 = Math.hypot(mx, my) || 1;
        mx /= l2; my /= l2;
      }
      w.x = clamp(w.x + mx * speed * dt, 30, W - 30);
      w.y = clamp(w.y + my * speed * dt, 66, H - 30);
      collideObstacles(w, 20);
      w.face = mx >= 0 ? 1 : -1;
      w.legT += dt * (w.mode === "chase" ? 16 : 8);

      // 抓到羊妈妈
      if (d < 40 && player.inv <= 0) {
        state.hearts--;
        player.inv = 1.8;
        sfx.hurt();
        updateHud();
        const kl = d || 1;
        player.x = clamp(player.x + (player.x - w.x) / kl * 75, 36, W - 36);
        player.y = clamp(player.y + (player.y - w.y) / kl * 75, 70, H - 36);
        for (let i = 0; i < 8; i++) {
          particles.push({
            x: player.x, y: player.y - 30, vx: rand(-60, 60), vy: rand(-90, -20),
            life: 0.7, maxLife: 0.7, type: "star", color: "#ff5f6d", size: rand(6, 10),
          });
        }
        if (state.hearts <= 0) { endGame(false); return; }
        toast("被大灰狼扑到了！小心！", 1200);
      }
    }

    // 狼之间轻微排斥，避免两只叠成一坨
    if (wolves.length === 2) {
      const [a, b] = wolves;
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
      if (dd > 0.001 && dd < 46) {
        const push = (46 - dd) / 2;
        a.x -= dx / dd * push; a.y -= dy / dd * push;
        b.x += dx / dd * push; b.y += dy / dd * push;
      }
    }

    // 回家判定
    if (dist(player, HOME) < HOME.r) {
      if (state.collected === TOTAL) {
        endGame(true);
        return;
      } else if (homeHintCd <= 0) {
        toast(`还有 ${TOTAL - state.collected} 只小羊没找到！`, 1400);
        homeHintCd = 3;
      }
    }

    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === "confetti") p.vx += Math.sin(now / 300 + i) * 8 * dt;
      else p.vy += 60 * dt;
    }
  }

  /* ---------------- 绘制 ---------------- */
  function drawGrass(g) {
    ctx.strokeStyle = "rgba(46,110,60,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(g.x + i * 4 * g.s, g.y);
      ctx.quadraticCurveTo(g.x + i * 5 * g.s, g.y - 7 * g.s, g.x + i * 7 * g.s, g.y - 11 * g.s);
    }
    ctx.stroke();
  }
  function drawFlower(f) {
    ctx.fillStyle = f.c;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * 4 * f.s, f.y + Math.sin(a) * 4 * f.s, 3.4 * f.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.6 * f.s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Q版羊：卷毛云朵身体 + 米色脸 + 大眼睛，妈妈戴蝴蝶结
  function drawSheep(x, y, scale, isMom, face, legT, moving) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face * scale, scale);
    // 影子
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.beginPath();
    ctx.ellipse(0, 22, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 腿（走路交替）
    const swing = moving ? Math.sin(legT) * 4 : 0;
    ctx.fillStyle = "#7a6a5c";
    for (const [lx, ph] of [[-14, 0], [12, Math.PI]]) {
      const off = moving ? Math.sin(legT + ph) * 4 : 0;
      ctx.beginPath();
      ctx.roundRect(lx - 3 + off, 12, 7, 14, 3);
      ctx.fill();
    }
    // 卷毛身体（云朵）
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e9ded2";
    ctx.lineWidth = 1.6;
    const puffs = [[-18, -2, 13], [-10, -12, 14], [4, -14, 14], [16, -8, 13], [18, 4, 12], [4, 8, 15], [-12, 8, 13]];
    for (const [px, py, pr] of puffs) {
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // 耳朵
    ctx.fillStyle = "#f2ddc8";
    ctx.beginPath();
    ctx.ellipse(16, -16, 4, 8, 0.7, 0, Math.PI * 2);
    ctx.fill();
    // 头
    ctx.fillStyle = "#f7e6d4";
    ctx.beginPath();
    ctx.ellipse(22, -6, 12, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头顶卷毛
    ctx.fillStyle = "#ffffff";
    for (const [px, py, pr] of [[16, -18, 6], [23, -20, 6.5], [29, -16, 5.5]]) {
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    // 眼睛
    ctx.fillStyle = "#3a3230";
    ctx.beginPath();
    ctx.arc(25, -8, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(25.9, -8.9, 0.9, 0, Math.PI * 2);
    ctx.fill();
    // 腮红 + 嘴
    ctx.fillStyle = "rgba(255,150,160,0.55)";
    ctx.beginPath();
    ctx.ellipse(27, -1, 3.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b08a70";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(30, 0, 2.6, 0.2, Math.PI * 0.85);
    ctx.stroke();
    // 妈妈的粉色蝴蝶结
    if (isMom) {
      ctx.fillStyle = "#ff8fa8";
      ctx.beginPath();
      ctx.moveTo(10, -22);
      ctx.lineTo(2, -28); ctx.lineTo(3, -17); ctx.closePath();
      ctx.moveTo(10, -22);
      ctx.lineTo(17, -29); ctx.lineTo(17, -17); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff6f92";
      ctx.beginPath();
      ctx.arc(10, -22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Q版大灰狼：灰蓝色、尖耳、黄眼睛、尖牙、蓬松尾巴
  function drawWolf(w, now) {
    const { x, y, face } = w;
    const chasing = w.mode === "chase";
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    // 影子
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 24, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // 尾巴
    ctx.fillStyle = "#7e8694";
    ctx.beginPath();
    ctx.moveTo(-22, 2);
    ctx.quadraticCurveTo(-46, -4 + Math.sin(now / 200) * 3, -44, -22);
    ctx.quadraticCurveTo(-34, -14, -24, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#aab2bf";
    ctx.beginPath();
    ctx.arc(-42, -20, 6, 0, Math.PI * 2);
    ctx.fill();
    // 腿
    ctx.fillStyle = "#5d6470";
    for (const [lx, ph] of [[-14, 0], [12, Math.PI]]) {
      const off = Math.sin(w.legT + ph) * (chasing ? 5 : 2.5);
      ctx.beginPath();
      ctx.roundRect(lx - 3.5 + off, 12, 8, 14, 3.5);
      ctx.fill();
    }
    // 身体
    ctx.fillStyle = "#8a93a3";
    ctx.beginPath();
    ctx.ellipse(-2, 0, 26, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b9c1cd";
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 尖耳
    ctx.fillStyle = "#7e8694";
    for (const [ex, ey, rot] of [[12, -22, -0.25], [26, -20, 0.25]]) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-6, 4); ctx.lineTo(0, -12); ctx.lineTo(7, 4); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c9a0a8";
      ctx.beginPath();
      ctx.moveTo(-2.6, 2); ctx.lineTo(0, -6); ctx.lineTo(3.4, 2); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7e8694";
      ctx.restore();
    }
    // 头
    ctx.fillStyle = "#8a93a3";
    ctx.beginPath();
    ctx.ellipse(20, -8, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // 吻部
    ctx.fillStyle = "#aab2bf";
    ctx.beginPath();
    ctx.ellipse(32, -3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // 鼻头
    ctx.fillStyle = "#3a3230";
    ctx.beginPath();
    ctx.ellipse(40, -5, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 尖牙
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(30, 2); ctx.lineTo(32.4, 7); ctx.lineTo(34.6, 2); ctx.closePath();
    ctx.fill();
    // 黄眼睛 + 竖瞳
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.ellipse(22, -11, 4.4, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2422";
    ctx.beginPath();
    ctx.ellipse(23, -11, 1.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 凶眉毛
    ctx.strokeStyle = "#4a5260";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(15, -18); ctx.lineTo(27, -15);
    ctx.stroke();
    ctx.restore();
    // 追击提示"!"
    if (chasing) {
      ctx.fillStyle = "#ff5f6d";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", x, y - 46 + Math.sin(now / 150) * 3);
    }
  }

  function drawHome(now) {
    const { x, y } = HOME;
    // 家的范围（虚线圈）
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.ellipse(x, y + 16, HOME.r, HOME.r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // 栅栏
    ctx.fillStyle = "#a0764f";
    for (const fx of [-62, 58]) {
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + fx - 4, y - 4 + i * 0, 8, 34);
        ctx.fillRect(x + fx - 4 + i * 14, y - 4, 8, 34);
      }
      ctx.fillRect(x + fx - 8, y + 6, 50, 6);
    }
    // 木屋
    ctx.fillStyle = "#c89868";
    ctx.fillRect(x - 40, y - 40, 80, 56);
    ctx.strokeStyle = "#a5764a";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 40, y - 30 + i * 12);
      ctx.lineTo(x + 40, y - 30 + i * 12);
      ctx.stroke();
    }
    // 红屋顶
    ctx.fillStyle = "#d9695f";
    ctx.beginPath();
    ctx.moveTo(x - 52, y - 38);
    ctx.lineTo(x, y - 82);
    ctx.lineTo(x + 52, y - 38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c2564d";
    ctx.fillRect(x - 52, y - 42, 104, 7);
    // 门
    ctx.fillStyle = "#7a5a3d";
    ctx.beginPath();
    ctx.roundRect(x - 13, y - 18, 26, 34, [12, 12, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(x + 7, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // 圆窗
    ctx.fillStyle = "#fff3d6";
    ctx.beginPath();
    ctx.arc(x, y - 46, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a5764a";
    ctx.lineWidth = 2;
    ctx.stroke();
    // 烟囱和炊烟
    ctx.fillStyle = "#b0a294";
    ctx.fillRect(x + 20, y - 76, 12, 20);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 3; i++) {
      const t = ((now / 1200 + i * 0.33) % 1);
      ctx.globalAlpha = 0.45 * (1 - t);
      ctx.beginPath();
      ctx.arc(x + 26 + Math.sin(t * 5) * 5, y - 80 - t * 34, 4 + t * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 家字牌
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.roundRect(x - 18, y + 26, 36, 22, 6);
    ctx.fill();
    ctx.fillStyle = "#3f7d4e";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("家", x, y + 43);
  }

  // 障碍物绘制：石头 / 大树（三层树冠会轻轻摇摆）/ 灌木
  function drawObstacle(o, now) {
    const { x, y } = o;
    if (o.type === "rock") {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(x, y + o.r * 0.55, o.r * 1.1, o.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9aa0a8";
      ctx.beginPath();
      ctx.ellipse(x, y, o.r, o.r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b7bdc4";
      ctx.beginPath();
      ctx.ellipse(x - o.r * 0.2, y - o.r * 0.25, o.r * 0.62, o.r * 0.45, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b9199";
      ctx.beginPath();
      ctx.ellipse(x + o.r * 0.85, y + o.r * 0.4, o.r * 0.3, o.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.type === "tree") {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(x, y + 14, 26, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6844";
      ctx.fillRect(x - 7, y - 18, 14, 34);
      const sway = Math.sin(now / 900 + x) * 2;
      ctx.fillStyle = "#4e8f57";
      ctx.beginPath(); ctx.arc(x + sway, y - 48, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#5fa265";
      ctx.beginPath(); ctx.arc(x - 14 + sway, y - 34, 24, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 16 + sway, y - 36, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#74b877";
      ctx.beginPath(); ctx.arc(x - 6 + sway, y - 52, 16, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.beginPath();
      ctx.ellipse(x, y + 10, o.r, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4e8f57";
      for (const [bx, by, br] of [[-12, 0, 18], [10, -2, 17], [0, -12, 18], [0, 4, 20]]) {
        ctx.beginPath(); ctx.arc(x + bx, y + by, br, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#6db573";
      ctx.beginPath(); ctx.arc(x - 6, y - 10, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath(); ctx.arc(x + 12, y - 8, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHeart(x, y, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s, y - s * 0.45, x - s * 0.4, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.4, y - s * 1.1, x + s, y - s * 0.45, x, y + s * 0.35);
    ctx.fill();
    ctx.restore();
  }

  function render(now) {
    // 草地背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#8fc98a");
    bg.addColorStop(0.6, "#7cba76");
    bg.addColorStop(1, "#6aab66");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // 浅色斑块
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (const p of patches) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const g of grass) drawGrass(g);
    for (const f of flowers) drawFlower(f);

    drawHome(now);

    // 实体按 y 排序绘制（俯视角遮挡）
    const drawList = [];
    // 障碍物参与排序：玩家/狼可以躲到树后，被树冠遮住
    for (const o of obstacles) {
      drawList.push({ y: o.y + 6, fn: () => drawObstacle(o, now) });
    }
    for (const lb of lambs) {
      if (!lb.got) {
        drawList.push({ y: lb.y, fn: () => {
          const bob = Math.sin(now / 350 + lb.phase) * 3;
          drawSheep(lb.x, lb.y + bob, 0.55, false, Math.sin(now / 900 + lb.phase) > 0 ? 1 : -1, 0, false);
        }});
      }
    }
    // 跟随的小羊：沿羊妈妈轨迹排队
    const followers = lambs.filter(l => l.got);
    followers.forEach((lb, i) => {
      const idx = Math.min((i + 1) * 16, trail.length - 1);
      const target = trail[Math.max(0, idx)] || { x: player.x, y: player.y };
      lb.fx = lb.fx === undefined ? target.x : lb.fx + (target.x - lb.fx) * 0.18;
      lb.fy = lb.fy === undefined ? target.y : lb.fy + (target.y - lb.fy) * 0.18;
      const face = target.x < lb.fx - 1 ? 1 : target.x > lb.fx + 1 ? -1 : player.face;
      const bob = Math.abs(Math.sin(now / 160 + i)) * -5;
      drawList.push({ y: lb.fy, fn: () => drawSheep(lb.fx, lb.fy + bob, 0.55, false, face, now / 90, true) });
    });
    for (const w of wolves) {
      drawList.push({ y: w.y, fn: () => drawWolf(w, now) });
    }
    drawList.push({ y: player.y, fn: () => {
      // 无敌闪烁
      if (player.inv > 0 && Math.floor(now / 90) % 2 === 0) ctx.globalAlpha = 0.35;
      drawSheep(player.x, player.y, 1, true, player.face, now / 80, player.moving);
      ctx.globalAlpha = 1;
    }});
    drawList.sort((a, b) => a.y - b.y);
    for (const d of drawList) d.fn();

    // 粒子
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === "heart") {
        drawHeart(p.x, p.y, p.size, p.color, a);
      } else if (p.type === "star") {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size * 2}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("✦", p.x, p.y);
        ctx.restore();
      } else if (p.type === "confetti") {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.y / 30);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    }

    // 集齐后家的方向指引箭头
    if (state.playing && !state.over && state.collected === TOTAL) {
      const a = Math.atan2(HOME.y - player.y, HOME.x - player.x);
      const ax = player.x + Math.cos(a) * 60;
      const ay = player.y - 52 + Math.sin(now / 250) * 5;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = "#ffd23f";
      ctx.strokeStyle = "#d96f2b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -10); ctx.lineTo(10, -10); ctx.lineTo(10, -18);
      ctx.lineTo(26, 0); ctx.lineTo(10, 18); ctx.lineTo(10, 10); ctx.lineTo(-14, 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("回家！", ax + 4, ay - 26);
    }
  }

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt, now);
    render(now);
    requestAnimationFrame(loop);
  }

  spawnLambs();
  spawnWolves();
  // ?autostart=1 调试用：自动开始一局，便于截图预览
  if (/[?&]autostart=1/.test(location.search)) { setTimeout(startGame, 300); }
  requestAnimationFrame(loop);
})();
