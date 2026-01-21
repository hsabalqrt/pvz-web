// إعدادات عامة
const ROWS = 5;
const COLS = 9;
const CELL = 90; // حجم الخلية بالبكسل
const CANVAS_W = COLS * CELL; // 810
const CANVAS_H = ROWS * CELL; // 450

// تكاليف النباتات وتبريدها
const PLANT_DEFS = {
  sunflower: { cost: 50, cooldown: 7 },
  peashooter: { cost: 100, cooldown: 5 },
  wallnut: { cost: 50, cooldown: 8 },
};

// خصائص النباتات الأساسية
class Plant {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.hp = 100;
    this.type = "plant";
    this.alive = true;
    this.time = 0;
  }
  get x() { return this.col * CELL + 10; }
  get y() { return this.row * CELL + 10; }
  get w() { return CELL - 20; }
  get h() { return CELL - 20; }
  update(dt, state) {}
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#c9f0ff";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.restore();
  }
  damage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) this.alive = false;
  }
}

class Sunflower extends Plant {
  constructor(row, col) {
    super(row, col);
    this.type = "sunflower";
    this.hp = 70;
    this.generateInterval = 6; // كل 6 ثواني
    this.time = 0;
  }
  update(dt, state) {
    this.time += dt;
    if (this.time >= this.generateInterval) {
      this.time = 0;
      state.sun += 25; // توليد الشمس
      flashText(state, "+25");
    }
  }
  draw(ctx) {
    // دائرة صفراء مع بتلات
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    // بتلات
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const px = cx + Math.cos(angle) * 24;
      const py = cy + Math.sin(angle) * 24;
      ctx.fillStyle = "#ffdd55";
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // قلب
    ctx.fillStyle = "#8b4513";
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Peashooter extends Plant {
  constructor(row, col) {
    super(row, col);
    this.type = "peashooter";
    this.hp = 100;
    this.shootInterval = 1.2;
    this.time = 0;
  }
  update(dt, state) {
    this.time += dt;
    // يطلق إذا وجد زومبي في نفس الصف أمامه
    const zombieAhead = state.zombies.some(z => z.row === this.row && z.x > this.x);
    if (zombieAhead && this.time >= this.shootInterval) {
      this.time = 0;
      state.projectiles.push(new Projectile(this.row, this.x + this.w - 10, this.y + this.h / 2));
    }
  }
  draw(ctx) {
    // نبات أخضر مع فوهة
    ctx.save();
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(this.x + 10, this.y + 20, this.w - 40, this.h - 40);
    // رأس
    ctx.beginPath();
    ctx.arc(this.x + this.w - 25, this.y + this.h / 2, 16, 0, Math.PI * 2);
    ctx.fill();
    // فوهة
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(this.x + this.w - 20, this.y + this.h / 2 - 6, 18, 12);
    ctx.restore();
  }
}

class Wallnut extends Plant {
  constructor(row, col) {
    super(row, col);
    this.type = "wallnut";
    this.hp = 300;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#b87333";
    ctx.fillRect(this.x + 6, this.y + 6, this.w - 12, this.h - 12);
    // وجه بسيط
    ctx.fillStyle = "#4d2c14";
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2 - 10, this.y + 30, 6, 0, Math.PI * 2);
    ctx.arc(this.x + this.w / 2 + 10, this.y + 30, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(this.x + this.w / 2 - 12, this.y + 50, 24, 6);
    ctx.restore();
  }
}

// المقذوفات
class Projectile {
  constructor(row, x, y) {
    this.row = row;
    this.x = x;
    this.y = y;
    this.r = 6;
    this.speed = 220; // px/s
    this.damage = 25;
    this.alive = true;
  }
  update(dt) {
    this.x += this.speed * dt;
    if (this.x > CANVAS_W + 40) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#2ecc71";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// الزومبي
class Zombie {
  constructor(row) {
    this.row = row;
    this.w = CELL - 20;
    this.h = CELL - 20;
    this.x = CANVAS_W - this.w; // يبدأ من يمين الشبكة
    this.y = row * CELL + 10;
    this.speed = 24 + Math.random() * 12; // بطيء
    this.hp = 150;
    this.damage = 16; // ضرر/ثانية للنبات
    this.alive = true;
    this.eating = false;
    this.targetPlant = null;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt, state) {
    if (!this.alive) return;
    // إذا يأكل نباتاً
    if (this.eating && this.targetPlant && this.targetPlant.alive) {
      this.targetPlant.damage(this.damage * dt);
      if (!this.targetPlant.alive) {
        this.eating = false;
        this.targetPlant = null;
      }
      return;
    }
    // تحرك يساراً
    this.x -= this.speed * dt;

    // تحقق إن وصل للبيت (خسارة)
    if (this.x <= 0) {
      state.lose("الزومبي وصل إلى البيت!");
    }

    // إن وجد نباتاً أمامه في نفس الخلية، يبدأ الأكل
    const col = Math.floor((this.x + this.w / 2) / CELL);
    const plant = state.grid.get(this.row, col);
    if (plant && plant.alive) {
      this.eating = true;
      this.targetPlant = plant;
    }
  }
  damage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#95a5a6";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // وجه
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(this.x + 12, this.y + 12, 18, 8);
    ctx.fillRect(this.x + 40, this.y + 12, 18, 8);
    ctx.fillRect(this.x + 18, this.y + 36, 36, 8);
    // ذراع
    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(this.x + this.w - 12, this.y + this.h - 20, 10, 20);
    ctx.restore();
  }
}

// شبكة العشب
class Grid {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => null)
    );
  }
  inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }
  get(row, col) {
    if (!this.inBounds(row, col)) return null;
    return this.cells[row][col];
  }
  set(row, col, plant) {
    if (!this.inBounds(row, col)) return false;
    this.cells[row][col] = plant;
    return true;
  }
  remove(row, col) {
    if (!this.inBounds(row, col)) return null;
    const p = this.cells[row][col];
    this.cells[row][col] = null;
    return p;
  }
}

