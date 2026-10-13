
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const $ = id => document.getElementById(id);

  let W = 800, H = 600;
  let running = false;
  let score = 0, lives = 3;
  let lastTime = 0, rockTimer = 0, shotTimer = 0;
  let rocks = [], bullets = [], particles = [], stars = [];

  const keys = { left: false, right: false };

  const player = {
    x: 400,
    y: 520,
    speed: 340,
    invincible: 0
  };

  const upgrades = [
    {
      score: 0,
      name: "🚀 Oddiy raketa",
      description: "Keyingi raketa: 1.000 ochko"
    },
    {
      score: 1000,
      name: "🚀🚀 Ikki yonli raketa",
      description: "Keyingi raketa: 5.000 ochko"
    },
    {
      score: 5000,
      name: "⚡ Uch yo‘nalishli raketa",
      description: "Keyingi raketa: 10.000 ochko"
    },
    {
      score: 10000,
      name: "🔥 ULTRA RAKETA",
      description: "Eng kuchli raketa ochildi!"
    }
  ];

  function upgradeLevel() {
    let level = 0;

    for (let i = 0; i < upgrades.length; i++) {
      if (score >= upgrades[i].score) level = i;
    }

    return level;
  }

  function formatNumber(n) {
    return Math.floor(n).toLocaleString("de-DE");
  }

  function updateUI() {
    $("score").textContent = formatNumber(score);
    $("lives").textContent = lives;

    const level = upgradeLevel();
    const current = upgrades[level];
    const next = upgrades[level + 1];

    $("rocket-name").textContent = current.name;

    if (next) {
      const range = next.score - current.score;
      const progress = score - current.score;

      $("progress").style.width =
        Math.min(100, progress / range * 100) + "%";

      $("upgrade-text").textContent =
        "Keyingi raketa: " + formatNumber(next.score) + " ochko";
    } else {
      $("progress").style.width = "100%";
      $("upgrade-text").textContent =
        "Barcha raketalar ochildi! 🔥";
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    W = rect.width;
    H = rect.height;

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    player.y = H - 70;
    player.x = Math.max(20, Math.min(W - 20, player.x));

    stars = Array.from(
      { length: Math.floor(W * H / 2500) },
      () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        size: Math.random() * 1.8 + 0.4,
        speed: 15 + Math.random() * 45
      })
    );

    draw();
  }

  window.addEventListener("resize", resize);

  function startGame() {
    score = 0;
    lives = 3;

    rocks = [];
    bullets = [];
    particles = [];

    rockTimer = 0.4;
    shotTimer = 0;
    player.x = W / 2;
    player.invincible = 0;

    updateUI();

    $("menu-title").textContent = "COSMIC ROCKET";
    $("menu-text").textContent =
      "Toshlarni yo‘q qil va kuchli raketalarni och!";
    $("start").textContent = "QAYTA BOSHLASH";
    $("overlay").classList.add("hidden");

    running = true;
    lastTime = performance.now();

    requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;

    $("menu-title").textContent = "O‘YIN TUGADI!";
    $("menu-text").textContent =
      "Natijang: " + formatNumber(score) +
      " ochko. Yana urinib ko‘r!";
    $("start").textContent = "QAYTA O‘YNASH";
    $("overlay").classList.remove("hidden");
  }

  // O‘q yaratish
  function addBullet(x, y, angle = 0) {
    bullets.push({
      x, y,
      vx: Math.sin(angle) * 80,
      vy: -560 * Math.cos(angle),
      size: 3
    });
  }

  // Raketa turiga qarab o‘q otish
  function shoot() {
    if (!running) return;

    const level = upgradeLevel();
    const y = player.y - 23;

    // Barcha raketalar oldinga o‘q otadi
    addBullet(player.x, y);

    // 1.000 ochkoda ikkala yonidan ham o‘q
    if (level >= 1) {
      addBullet(player.x - 13, y + 5, -0.20);
      addBullet(player.x + 13, y + 5, 0.20);
    }

    // 5.000 ochkoda qo‘shimcha yon o‘qlari
    if (level >= 2) {
      addBullet(player.x - 5, y, -0.38);
      addBullet(player.x + 5, y, 0.38);
    }

    // 10.000 ochkoda yanada keng tarqalgan o‘qlar
    if (level >= 3) {
      addBullet(player.x - 17, y + 5, -0.55);
      addBullet(player.x + 17, y + 5, 0.55);
    }

    burst(player.x, y, "#a7ffff", 3);
  }

  function spawnRock() {
    const big = Math.random() < 0.32;
    const r = big ? 28 : 16 + Math.random() * 5;

    rocks.push({
      x: r + Math.random() * (W - 2 * r),
      y: -r,
      r,
      hp: big ? 2 : 1,
      maxHp: big ? 2 : 1,
      speed: (big ? 75 : 105) + Math.random() * 65 +
        Math.min(score / 300, 100),
      angle: Math.random() * 6,
      spin: (Math.random() - 0.5) * 2,
      shape: Array.from(
        { length: 9 },
        () => 0.75 + Math.random() * 0.4
      )
    });
  }

  function burst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 150;

      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        color,
        size: 1.5 + Math.random() * 2.5
      });
    }
  }

  function update(dt) {
    for (const s of stars) {
      s.y += s.speed * dt;

      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }
    }

    if (!running) return;

    if (keys.left) player.x -= player.speed * dt;
    if (keys.right) player.x += player.speed * dt;

    player.x = Math.max(22, Math.min(W - 22, player.x));
    player.invincible = Math.max(0, player.invincible - dt);

    // Oddiy raketa har sekundda o‘q uzadi.
    // Yuqori darajalarda otish tezligi oshadi.
    const level = upgradeLevel();
    const intervals = [1, 1, 0.8, 0.55];

    shotTimer += dt;

    if (shotTimer >= intervals[level]) {
      shotTimer %= intervals[level];
      shoot();
    }

    // Ochko oshganda toshlar tez-tez keladi
    rockTimer += dt;
    const spawnRate = Math.max(0.3, 0.9 - score / 20000);

    if (rockTimer >= spawnRate) {
      rockTimer = 0;
      spawnRock();
    }

    // O‘qlar harakati
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    bullets = bullets.filter(
      b => b.y > -20 && b.x > -20 && b.x < W + 20
    );

    // Toshlar harakati
    for (const r of rocks) {
      r.y += r.speed * dt;
      r.angle += r.spin * dt;
    }

    // To‘qnashuv va toshlarni yo‘q qilish
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];

      if (
        Math.hypot(r.x - player.x, r.y - player.y) < r.r + 17 &&
        player.invincible <= 0
      ) {
        rocks.splice(i, 1);
        lives--;
        player.invincible = 1.2;

        burst(player.x, player.y, "#ff6b9b", 18);
        updateUI();

        if (lives <= 0) {
          gameOver();
          return;
        }

        continue;
      }

      if (r.y - r.r > H) {
        rocks.splice(i, 1);
        continue;
      }

      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];

        if (Math.hypot(r.x - b.x, r.y - b.y) < r.r + b.size) {
          bullets.splice(j, 1);
          r.hp--;

          burst(b.x, b.y, "#efffff", 4);

          if (r.hp <= 0) {
            burst(r.x, r.y, "#ffb16b", r.maxHp === 2 ? 20 : 12);

            score += r.maxHp === 2 ? 25 : 10;
            rocks.splice(i, 1);
            updateUI();
          }

          break;
        }
      }
    }

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }

    particles = particles.filter(p => p.life > 0);
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b1435");
    g.addColorStop(1, "#02040d");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      ctx.fillStyle = "#e4faff";
      ctx.globalAlpha = 0.45 + Math.random() * 0.5;

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

    if (
      player.invincible > 0 &&
      Math.floor(player.invincible * 12) % 2 === 0
    ) {
      ctx.globalAlpha = 0.4;
    }

    // Olov
    ctx.shadowBlur = 18;
    ctx.shadowColor = level >= 3 ? "#ff32b7" : "#ff9a42";
    ctx.fillStyle = level >= 3 ? "#ff32b7" : "#ff9a42";

    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.lineTo(0, 32 + Math.random() * 7);
    ctx.lineTo(7, 12);
    ctx.closePath();
    ctx.fill();

    // Raketa tanasi
    const body = ctx.createLinearGradient(-15, 0, 15, 0);
    body.addColorStop(0, level >= 1 ? "#a35cff" : "#5476ce");
    body.addColorStop(0.5, "#f4ffff");
    body.addColorStop(1, level >= 1 ? "#38eaff" : "#6bbfff");

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

    // Yon qanotlar
    ctx.fillStyle = level >= 2 ? "#ff5ee5" : "#e56cff";

    ctx.beginPath();
    ctx.moveTo(-10, 5);
    ctx.lineTo(-20, 18);
    ctx.lineTo(-6, 14);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(10, 5);
    ctx.lineTo(20, 18);
    ctx.lineTo(6, 14);
    ctx.fill();

    // Kabina
    ctx.fillStyle = "#142959";
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#a5ffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Yuqori raketa darajalarida yon dvigatellar
    if (level >= 1) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = level >= 3 ? "#ff43c9" : "#65eeff";
        ctx.fillRect(side * 13 - 3, 3, 6, 12);
      }
    }

    ctx.restore();
  }

  function drawRock(r) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);

    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ff784d";

    const g = ctx.createRadialGradient(
      -r.r * 0.35, -r.r * 0.4, 2,
      0, 0, r.r * 1.2
    );

    g.addColorStop(0, "#ffd5a1");
    g.addColorStop(0.5, "#a2685d");
    g.addColorStop(1, "#342b49");

    ctx.fillStyle = g;
    ctx.strokeStyle = "#ffb17b";
    ctx.lineWidth = 1.5;

    ctx.beginPath();

    r.shape.forEach((v, i) => {
      const a = i / r.shape.length * Math.PI * 2;
      const x = Math.cos(a) * r.r * v;
      const y = Math.sin(a) * r.r * v;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    if (r.maxHp === 2) {
      // Katta toshning yorig‘i
      ctx.strokeStyle = "#fff2bd";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(3, -r.r * 0.6);
      ctx.lineTo(-5, 0);
      ctx.lineTo(5, 4);
      ctx.lineTo(-3, r.r * 0.5);
      ctx.stroke();

      // Qolgan jonlari
      for (let i = 0; i < r.hp; i++) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(-5 + i * 10, -r.r - 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function draw() {
    drawBackground();

    for (const b of bullets) {
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#b9ffff";

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(b.x - 2, b.y - 9, 4, 15);

      ctx.fillStyle = "#73f5ff";
      ctx.fillRect(b.x - 1, b.y - 6, 2, 9);

      ctx.restore();
    }

    rocks.forEach(drawRock);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    drawRocket();
  }

  function loop(now) {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000 || 0, 0.035);
    lastTime = now;

    update(dt);
    draw();

    if (running) requestAnimationFrame(loop);
  }

  function bindMovement(button, direction) {
    const down = e => {
      e.preventDefault();
      keys[direction] = true;
    };

    const up = e => {
      e.preventDefault();
      keys[direction] = false;
    };

    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  }

  bindMovement($("left"), "left");
  bindMovement($("right"), "right");

  $("fire").addEventListener("pointerdown", e => {
    e.preventDefault();
    shoot();
  });

  $("start").addEventListener("click", startGame);

  window.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key.toLowerCase() === "a" || e.key === "ArrowLeft") {
      keys.left = true;
    }

    if (e.key.toLowerCase() === "d" || e.key === "ArrowRight") {
      keys.right = true;
    }

    if (e.key === " " && running) shoot();

    if (!running && e.key === "Enter") startGame();
  });

  window.addEventListener("keyup", e => {
    if (e.key.toLowerCase() === "a" || e.key === "ArrowLeft") {
      keys.left = false;
    }

    if (e.key.toLowerCase() === "d" || e.key === "ArrowRight") {
      keys.right = false;
    }
  });

  window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;
  });

  resize();
  updateUI();
  draw();
})();