(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const R = Math.random;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

  let W = 800, H = 600, running = false, rafId = 0;
  let score = 0, lives = 3, level = 1, beaten = 0, rocketLvl = 0;
  let lastTime = 0, clock = 0, rockTimer = 0, shotTimer = 0, manualTimer = 0;
  let waveTimer = 0, alienTimer = 0, power = 0, shake = 0, flash = 0, flashCol = "#fff";
  let rocks = [], bullets = [], ebullets = [], aliens = [];
  let particles = [], rings = [], stars = [], boss = null;

  const keys = { left: false, right: false, up: false, down: false, fire: false };
  const drag = { on: false, id: null, x: 0, y: 0 };
  const player = { x: 400, y: 520, vx: 0, vy: 0, speed: 360, invincible: 0 };

  /* ---------------- Rocket upgrades ---------------- */
  const upgrades = [
    { score: 0, name: "🚀 Oddiy raketa" },
    { score: 1000, name: "🚀🚀 Ikki yonli raketa" },
    { score: 5000, name: "⚡ Uch yo‘nalishli raketa" },
    { score: 10000, name: "🔥 ULTRA RAKETA" },
    { score: 20000, name: "🌟 PLAZMA RAKETA" },
    { score: 40000, name: "👑 GALAKTIKA RAKETASI" }
  ];
  // [dx, dy, angle] — the first 7 are the original pattern, the rest are new
  const PAT = [[0,0,0],[-13,5,-.2],[13,5,.2],[-5,0,-.38],[5,0,.38],[-17,5,-.55],[17,5,.55],[-21,6,-.72],[21,6,.72]];
  const COUNT = [1, 3, 5, 7, 7, 9];
  const DMG = [1, 1, 1, 1, 2, 2];
  const INTERVAL = [1, 1, 0.8, 0.55, 0.45, 0.35];
  const BODY_L = ["#5476ce", "#a35cff", "#a35cff", "#a35cff", "#19d69a", "#ffc83a"];
  const BODY_R = ["#6bbfff", "#38eaff", "#38eaff", "#38eaff", "#38eaff", "#ff6bd6"];
  const FLAME = ["#ff9a42", "#ff9a42", "#ff9a42", "#ff32b7", "#35eaff", "#ffd34d"];

  function upgradeLevel() {
    let l = 0;
    for (let i = 0; i < upgrades.length; i++) if (score >= upgrades[i].score) l = i;
    return l;
  }

  const formatNumber = n => Math.floor(n).toLocaleString("de-DE");

  function pop(id, text, cls) {
    const el = $(id);
    el.textContent = text;
    el.className = cls || "";
    void el.offsetWidth;
    el.classList.add("show");
  }

  function updateUI() {
    $("score").textContent = formatNumber(score);
    $("lives").textContent = lives;
    $("level").textContent = level;

    const l = upgradeLevel(), cur = upgrades[l], next = upgrades[l + 1];
    $("rocket-name").textContent = cur.name + (power > 0 ? "  ⚡ KUCHAYTIRILGAN" : "");

    if (next) {
      $("progress").style.width = Math.min(100, (score - cur.score) / (next.score - cur.score) * 100) + "%";
      $("upgrade-text").textContent = "Keyingi raketa: " + formatNumber(next.score) + " ochko";
    } else {
      $("progress").style.width = "100%";
      $("upgrade-text").textContent = "Barcha raketalar ochildi! 🔥";
    }
  }

  function checkUpgrade() {
    const l = upgradeLevel();
    if (l > rocketLvl) {
      rocketLvl = l;
      pop("toast", "🚀 YANGI RAKETA: " + upgrades[l].name);
      flash = 0.35; flashCol = "#9ffaff";
      burst(player.x, player.y, "#9ffaff", 24);
      ring(player.x, player.y, "#9ffaff", 90);
    }
  }

  // Level n starts at 100*n*(n-1) points; capped until the pending boss is beaten
  function checkLevel() {
    let n = 1;
    while (100 * (n + 1) * n <= score) n++;
    n = Math.min(n, (beaten + 1) * 5);
    if (n > level) {
      level = n;
      if (level % 5 !== 0) pop("toast", "🏆 DARAJA " + level + "!");
    }
  }

  function addScore(n) {
    score += n;
    checkUpgrade();
    checkLevel();
    updateUI();
  }

  /* ---------------- Setup / resize ---------------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    player.x = clamp(player.x, 22, W - 22);
    player.y = clamp(player.y, H * 0.45, H - 45);
    if (!running) player.y = H - 70;

    if (boss) {
      boss.r = clamp(W * 0.14, 42, 80) * (1 + 0.05 * Math.min(boss.k - 1, 4));
      boss.ty = 40 + boss.r * 0.9;
      boss.x = clamp(boss.x, boss.r, W - boss.r);
    }

    stars = Array.from({ length: Math.floor(W * H / 2500) }, () => ({
      x: R() * W, y: R() * H, size: R() * 1.8 + 0.4,
      speed: 15 + R() * 45, p: R() * 6, f: 1 + R() * 3
    }));
    draw();
  }
  window.addEventListener("resize", resize);

  function startGame() {
    cancelAnimationFrame(rafId);
    score = 0; lives = 3; level = 1; beaten = 0; rocketLvl = 0;
    rocks = []; bullets = []; ebullets = []; aliens = [];
    particles = []; rings = []; boss = null;
    rockTimer = 0.4; shotTimer = 0; manualTimer = 0; waveTimer = 0; alienTimer = 0;
    power = 0; shake = 0; flash = 0; clock = 0;
    player.x = W / 2; player.y = H - 70; player.vx = player.vy = 0; player.invincible = 0;
    drag.on = false;

    $("boss-hud").classList.add("off");
    $("warning").className = ""; $("toast").className = "";
    updateUI();

    $("menu-title").textContent = "COSMIC ROCKET";
    $("menu-text").textContent = "Toshlarni yo‘q qil va kuchli raketalarni och!";
    $("start").textContent = "QAYTA BOSHLASH";
    $("overlay").classList.add("hidden");
    $("start").blur();

    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(rafId);
    keys.fire = false;
    $("menu-title").textContent = "O‘YIN TUGADI!";
    $("menu-text").textContent = "Natijang: " + formatNumber(score) + " ochko (daraja " + level + "). Yana urinib ko‘r!";
    $("start").textContent = "QAYTA O‘YNASH";
    $("overlay").classList.remove("hidden");
  }

  function hurt() {
    if (player.invincible > 0) return;
    lives--;
    player.invincible = 1.2;
    shake = 10; flash = 0.3; flashCol = "#ff2d55";
    burst(player.x, player.y, "#ff6b9b", 18);
    updateUI();
    if (lives <= 0) gameOver();
  }

  /* ---------------- Effects ---------------- */
  function burst(x, y, color, count = 10) {
    if (particles.length > 320) return;
    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2, sp = 30 + R() * 150;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.45 + R() * 0.25, maxLife: 0.7, color, size: 1.5 + R() * 2.5 });
    }
  }

  function ring(x, y, color, max) {
    if (rings.length < 16) rings.push({ x, y, r: 4, max, life: 0.4, color });
  }

  /* ---------------- Shooting ---------------- */
  function addBullet(x, y, angle, dmg) {
    bullets.push({ x, y, vx: Math.sin(angle) * 110, vy: -560 * Math.cos(angle), size: 3, dmg });
  }

  function shoot(manual) {
    if (!running) return;
    const l = upgradeLevel();
    const dmg = DMG[l] + (power > 0 ? 1 : 0);
    const n = manual ? 1 : COUNT[l];
    const y = player.y - 23;
    for (let i = 0; i < n; i++) {
      const p = PAT[i];
      addBullet(player.x + p[0], y + p[1], p[2], dmg);
    }
    burst(player.x, y, "#a7ffff", manual ? 1 : 3);
  }

  /* ---------------- Asteroids ---------------- */
  const RT = {
    small:   { r: [16, 21], hp: 1, pts: 10,  spd: 105, c: ["#ffd5a1", "#a2685d", "#342b49"], glow: "#ff784d" },
    large:   { r: [28, 28], hp: 2, pts: 25,  spd: 75,  c: ["#ffd5a1", "#a2685d", "#342b49"], glow: "#ff784d" },
    armored: { r: [31, 31], hp: 4, pts: 60,  spd: 70,  c: ["#e6f0ff", "#6d7f9e", "#222b45"], glow: "#8fb8ff" },
    giant:   { r: [50, 50], hp: 8, pts: 150, spd: 45,  c: ["#ffcf9a", "#8a4b2b", "#2a1620"], glow: "#ff5a2a" },
    fast:    { r: [13, 13], hp: 1, pts: 30,  spd: 250, c: ["#e6ffff", "#2fb8c9", "#0b3347"], glow: "#35eaff" }
  };

  const diff = () => 1 + Math.min(0.05 * (level - 1), 0.75);

  function makeRock(type, x, y, speed) {
    const t = RT[type], r = t.r[0] + R() * (t.r[1] - t.r[0]);
    rocks.push({
      type, x, y, r, hp: t.hp, maxHp: t.hp, hit: 0,
      speed: speed || (t.spd + R() * 60) * (type === "fast"
        ? 1 + Math.min(0.03 * Math.max(0, level - 2), 0.4) : diff()),
      vx: type === "fast" ? (R() - 0.5) * 90 : 0,
      angle: R() * 6, spin: (R() - 0.5) * (type === "giant" ? 0.8 : 2),
      shape: Array.from({ length: 9 }, () => 0.75 + R() * 0.4)
    });
  }

  function pickRockType() {
    const w = [["small", Math.max(20, 48 - 2 * level)], ["large", 28]];
    if (level >= 2) w.push(["fast", Math.min(8 + level * 2, 22)]);
    if (level >= 3) w.push(["armored", Math.min(6 + level * 2, 24)]);
    if (level >= 4 && !rocks.some(r => r.type === "giant")) w.push(["giant", Math.min(3 + level, 12)]);
    let sum = 0; for (const e of w) sum += e[1];
    let v = R() * sum;
    for (const e of w) { v -= e[1]; if (v <= 0) return e[0]; }
    return "small";
  }

  function spawnRock() {
    if (rocks.length >= 28) return;
    const type = pickRockType(), r = RT[type].r[0];
    makeRock(type, r + R() * (W - 2 * r), -r - 5);
  }

  // A row of asteroids that always leaves a wide gap to fly through
  function spawnWave() {
    const cols = Math.max(5, Math.floor(W / 85)), gap = Math.floor(R() * (cols - 1));
    const speed = 100 * diff();
    for (let c = 0; c < cols; c++) {
      if (c === gap || c === gap + 1) continue;
      const big = level >= 3 && R() < 0.25;
      makeRock(big ? "large" : "small", (c + 0.5) * W / cols, -30 - R() * 20, speed);
    }
  }

  /* ---------------- Aliens ---------------- */
  const AT = {
    scout:   { r: 16, hp: 2, pts: 50,  min: 2, col: "#6dff9a" },
    chaser:  { r: 15, hp: 3, pts: 80,  min: 3, col: "#ff5d6e" },
    shooter: { r: 20, hp: 4, pts: 100, min: 4, col: "#c58bff" }
  };

  function spawnAlien() {
    const ok = Object.keys(AT).filter(k => level >= AT[k].min);
    if (!ok.length) return;
    const type = ok[Math.floor(R() * ok.length)], t = AT[type];
    const a = { type, r: t.r, hp: t.hp, maxHp: t.hp, hit: 0, t: R() * 6, vx: 0, vy: 0, x: 0, y: -20 };
    if (type === "scout") {
      const dir = R() < 0.5 ? 1 : -1;
      a.x = dir > 0 ? -20 : W + 20; a.y0 = a.y = 60 + R() * H * 0.3;
      a.vx = dir * Math.min(110 + level * 4, 200);
    } else if (type === "chaser") {
      a.x = 30 + R() * (W - 60);
    } else {
      a.x = 40 + R() * (W - 80); a.ty = 60 + R() * 60;
      a.vx = (R() < 0.5 ? 1 : -1) * 50; a.fireT = 1.5 + R(); a.charge = 0; a.life = 18;
    }
    aliens.push(a);
  }

  function ebullet(x, y, ang, speed, r, col) {
    if (ebullets.length > 140) return;
    ebullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: r || 5, col: col || "#ff5d8f" });
  }

  function updateAliens(dt) {
    for (let i = aliens.length - 1; i >= 0; i--) {
      const a = aliens[i];
      a.t += dt; a.hit = Math.max(0, a.hit - dt);
      let gone = false;

      if (a.type === "scout") {
        a.x += a.vx * dt;
        a.y = a.y0 + Math.sin(a.t * 2.5) * 35;
        gone = a.x < -50 || a.x > W + 50;
      } else if (a.type === "chaser") {
        const cs = Math.min(100 + level * 3, 150);
        const want = clamp((player.x - a.x) * 2, -cs, cs);
        a.vx += (want - a.vx) * Math.min(1, dt * 2.5);
        a.x += a.vx * dt;
        a.y += Math.min(75 + level * 2, 110) * dt;
        gone = a.y > H + 30;
      } else {
        a.life -= dt;
        if (a.life <= 0) { a.y -= 120 * dt; gone = a.y < -40; }
        else {
          if (a.y < a.ty) a.y += 90 * dt;
          a.x += a.vx * dt;
          if (a.x < 30 || a.x > W - 30) a.vx *= -1;
          a.fireT -= dt;
          if (a.charge > 0) {
            a.charge -= dt;
            if (a.charge <= 0) {
              // aimed shot (telegraphed by the glowing muzzle); never fired point-blank
              const ang = player.y - a.y > 120
                ? Math.atan2(player.y - a.y, player.x - a.x) : Math.PI / 2;
              ebullet(a.x, a.y + 14, ang, Math.min(170 + level * 3, 250), 5, "#d9a6ff");
              a.fireT = Math.max(1.4, 2.8 - level * 0.08);
            }
          } else if (a.fireT <= 0) a.charge = 0.5;
        }
      }
      if (gone) { aliens.splice(i, 1); continue; }

      if (player.invincible <= 0 && dist(a.x, a.y, player.x, player.y) < a.r + 14) {
        burst(a.x, a.y, AT[a.type].col, 14); ring(a.x, a.y, AT[a.type].col, 50);
        aliens.splice(i, 1);
        hurt();
        if (!running) return;
        continue;
      }
      if (hitBy(a)) {
        burst(a.x, a.y, AT[a.type].col, 22);
        burst(a.x, a.y, "#ffffff", 6);
        ring(a.x, a.y, AT[a.type].col, 60);
        aliens.splice(i, 1);
        addScore(AT[a.type].pts);
      }
    }
  }

  /* ---------------- Boss ---------------- */
  const BNAMES = ["QORA UCHQUN", "MUZ SARDORI", "OLOV TIRANI", "YULDUZ HUKMDORI"];
  const BC = [
    ["#c93a4d", "#6b1830", "#ff5a6e"], ["#3ac9d6", "#165a78", "#9ff6ff"],
    ["#e8892f", "#7a3a12", "#ffcf6b"], ["#9b5cff", "#3b1a78", "#e0a5ff"]
  ];

  function startBoss() {
    if (boss) return;
    const k = level / 5;
    const r = clamp(W * 0.14, 42, 80) * (1 + 0.05 * Math.min(k - 1, 4));
    const max = Math.round(120 + 110 * (k - 1) + 8 * (k - 1) * (k - 1));
    boss = { k, st: "warn", t: 2.6, t2: 0, r, x: W / 2, y: -200, ty: 40 + r * 0.9, tx: W / 2, mt: 0,
      hp: max, max, hit: 0, ph: 1, cd: 1, charge: 0, seq: null, pat: "", last: "", dead: false, boom: 0 };
    for (const a of aliens) burst(a.x, a.y, "#9dff9d", 8);
    aliens = []; ebullets = [];
    pop("warning", "⚠️ BOSS INCOMING!");
    flash = 0.4; flashCol = "#ff2040"; shake = 6;
  }

  function bossHud() {
    const b = boss;
    if (!b) return;
    const f = clamp(b.hp / b.max, 0, 1);
    $("boss-fill").style.width = (f * 100) + "%";
    $("boss-fill").className = b.ph === 3 ? "p3" : b.ph === 2 ? "p2" : "";
    $("boss-name").textContent = "👹 " + BNAMES[(b.k - 1) % 4] + (b.k > 4 ? " Mk" + Math.ceil(b.k / 4) : "");
    $("boss-phase").textContent = "FAZA " + b.ph + " • " + Math.ceil(b.hp) + "/" + b.max;
  }

  function pickTarget() {
    const b = boss;
    b.tx = b.r + 15 + R() * Math.max(10, W - 2 * b.r - 30);
    b.mt = (1.2 + R() * 1.8) * (b.ph === 3 ? 0.7 : 1);
  }

  function launch(p) {
    const b = boss, k = b.k, ph = b.ph;
    const sp = Math.min(150 + 8 * k, 230) * (ph === 3 ? 1.1 : 1);
    b.cd = Math.max(0.7, 2.1 - 0.1 * Math.min(k, 6)) * [1, 0.75, 0.55][ph - 1];
    const mx = () => b.x, my = () => b.y + b.r * 0.7;
    const aim = () => Math.atan2(player.y - my(), player.x - mx());

    if (p === "spread") {
      const n = 5 + Math.min(k, 4) + (ph > 1 ? 2 : 0);
      for (let i = 0; i < n; i++) ebullet(mx(), my(), Math.PI / 2 + (i - (n - 1) / 2) * 0.24, sp, 6, "#ff7a5a");
    } else if (p === "aimed") {
      b.seq = { n: 3 + (ph > 1 ? 1 : 0), t: 0, iv: 0.35, fire() { ebullet(mx(), my(), aim(), sp * 1.15, 6, "#ffd34d"); } };
    } else if (p === "burst") {
      const a0 = aim();
      b.seq = { n: 6 + ph * 2, t: 0, iv: 0.11, fire() { ebullet(mx(), my(), a0 + (R() - 0.5) * 0.16, sp * 1.2, 5, "#ff5d8f"); } };
    } else if (p === "ring") {
      const n = Math.min(16 + k, 24);
      let step = 0;
      b.seq = { n: 2, t: 0, iv: 0.7, fire() {
        const pa = aim();
        for (let i = 0; i < n; i++) {
          const a = (i + step * 0.5) / n * Math.PI * 2;
          let d = Math.abs(a - pa) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
          if (d < 0.36) continue; // guaranteed gap toward the player
          ebullet(mx(), b.y, a, sp * 0.9, 6, "#e0a5ff");
        }
        step++;
      } };
    } else if (p === "wall") {
      const cols = Math.max(6, Math.floor(W / 70)), gap = 1 + Math.floor(R() * (cols - 3));
      for (let c = 0; c < cols; c++) {
        if (c === gap || c === gap + 1) continue;
        ebullet((c + 0.5) * W / cols, b.y + b.r * 0.8, Math.PI / 2, 190, 6, "#ff9a42");
      }
    }
  }

  function updateBoss(dt) {
    const b = boss;
    b.hit = Math.max(0, b.hit - dt);

    if (b.st === "warn") {
      b.t -= dt;
      if (b.t <= 0) { b.st = "enter"; b.y = -b.r; b.x = W / 2; }
      return;
    }
    if (b.st === "enter") {
      b.y += 120 * dt;
      if (b.y >= b.ty) {
        b.y = b.ty; b.st = "fight"; b.cd = 1.2;
        $("boss-hud").classList.remove("off");
        pickTarget(); bossHud();
      }
      return;
    }
    if (b.st === "dying") {
      b.t -= dt; b.boom -= dt;
      if (b.boom <= 0) {
        b.boom = 0.09;
        burst(b.x + (R() - 0.5) * b.r * 1.6, b.y + (R() - 0.5) * b.r * 1.2, R() < 0.5 ? "#ffb16b" : "#fff2bd", 14);
        if (R() < 0.3) ring(b.x + (R() - 0.5) * b.r, b.y + (R() - 0.5) * b.r, "#ffb16b", 70);
        shake = Math.max(shake, 6);
      }
      if (b.t <= 0) finishBoss();
      return;
    }

    // phases
    const f = b.hp / b.max, ph = f <= 0.35 ? 3 : f <= 0.7 ? 2 : 1;
    if (ph > b.ph) {
      b.ph = ph; flash = 0.5; flashCol = "#ff2040"; shake = 12;
      pop("toast", ph === 2 ? "⚠️ BOSS G‘AZABLANDI!" : "🔥 XAVFLI FAZA!", "danger");
      b.cd = Math.max(b.cd, 1); b.charge = 0; b.seq = null;
      bossHud();
    }

    // movement
    b.mt -= dt;
    if (b.mt <= 0) pickTarget();
    const sp = (90 + 14 * Math.min(b.k, 8)) * [1, 1.15, 1.6][b.ph - 1];
    const dx = b.tx - b.x, step = sp * dt;
    b.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
    b.t2 += dt * 1.5;
    b.y = b.ty + Math.sin(b.t2) * 12;

    // attacks
    if (b.seq) {
      b.seq.t -= dt;
      while (b.seq && b.seq.t <= 0) {
        b.seq.fire(); b.seq.n--; b.seq.t += b.seq.iv;
        if (b.seq.n <= 0) b.seq = null;
      }
    } else if (b.charge > 0) {
      b.charge -= dt;
      if (b.charge <= 0) launch(b.pat);
    } else {
      b.cd -= dt;
      if (b.cd <= 0) {
        const pool = ["spread", "aimed", "burst"];
        if (b.ph === 3) pool.push("ring", "wall");
        const opts = pool.filter(p => p !== b.last);
        b.pat = b.last = opts[Math.floor(R() * opts.length)];
        const special = b.pat === "ring" || b.pat === "wall";
        b.charge = special ? 0.9 : 0.45;
        if (special) { pop("toast", "⚠️ KUCHLI HUJUM!", "danger"); flash = 0.18; flashCol = "#ff2040"; }
      }
    }

    // bullets hit boss
    for (let j = bullets.length - 1; j >= 0; j--) {
      const bl = bullets[j];
      if (dist(b.x, b.y, bl.x, bl.y) < b.r * 0.85 + bl.size) {
        bullets.splice(j, 1);
        b.hp -= bl.dmg; b.hit = 0.06;
        burst(bl.x, bl.y, "#ffffff", 2);
        if (b.hp <= 0 && !b.dead) { defeatBoss(); return; }
      }
    }
    bossHud();

    // body contact
    if (player.invincible <= 0 && dist(b.x, b.y, player.x, player.y) < b.r * 0.8 + 14) hurt();
  }

  // Reward is granted exactly once (guarded by boss.dead)
  function defeatBoss() {
    const b = boss;
    if (b.dead) return;
    b.dead = true; b.st = "dying"; b.t = 2.2; b.boom = 0; b.hp = 0;
    ebullets = []; b.seq = null; b.charge = 0;
    beaten++;
    lives = Math.min(lives + 1, 6);
    power = 12;
    flash = 0.8; flashCol = "#ffffff"; shake = 14;
    $("boss-fill").style.width = "0%";
    addScore(1500 * b.k);
    pop("warning", "💥 BOSS DEFEATED!");
    pop("toast", "🎁 +1 ❤️ va 12 soniya kuchaytirilgan o‘qlar!");
  }

  function finishBoss() {
    const b = boss;
    burst(b.x, b.y, "#ffb16b", 50); burst(b.x, b.y, "#ffffff", 30);
    ring(b.x, b.y, "#ffffff", 160); ring(b.x, b.y, "#ffb16b", 110);
    flash = 1; flashCol = "#ffffff"; shake = 18;
    boss = null;
    $("boss-hud").classList.add("off");
    rockTimer = 0; waveTimer = 0; alienTimer = 0;
    updateUI();
  }

  /* ---------------- Collisions helper ---------------- */
  function hitBy(e) {
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (dist(e.x, e.y, b.x, b.y) < e.r + b.size) {
        bullets.splice(j, 1);
        e.hp -= b.dmg; e.hit = 0.1;
        burst(b.x, b.y, "#efffff", 3);
        if (e.hp <= 0) return true;
      }
    }
    return false;
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    clock += dt;
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > H) { s.y = 0; s.x = R() * W; }
    }
    if (!running) return;

    // --- movement: smooth acceleration, precise stop, no stuck keys ---
    const ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const iy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    let tvx = 0, tvy = 0;
    if (ix || iy) {
      const l = Math.hypot(ix, iy);
      tvx = ix / l * player.speed; tvy = iy / l * player.speed * 0.85;
    } else if (drag.on) {
      const m = player.speed * 1.15;
      tvx = clamp((drag.x - player.x) * 8, -m, m);
      tvy = clamp((drag.y - player.y) * 8, -m, m);
    }
    const k = 1 - Math.exp(-dt * 16);
    player.vx += (tvx - player.vx) * k;
    player.vy += (tvy - player.vy) * k;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (player.x < 22 || player.x > W - 22) { player.x = clamp(player.x, 22, W - 22); player.vx = 0; }
    const minY = H * 0.45, maxY = H - 45;
    if (player.y < minY || player.y > maxY) { player.y = clamp(player.y, minY, maxY); player.vy = 0; }
    player.invincible = Math.max(0, player.invincible - dt);

    // --- weapons ---
    const lv = upgradeLevel();
    const interval = INTERVAL[lv] * (power > 0 ? 0.7 : 1);
    shotTimer += dt;
    if (shotTimer >= interval) { shotTimer %= interval; shoot(false); }
    if (keys.fire) {
      manualTimer -= dt;
      if (manualTimer <= 0) { shoot(true); manualTimer = 0.22; }
    }
    if (power > 0) { power -= dt; if (power <= 0) { power = 0; updateUI(); } }

    // --- boss trigger (robust: checked every frame) ---
    if (!boss && level === (beaten + 1) * 5) startBoss();
    const bossBusy = boss && (boss.st === "warn" || boss.st === "enter");

    // --- spawning ---
    if (!bossBusy) {
      rockTimer += dt;
      const rate = Math.max(0.28, 0.95 - 0.04 * level - score / 40000) * (boss ? 2.4 : 1);
      if (rockTimer >= rate) { rockTimer = 0; spawnRock(); }

      if (!boss) {
        if (level >= 2) {
          waveTimer += dt;
          if (waveTimer >= Math.max(9, 20 - level)) { waveTimer = 0; spawnWave(); }
          alienTimer += dt;
          if (alienTimer >= Math.max(4.5, 11 - level * 0.7)) {
            alienTimer = 0;
            if (aliens.length < Math.min(1 + Math.floor(level / 3), 4)) spawnAlien();
          }
        }
      }
    }

    // --- bullets ---
    for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    bullets = bullets.filter(b => b.y > -20 && b.x > -20 && b.x < W + 20);

    // --- enemy bullets ---
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const e = ebullets[i];
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.x < -30 || e.x > W + 30 || e.y < -30 || e.y > H + 30) { ebullets.splice(i, 1); continue; }
      if (player.invincible <= 0 && dist(e.x, e.y, player.x, player.y) < e.r + 11) {
        ebullets.splice(i, 1);
        burst(e.x, e.y, e.col, 6);
        hurt();
        if (!running) return;
      }
    }

    // --- boss ---
    if (boss) { updateBoss(dt); if (!running) return; }

    // --- aliens ---
    updateAliens(dt);
    if (!running) return;

    // --- asteroids ---
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];
      r.y += r.speed * dt; r.x += r.vx * dt; r.angle += r.spin * dt;
      r.hit = Math.max(0, r.hit - dt);

      if (player.invincible <= 0 && dist(r.x, r.y, player.x, player.y) < r.r + 14) {
        rocks.splice(i, 1);
        burst(r.x, r.y, "#ffb16b", 10);
        hurt();
        if (!running) return;
        continue;
      }
      if (r.y - r.r > H || r.x < -80 || r.x > W + 80) { rocks.splice(i, 1); continue; }

      if (hitBy(r)) {
        const t = RT[r.type];
        burst(r.x, r.y, r.type === "fast" ? "#35eaff" : "#ffb16b", r.maxHp >= 2 ? 20 : 12);
        if (r.maxHp >= 4) { ring(r.x, r.y, t.glow, r.r * 2); shake = Math.max(shake, r.type === "giant" ? 8 : 3); }
        rocks.splice(i, 1);
        addScore(t.pts);
      }
    }

    // --- particles & rings ---
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const g of rings) { g.r += g.max / 0.4 * dt; g.life -= dt; }
    rings = rings.filter(g => g.life > 0);

    shake = Math.max(0, shake - dt * 30);
    flash = Math.max(0, flash - dt * 2);
  }

  /* ---------------- Drawing ---------------- */
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b1435");
    g.addColorStop(1, "#02040d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#e4faff";
    for (const s of stars) {
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(clock * s.f + s.p);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRocket() {
    const level = upgradeLevel();
    ctx.save();
    ctx.translate(player.x, player.y);

    if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) ctx.globalAlpha = 0.4;

    if (level >= 4 || power > 0) {
      ctx.strokeStyle = power > 0 ? "#ffd34d" : FLAME[level];
      ctx.globalAlpha *= 0.3 + 0.2 * Math.sin(clock * 8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0 ? 0.4 : 1;
    }

    // Flame
    ctx.shadowBlur = 18;
    ctx.shadowColor = FLAME[level];
    ctx.fillStyle = FLAME[level];
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.lineTo(0, 32 + R() * 7);
    ctx.lineTo(7, 12);
    ctx.closePath();
    ctx.fill();

    // Body
    const body = ctx.createLinearGradient(-15, 0, 15, 0);
    body.addColorStop(0, BODY_L[level]);
    body.addColorStop(0.5, "#f4ffff");
    body.addColorStop(1, BODY_R[level]);
    ctx.fillStyle = body;
    ctx.shadowColor = "#69edff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.quadraticCurveTo(15, -10, 11, 11);
    ctx.lineTo(7, 16);
    ctx.lineTo(-7, 16);
    ctx.lineTo(-11, 11);
    ctx.quadraticCurveTo(-15, -10, 0, -27);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Wings
    ctx.fillStyle = level >= 5 ? "#ffd34d" : level >= 2 ? "#ff5ee5" : "#e56cff";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 10, 5);
      ctx.lineTo(s * (level >= 4 ? 25 : 20), level >= 4 ? 20 : 18);
      ctx.lineTo(s * 6, 14);
      ctx.fill();
    }

    // Cabin
    ctx.fillStyle = "#142959";
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a5ffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Side engines
    if (level >= 1) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = level >= 3 ? "#ff43c9" : "#65eeff";
        ctx.fillRect(side * 13 - 3, 3, 6, 12);
      }
    }
    ctx.restore();
  }

  function drawBar(x, y, w, f, col) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 4);
  }

  function drawRock(r) {
    const t = RT[r.type];
    ctx.save();
    ctx.translate(r.x, r.y);

    if (r.type === "fast") {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = t.glow;
      ctx.beginPath();
      ctx.moveTo(-r.r * 0.7, 0); ctx.lineTo(r.r * 0.7, 0); ctx.lineTo(0, -r.r * 4.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.rotate(r.angle);
    ctx.shadowBlur = 10;
    ctx.shadowColor = t.glow;

    const g = ctx.createRadialGradient(-r.r * 0.35, -r.r * 0.4, 2, 0, 0, r.r * 1.2);
    g.addColorStop(0, t.c[0]); g.addColorStop(0.5, t.c[1]); g.addColorStop(1, t.c[2]);
    ctx.fillStyle = r.hit > 0 ? "#ffffff" : g;
    ctx.strokeStyle = t.glow;
    ctx.lineWidth = r.type === "armored" ? 2.5 : 1.5;

    ctx.beginPath();
    r.shape.forEach((v, i) => {
      const a = i / r.shape.length * Math.PI * 2;
      const x = Math.cos(a) * r.r * v, y = Math.sin(a) * r.r * v;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (r.type === "large") {
      ctx.strokeStyle = "#fff2bd"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(3, -r.r * 0.6); ctx.lineTo(-5, 0); ctx.lineTo(5, 4); ctx.lineTo(-3, r.r * 0.5);
      ctx.stroke();
    } else if (r.type === "armored") {
      ctx.strokeStyle = "#cfe0ff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r.r * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r.r * 0.8, 0); ctx.lineTo(r.r * 0.8, 0);
      ctx.moveTo(0, -r.r * 0.8); ctx.lineTo(0, r.r * 0.8); ctx.stroke();
    } else if (r.type === "giant") {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      for (const c of [[-14, -10, 9], [12, 8, 12], [-6, 20, 7]]) {
        ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "#ff7a2a"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-24, 6); ctx.lineTo(-8, -2); ctx.lineTo(4, -20); ctx.moveTo(8, 10); ctx.lineTo(24, 2);
      ctx.stroke();
    }
    ctx.restore();

    // health indicators
    if (r.maxHp === 2) {
      for (let i = 0; i < r.hp; i++) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(r.x - 5 + i * 10, r.y - r.r - 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (r.maxHp >= 4 && r.hp > 0) {
      drawBar(r.x, r.y - r.r - 10, r.r * 1.4, r.hp / r.maxHp, r.type === "giant" ? "#ff7a2a" : "#8fb8ff");
    }
  }

  function drawAlien(a) {
    const col = AT[a.type].col, hit = a.hit > 0;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.shadowBlur = 10; ctx.shadowColor = col;
    ctx.fillStyle = hit ? "#fff" : col;

    if (a.type === "scout") {
      ctx.beginPath(); ctx.ellipse(0, 2, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = hit ? "#fff" : "#d6ffe2";
      ctx.beginPath(); ctx.arc(0, -2, 9, Math.PI, 0); ctx.fill();
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = Math.floor(a.t * 6 + i) % 2 ? "#ffef6b" : "#1d5a35";
        ctx.beginPath(); ctx.arc(i * 10, 3, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (a.type === "chaser") {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const an = i * Math.PI / 4 + a.t * 2, rr = i % 2 ? 9 : 17;
        ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#2a0710";
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffef6b";
      ctx.beginPath(); ctx.arc(Math.max(-2, Math.min(2, (player.x - a.x) / 40)), 1, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 20); ctx.lineTo(-20, -4); ctx.lineTo(-12, -16); ctx.lineTo(12, -16); ctx.lineTo(20, -4);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#2b1450";
      ctx.fillRect(-4, 4, 8, 14);
      ctx.fillStyle = hit ? "#fff" : "#ffef6b";
      ctx.beginPath(); ctx.arc(0, -6, 4, 0, Math.PI * 2); ctx.fill();
      if (a.charge > 0) {
        ctx.fillStyle = "#ffb86b";
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 30);
        ctx.beginPath(); ctx.arc(0, 20, 4 + (0.5 - a.charge) * 10, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    if (a.hp < a.maxHp) drawBar(a.x, a.y - a.r - 10, 30, a.hp / a.maxHp, col);
  }

  function drawBoss() {
    const b = boss, d = (b.k - 1) % 4, C = BC[d], hit = b.hit > 0;
    ctx.save();
    ctx.translate(b.x, b.y);
    const s = b.r / 60;
    ctx.scale(s, s);
    if (b.st === "dying") ctx.translate((R() - 0.5) * 6, (R() - 0.5) * 6);

    const charging = b.charge > 0;
    ctx.shadowBlur = charging ? 30 : 14;
    ctx.shadowColor = charging ? "#ffffff" : C[2];
    ctx.fillStyle = hit ? "#ffffff" : C[0];
    ctx.beginPath();
    if (d === 0) {
      ctx.moveTo(0, 55); ctx.lineTo(-62, 10); ctx.lineTo(-48, -30); ctx.lineTo(-14, -12);
      ctx.lineTo(0, -34); ctx.lineTo(14, -12); ctx.lineTo(48, -30); ctx.lineTo(62, 10);
    } else if (d === 1) {
      ctx.ellipse(0, 0, 62, 28, 0, 0, Math.PI * 2);
    } else if (d === 2) {
      for (let i = 0; i < 8; i++) {
        const an = i * Math.PI / 4 + Math.PI / 8, rr = i % 2 ? 34 : 60;
        ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
    } else {
      ctx.moveTo(0, 58); ctx.lineTo(-42, 0); ctx.lineTo(-24, -48); ctx.lineTo(24, -48); ctx.lineTo(42, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = hit ? "#fff" : C[1];
    if (d === 1) { ctx.beginPath(); ctx.arc(0, -8, 22, Math.PI, 0); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(-30, -6); ctx.lineTo(0, -26); ctx.lineTo(30, -6); ctx.lineTo(0, 24); ctx.closePath(); ctx.fill(); }

    // cannons
    ctx.fillStyle = "#1a0f1f";
    for (const sx of [-1, 1]) ctx.fillRect(sx * 32 - 4, 20, 8, 24);

    // eye / core
    const pulse = 9 + Math.sin(clock * (b.ph === 3 ? 14 : 5)) * 2;
    ctx.fillStyle = charging ? "#fff" : C[2];
    ctx.beginPath(); ctx.arc(0, 0, pulse + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#18061a";
    ctx.beginPath(); ctx.arc(clamp((player.x - b.x) / 60, -3, 3), 2, 5, 0, Math.PI * 2); ctx.fill();

    if (b.k > 4) {
      ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((R() - 0.5) * shake, (R() - 0.5) * shake);
    drawBackground();

    for (const b of bullets) {
      ctx.fillStyle = b.dmg > 1 ? "rgba(255,211,77,.35)" : "rgba(115,245,255,.3)";
      ctx.fillRect(b.x - 4, b.y - 11, 8, 19);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(b.x - 2, b.y - 9, 4, 15);
      ctx.fillStyle = b.dmg > 1 ? "#ffd34d" : "#73f5ff";
      ctx.fillRect(b.x - 1, b.y - 6, 2, 9);
    }

    rocks.forEach(drawRock);
    aliens.forEach(drawAlien);
    if (boss && boss.st !== "warn") drawBoss();

    for (const e of ebullets) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = e.col;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    for (const g of rings) {
      ctx.globalAlpha = Math.max(0, g.life / 0.4);
      ctx.strokeStyle = g.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawRocket();
    ctx.restore();

    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.45, flash * 0.6);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000 || 0, 0.035);
    lastTime = now;
    update(dt);
    draw();
    if (running) rafId = requestAnimationFrame(loop);
  }

  /* ---------------- Input ---------------- */
  function clearInput() {
    keys.left = keys.right = keys.up = keys.down = keys.fire = false;
    drag.on = false;
  }

  function bindHold(button, key) {
    const down = e => {
      e.preventDefault();
      try { button.setPointerCapture(e.pointerId); } catch (_) {}
      keys[key] = true;
      if (key === "fire") manualTimer = 0;
    };
    const up = e => { e.preventDefault(); keys[key] = false; };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
    button.addEventListener("contextmenu", e => e.preventDefault());
  }

  bindHold($("left"), "left");
  bindHold($("right"), "right");
  bindHold($("fire"), "fire");

  // Touch / mouse drag on the arena moves the rocket directly (offset so a finger doesn't hide it)
  function setDrag(e) {
    const rect = canvas.getBoundingClientRect();
    drag.x = e.clientX - rect.left;
    drag.y = e.clientY - rect.top - 50;
  }
  canvas.addEventListener("pointerdown", e => {
    if (!running) return;
    drag.on = true; drag.id = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    setDrag(e);
  });
  canvas.addEventListener("pointermove", e => { if (drag.on && e.pointerId === drag.id) setDrag(e); });
  const dragEnd = e => { if (e.pointerId === drag.id) drag.on = false; };
  canvas.addEventListener("pointerup", dragEnd);
  canvas.addEventListener("pointercancel", dragEnd);
  canvas.addEventListener("lostpointercapture", dragEnd);

  $("start").addEventListener("click", startGame);

  const keyMap = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down"
  };

  window.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = keyMap[e.code];
    if (m) { keys[m] = true; e.preventDefault(); }
    else if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat && running) { keys.fire = true; manualTimer = 0; }
    } else if (e.code === "Enter" && !running && e.target.tagName !== "BUTTON") startGame();
  });

  window.addEventListener("keyup", e => {
    const m = keyMap[e.code];
    if (m) keys[m] = false;
    if (e.code === "Space") keys.fire = false;
  });

  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });

  resize();
  updateUI();
  draw();
})();