// حالة اللعبة
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const sunEl = document.getElementById("sunCount");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const restartBtn = document.getElementById("restartBtn");

const state = {
  grid: new Grid(ROWS, COLS),
  plants: [],
  zombies: [],
  projectiles: [],
  sun: 100,
  running: true,
  selectedPlant: null, // "sunflower", "peashooter", "wallnut" | "shovel"
  cooldowns: {
    sunflower: 0,
    peashooter: 0,
    wallnut: 0,
  },
  time: 0,
  waveIndex: 0,
  nextSpawnAt: 3,
  lose: (msg) => {
    state.running = false;
    overlayText.textContent = "خسرت: " + msg;
    overlay.classList.remove("hidden");
  },
  win: () => {
    state.running = false;
    overlayText.textContent = "فزت! لقد صدّيت كل الموجات";
    overlay.classList.remove("hidden");
  }
};

// موجات بسيطة
const WAVES = [
  { count: 4, interval: 5 },
  { count: 6, interval: 4.5 },
  { count: 8, interval: 4 },
  { count: 10, interval: 3.6 },
];

// واجهة البطاقات
const cardsEl = document.getElementById("cards");
cardsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".card");
  if (!btn) return;
  const type = btn.dataset.type;
  if (!type) {
    state.selectedPlant = "shovel";
    document.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
    btn.classList.add("selected");
    return;
  }
  // تحقق من التبريد
  if (state.cooldowns[type] > 0) return;
  // حدد البطاقة
  state.selectedPlant = type;
  document.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected");
});

// تجديد واجهة الشمس والتبريد
function updateUI(dt) {
  sunEl.textContent = Math.floor(state.sun);
  // تبريد البطاقات
  for (const key of Object.keys(state.cooldowns)) {
    if (state.cooldowns[key] > 0) {
      state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
    }
  }
  // تعطيل/تمكين حسب التبريد والموارد
  document.querySelectorAll(".card").forEach((c) => {
    const type = c.dataset.type;
    if (!type) {
      c.classList.remove("disabled");
      return;
    }
    const def = PLANT_DEFS[type];
    const onCooldown = state.cooldowns[type] > 0;
    const insufficient = state.sun < def.cost;
    c.classList.toggle("disabled", onCooldown || insufficient);
  });
}

// وضع/إزالة النباتات بالنقر على الشبكة
canvas.addEventListener("click", (e) => {
  if (!state.running) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const row = Math.floor(my / CELL);
  const col = Math.floor(mx / CELL);
  if (!state.grid.inBounds(row, col)) return;

  if (state.selectedPlant === "shovel") {
    const removed = state.grid.remove(row, col);
    if (removed) {
      const idx = state.plants.indexOf(removed);
      if (idx >= 0) state.plants.splice(idx, 1);
    }
    return;
  }

  const type = state.selectedPlant;
  if (!type) return;
  const def = PLANT_DEFS[type];
  if (state.sun < def.cost) return;
  if (state.grid.get(row, col)) return; // الخلية مشغولة

  // ازرع
  let plant = null;
  switch (type) {
    case "sunflower": plant = new Sunflower(row, col); break;
    case "peashooter": plant = new Peashooter(row, col); break;
    case "wallnut": plant = new Wallnut(row, col); break;
  }
  if (plant) {
    state.plants.push(plant);
    state.grid.set(row, col, plant);
    state.sun -= def.cost;
    state.cooldowns[type] = def.cooldown;
  }
});

// نص عائم بسيط لمكافأة الشمس
let floatTexts = [];
function flashText(state, text) {
  floatTexts.push({ text, x: 16, y: 40, t: 0 });
}

// توليد الشمس السلبي البسيط
let passiveSunTimer = 0;

// التحديث الرئيسي
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // cap dt
  last = now;

  if (state.running) {
    update(dt);
    draw();
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// منطق التحديث
function update(dt) {
  state.time += dt;
  updateUI(dt);

  // شمس سلبية خفيفة
  passiveSunTimer += dt;
  if (passiveSunTimer >= 5) {
    passiveSunTimer = 0;
    state.sun += 25;
    flashText(state, "+25");
  }

  // تحديث النباتات
  for (const p of state.plants) {
    if (!p.alive) continue;
    p.update(dt, state);
  }
  // إزالة النباتات الميتة من الشبكة/القائمة
  for (let i = state.plants.length - 1; i >= 0; i--) {
    const p = state.plants[i];
    if (!p.alive) {
      if (state.grid.get(p.row, p.col) === p) {
        state.grid.remove(p.row, p.col);
      }
      state.plants.splice(i, 1);
    }
  }

  // تحديث المقذوفات والاصطدام
  for (const pr of state.projectiles) pr.update(dt);
  // تصادم مع زومبي في نفس الصف
  for (const pr of state.projectiles) {
    if (!pr.alive) continue;
    for (const z of state.zombies) {
      if (!z.alive || z.row !== pr.row) continue;
      const hit = pr.x >= z.x && pr.x <= z.x + z.w &&
                  pr.y >= z.y && pr.y <= z.y + z.h;
      if (hit) {
        z.damage(pr.damage);
        pr.alive = false;
        break;
      }
    }
  }
  // تنظيف المقذوفات
  state.projectiles = state.projectiles.filter(p => p.alive);

  // تحديث الزومبي
  for (const z of state.zombies) {
    z.update(dt, state);
  }
  // تنظيف الزومبي الميت
  state.zombies = state.zombies.filter(z => z.alive);

  // إدارة الموجات
  manageWaves(dt);

  // فوز إذا لا زومبي ولا موجات متبقية
  const wavesDone = state.waveIndex >= WAVES.length;
  if (wavesDone && state.zombies.length === 0) {
    state.win();
  }

  // تحديث نصوص عائمة
  for (const ft of floatTexts) ft.t += dt;
  floatTexts = floatTexts.filter(ft => ft.t < 1.2);
}

// إدارة الموجات
function manageWaves(dt) {
  if (state.waveIndex >= WAVES.length) return;
  const wave = WAVES[state.waveIndex];
  if (wave.spawned === undefined) wave.spawned = 0;

  state.nextSpawnAt -= dt;
  if (state.nextSpawnAt <= 0) {
    // أنشئ زومبي جديد
    const row = Math.floor(Math.random() * ROWS);
    state.zombies.push(new Zombie(row));

    wave.spawned++;
    if (wave.spawned >= wave.count) {
      state.waveIndex++;
      state.nextSpawnAt = (WAVES[state.waveIndex]?.interval ?? 999);
    } else {
      state.nextSpawnAt = wave.interval;
    }
  }
}

// الرسم
function draw() {
  // خلفية العشب مرسومة عبر CSS للخلفية، نضيف خطوط الشبكة
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // خطوط الشبكة
  ctx.save();
  ctx.strokeStyle = "#2c6e49";
  ctx.lineWidth = 1.5;
  for (let r = 1; r < ROWS; r++) {
    const y = r * CELL;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }
  for (let c = 1; c < COLS; c++) {
    const x = c * CELL;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_H);
    ctx.stroke();
  }
  ctx.restore();

  // منطقة البيت اليسرى للإشارة
  ctx.save();
  ctx.fillStyle = "#ffffff22";
  ctx.fillRect(0, 0, 18, CANVAS_H);
  ctx.restore();

  // رسم النباتات
  for (const p of state.plants) p.draw(ctx);

  // رسم المقذوفات
  for (const pr of state.projectiles) pr.draw(ctx);

  // رسم الزومبي
  for (const z of state.zombies) z.draw(ctx);

  // نصوص عائمة
  for (const ft of floatTexts) {
    ctx.save();
    ctx.globalAlpha = 1 - ft.t / 1.2;
    ctx.fillStyle = "#ffbf00";
    ctx.font = "bold 16px Tahoma";
    ctx.fillText(ft.text, ft.x, ft.y - ft.t * 20);
    ctx.restore();
  }

  // مؤشر البطاقة المحددة
  if (state.selectedPlant && state.selectedPlant !== "shovel") {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffbf00";
    // ظل الماوس على الخلية (اختياري: يتطلب حساب موقع الماوس المستمر)
    ctx.restore();
  }
}

// إعادة التشغيل
restartBtn.addEventListener("click", () => {
  overlay.classList.add("hidden");
  // إعادة تهيئة الحالة
  state.grid = new Grid(ROWS, COLS);
  state.plants = [];
  state.zombies = [];
  state.projectiles = [];
  state.sun = 100;
  state.running = true;
  state.selectedPlant = null;
  state.cooldowns = { sunflower: 0, peashooter: 0, wallnut: 0 };
  state.time = 0;
  state.waveIndex = 0;
  state.nextSpawnAt = WAVES[0].interval;
});

// بدء أول موجة
state.nextSpawnAt = WAVES[0].interval;
