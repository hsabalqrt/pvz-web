// ========== Constants ==========
const GRID_ROWS = 5;
const GRID_COLS = 9;
const CELL_WIDTH = 90;
const CELL_HEIGHT = 90;

// ========== Game State ==========
const gameState = {
    sun: 100,
    selectedCard: null,
    shovelMode: false,
    plants: [], // {row, col, type, health, lastAction, ...}
    zombies: [], // {row, x, health, eating, ...}
    projectiles: [], // {row, x, damage, ...}
    sunDrops: [], // clickable suns falling on the lawn
    mowers: [], // lawn mowers per row
    cardCooldowns: {}, // {plantType: timeLeft}
    currentWave: 1,
    waveInProgress: false,
    gameOver: false,
    gameWon: false,
    lastSunDrop: Date.now(),
    nextRandomSunDrop: Date.now() + 7000,
    zombiesSpawned: 0,
    totalZombiesToSpawn: 0
};

// ========== Plant Definitions ==========
const PLANT_TYPES = {
    sunflower: {
        cost: 50,
        cooldown: 7000,
        health: 100,
        sunProduction: 25,
        sunInterval: 6000,
        color: '#ffeb3b',
        emoji: '🌻'
    },
    peashooter: {
        cost: 100,
        cooldown: 5000,
        health: 100,
        shootInterval: 1500,
        damage: 20,
        color: '#8bc34a',
        emoji: '🌱'
    },
    wallnut: {
        cost: 50,
        cooldown: 8000,
        health: 300,
        color: '#8d6e63',
        emoji: '🥜'
    }
};

// ========== Wave Configuration ==========
const WAVES = [
    { zombies: 5, delay: 5000 },
    { zombies: 8, delay: 4000 },
    { zombies: 12, delay: 3500 },
    { zombies: 15, delay: 3000 }
];

// ========== Canvas Setup ==========
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ========== Grid Class ==========
class Grid {
    constructor() {
        this.cells = Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(null));
    }

    isOccupied(row, col) {
        return this.cells[row][col] !== null;
    }

    placePlant(row, col, plant) {
        this.cells[row][col] = plant;
    }

    removePlant(row, col) {
        this.cells[row][col] = null;
    }

    getPlant(row, col) {
        return this.cells[row][col];
    }
}

const grid = new Grid();

// ========== Plant Base Class ==========
class Plant {
    constructor(row, col, type) {
        this.row = row;
        this.col = col;
        this.type = type;
        this.health = PLANT_TYPES[type].health;
        this.maxHealth = PLANT_TYPES[type].health;
        this.lastAction = Date.now();
    }

    getX() {
        return this.col * CELL_WIDTH + CELL_WIDTH / 2;
    }

    getY() {
        return this.row * CELL_HEIGHT + CELL_HEIGHT / 2;
    }

    draw() {
        const x = this.getX();
        const y = this.getY();
        const config = PLANT_TYPES[this.type];
        
        // Draw plant circle
        ctx.fillStyle = config.color;
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw emoji
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.emoji, x, y);

        // Draw health bar
        const barWidth = 50;
        const barHeight = 6;
        const healthPercent = this.health / this.maxHealth;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(x - barWidth / 2, y + 35, barWidth, barHeight);
        ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : (healthPercent > 0.25 ? '#ff9800' : '#f44336');
        ctx.fillRect(x - barWidth / 2, y + 35, barWidth * healthPercent, barHeight);
    }

    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }
}

// ========== Sunflower Class ==========
class Sunflower extends Plant {
    update() {
        const now = Date.now();
        const config = PLANT_TYPES.sunflower;
        
        if (now - this.lastAction >= config.sunInterval) {
            gameState.sun += config.sunProduction;
            updateSunDisplay();
            this.showSunAnimation();
            this.lastAction = now;
        }
    }

    showSunAnimation() {
        const x = this.getX();
        const y = this.getY();
        
        ctx.save();
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#ffeb3b';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.strokeText('+25', x, y - 40);
        ctx.fillText('+25', x, y - 40);
        ctx.restore();
    }
}

// ========== Peashooter Class ==========
class Peashooter extends Plant {
    update() {
        const now = Date.now();
        const config = PLANT_TYPES.peashooter;
        
        if (now - this.lastAction >= config.shootInterval) {
            // Check if there's a zombie in the same row
            const zombieInRow = gameState.zombies.find(z => z.row === this.row && z.x > this.getX());
            
            if (zombieInRow) {
                this.shoot();
                this.lastAction = now;
            }
        }
    }

    shoot() {
        // Use the Projectile class so update() exists
        gameState.projectiles.push(new Projectile(
            this.row,
            this.getX() + 35,
            PLANT_TYPES.peashooter.damage
        ));
    }
}

// ========== Wallnut Class ==========
class Wallnut extends Plant {
    update() {
        // Wall-nut doesn't have active abilities
    }
}

// ========== Zombie Class ==========
class Zombie {
    constructor(row) {
        this.row = row;
        this.x = canvas.width;
        this.health = 100;
        this.maxHealth = 100;
        this.speed = 0.3;
        this.eating = false;
        this.eatDamage = 10;
        this.eatInterval = 1000;
        this.lastEat = Date.now();
    }

    update() {
        if (!this.eating) {
            this.x -= this.speed;

            // Check if reached lawn mower / house edge
            if (this.x < 20) {
                const mower = gameState.mowers[this.row];
                if (mower && !mower.active) {
                    mower.trigger();
                    // Small nudge so zombie gets hit by mower immediately
                    this.x = 25;
                } else if (!mower || (mower && mower.completed)) {
                    gameOver(false);
                    return;
                }
            }

            // Check collision with plants
            const col = Math.floor(this.x / CELL_WIDTH);
            if (col >= 0 && col < GRID_COLS) {
                const plant = grid.getPlant(this.row, col);
                if (plant && Math.abs(this.x - plant.getX()) < 35) {
                    this.eating = true;
                    this.targetPlant = plant;
                }
            }
        } else {
            // Eat plant
            const now = Date.now();
            if (now - this.lastEat >= this.eatInterval) {
                if (this.targetPlant && this.targetPlant.health > 0) {
                    const dead = this.targetPlant.takeDamage(this.eatDamage);
                    if (dead) {
                        const index = gameState.plants.indexOf(this.targetPlant);
                        if (index > -1) {
                            gameState.plants.splice(index, 1);
                            grid.removePlant(this.targetPlant.row, this.targetPlant.col);
                        }
                        this.eating = false;
                        this.targetPlant = null;
                    }
                    this.lastEat = now;
                } else {
                    this.eating = false;
                    this.targetPlant = null;
                }
            }
        }
    }

    draw() {
        const y = this.row * CELL_HEIGHT + CELL_HEIGHT / 2;
        
        // Draw zombie body
        ctx.fillStyle = '#9e9e9e';
        ctx.beginPath();
        ctx.arc(this.x, y, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw zombie emoji
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧟', this.x, y);

        // Draw health bar
        const barWidth = 40;
        const barHeight = 5;
        const healthPercent = this.health / this.maxHealth;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - barWidth / 2, y - 35, barWidth, barHeight);
        ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : (healthPercent > 0.25 ? '#ff9800' : '#f44336');
        ctx.fillRect(this.x - barWidth / 2, y - 35, barWidth * healthPercent, barHeight);
    }

    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }
}

// ========== Projectile Class ==========
class Projectile {
    constructor(row, x, damage) {
        this.row = row;
        this.x = x;
        this.damage = damage;
        this.speed = 3;
    }

    update() {
        this.x += this.speed;

        // Check collision with zombies
        for (let i = gameState.zombies.length - 1; i >= 0; i--) {
            const zombie = gameState.zombies[i];
            if (zombie.row === this.row && Math.abs(this.x - zombie.x) < 30) {
                const dead = zombie.takeDamage(this.damage);
                if (dead) {
                    gameState.zombies.splice(i, 1);
                }
                return true; // Projectile hit
            }
        }

        return this.x > canvas.width; // Projectile off screen
    }

    draw() {
        const y = this.row * CELL_HEIGHT + CELL_HEIGHT / 2;
        
        ctx.fillStyle = '#8bc34a';
        ctx.beginPath();
        ctx.arc(this.x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#558b2f';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// ========== Sun Drop Class ==========
class SunDrop {
    constructor(x) {
        this.x = x;
        this.y = 0;
        this.radius = 14;
        this.value = 25;
        this.fallSpeed = 0.4;
        this.targetY = 80 + Math.random() * (canvas.height - 120);
        this.spawnTime = Date.now();
        this.lifeTime = 8000; // disappears after 8s if not collected
        this.collected = false;
    }

    update() {
        if (this.collected) return true;

        // fall until targetY
        if (this.y < this.targetY) {
            this.y += this.fallSpeed * (1 + Math.sin(Date.now() / 300) * 0.2);
        }

        // timeout removal
        if (Date.now() - this.spawnTime > this.lifeTime) {
            return true;
        }
        return false;
    }

    draw() {
        ctx.save();
        // glow
        const grd = ctx.createRadialGradient(this.x, this.y, 4, this.x, this.y, 18);
        grd.addColorStop(0, '#fff59d');
        grd.addColorStop(1, 'rgba(255, 235, 59, 0.2)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 18, 0, Math.PI * 2);
        ctx.fill();

        // core
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // icon
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#795548';
        ctx.fillText('☀', this.x, this.y);
        ctx.restore();
    }

    containsPoint(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.radius + 4;
    }
}

// ========== Lawn Mower Class ==========
class LawnMower {
    constructor(row) {
        this.row = row;
        this.x = 18;
        this.y = row * CELL_HEIGHT + CELL_HEIGHT / 2;
        this.active = false;
        this.completed = false;
        this.speed = 6;
    }

    trigger() {
        if (!this.active && !this.completed) {
            this.active = true;
        }
    }

    update() {
        if (!this.active || this.completed) return;
        this.x += this.speed;

        // mow zombies in the row
        for (let i = gameState.zombies.length - 1; i >= 0; i--) {
            const z = gameState.zombies[i];
            if (z.row === this.row && Math.abs(z.x - this.x) < 30) {
                gameState.zombies.splice(i, 1);
            }
        }

        if (this.x > canvas.width + 40) {
            this.completed = true;
            this.active = false;
        }
    }

    draw() {
        ctx.save();
        // body
        ctx.fillStyle = this.active ? '#c62828' : '#546e7a';
        ctx.fillRect(this.x - 18, this.y - 12, 36, 24);
        // wheels
        ctx.fillStyle = '#263238';
        ctx.beginPath();
        ctx.arc(this.x - 12, this.y + 12, 6, 0, Math.PI * 2);
        ctx.arc(this.x + 12, this.y + 12, 6, 0, Math.PI * 2);
        ctx.fill();
        // handle
        ctx.strokeStyle = '#37474f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x + 18, this.y - 12);
        ctx.lineTo(this.x + 28, this.y - 26);
        ctx.stroke();
        ctx.restore();
    }
}

// ========== Wave Manager ==========
class WaveManager {
    constructor() {
        this.waveStartTime = null;
        this.nextSpawnTime = null;
    }

    startWave(waveNumber) {
        if (waveNumber > WAVES.length) {
            // All waves completed
            checkWinCondition();
            return;
        }

        gameState.currentWave = waveNumber;
        gameState.waveInProgress = true;
        gameState.zombiesSpawned = 0;
        gameState.totalZombiesToSpawn = WAVES[waveNumber - 1].zombies;
        
        this.waveStartTime = Date.now();
        this.nextSpawnTime = this.waveStartTime;
        
        updateWaveDisplay();
    }

    update() {
        if (!gameState.waveInProgress) return;

        const now = Date.now();
        const waveConfig = WAVES[gameState.currentWave - 1];

        if (gameState.zombiesSpawned < gameState.totalZombiesToSpawn) {
            if (now >= this.nextSpawnTime) {
                const randomRow = Math.floor(Math.random() * GRID_ROWS);
                gameState.zombies.push(new Zombie(randomRow));
                gameState.zombiesSpawned++;
                this.nextSpawnTime = now + waveConfig.delay;
            }
        } else {
            // All zombies spawned for this wave
            if (gameState.zombies.length === 0) {
                // Wave completed
                gameState.waveInProgress = false;
                
                setTimeout(() => {
                    if (gameState.currentWave < WAVES.length) {
                        this.startWave(gameState.currentWave + 1);
                    } else {
                        checkWinCondition();
                    }
                }, 2000);
            }
        }
    }
}

const waveManager = new WaveManager();

// ========== UI Functions ==========
function updateSunDisplay() {
    document.getElementById('sun-value').textContent = gameState.sun;
}

function updateWaveDisplay() {
    document.getElementById('wave-value').textContent = gameState.currentWave;
}

function updateCardStates() {
    const cards = document.querySelectorAll('.plant-card:not(.shovel)');
    
    cards.forEach(card => {
        const plantType = card.dataset.plant;
        const cost = parseInt(card.dataset.cost);
        const cooldownTime = gameState.cardCooldowns[plantType] || 0;
        
        if (gameState.sun < cost || cooldownTime > 0) {
            card.classList.add('disabled');
        } else {
            card.classList.remove('disabled');
        }

        // Update cooldown display
        const cooldownDiv = card.querySelector('.card-cooldown');
        if (cooldownTime > 0) {
            const seconds = Math.ceil(cooldownTime / 1000);
            cooldownDiv.textContent = seconds;
            cooldownDiv.classList.add('active');
        } else {
            cooldownDiv.classList.remove('active');
        }
    });
}

// ========== Event Handlers ==========
document.querySelectorAll('.plant-card:not(.shovel)').forEach(card => {
    card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) return;

        const plantType = card.dataset.plant;
        
        // Deselect all cards
        document.querySelectorAll('.plant-card').forEach(c => c.classList.remove('selected'));
        
        if (gameState.selectedCard === plantType) {
            gameState.selectedCard = null;
            gameState.shovelMode = false;
        } else {
            gameState.selectedCard = plantType;
            gameState.shovelMode = false;
            card.classList.add('selected');
        }
    });
});

document.getElementById('shovel-card').addEventListener('click', () => {
    document.querySelectorAll('.plant-card').forEach(c => c.classList.remove('selected'));
    
    gameState.shovelMode = !gameState.shovelMode;
    gameState.selectedCard = null;
    
    if (gameState.shovelMode) {
        document.getElementById('shovel-card').classList.add('selected');
    }
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const col = Math.floor(x / CELL_WIDTH);
    const row = Math.floor(y / CELL_HEIGHT);
    
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return;

    // First, check clickable suns
    for (let i = gameState.sunDrops.length - 1; i >= 0; i--) {
        const s = gameState.sunDrops[i];
        if (s.containsPoint(x, y)) {
            s.collected = true;
            gameState.sun += s.value;
            gameState.sunDrops.splice(i, 1);
            updateSunDisplay();
            return;
        }
    }

    if (gameState.shovelMode) {
        // Remove plant
        const plant = grid.getPlant(row, col);
        if (plant) {
            const index = gameState.plants.indexOf(plant);
            if (index > -1) {
                gameState.plants.splice(index, 1);
            }
            grid.removePlant(row, col);
        }
        gameState.shovelMode = false;
        document.getElementById('shovel-card').classList.remove('selected');
    } else if (gameState.selectedCard) {
        // Plant a plant
        if (grid.isOccupied(row, col)) return;
        
        const plantType = gameState.selectedCard;
        const cost = PLANT_TYPES[plantType].cost;
        
        if (gameState.sun >= cost) {
            // Create plant
            let plant;
            switch (plantType) {
                case 'sunflower':
                    plant = new Sunflower(row, col, plantType);
                    break;
                case 'peashooter':
                    plant = new Peashooter(row, col, plantType);
                    break;
                case 'wallnut':
                    plant = new Wallnut(row, col, plantType);
                    break;
            }
            
            gameState.plants.push(plant);
            grid.placePlant(row, col, plant);
            gameState.sun -= cost;
            updateSunDisplay();
            
            // Start cooldown
            gameState.cardCooldowns[plantType] = PLANT_TYPES[plantType].cooldown;
            
            // Deselect card
            gameState.selectedCard = null;
            document.querySelectorAll('.plant-card').forEach(c => c.classList.remove('selected'));
        }
    }
});

document.getElementById('restart-button').addEventListener('click', () => {
    location.reload();
});

// ========== Game Over Functions ==========
function gameOver(won) {
    if (gameState.gameOver) return;
    
    gameState.gameOver = true;
    gameState.gameWon = won;
    
    const layer = document.getElementById('game-over-layer');
    const title = document.getElementById('game-over-title');
    const message = document.getElementById('game-over-message');
    
    if (won) {
        title.textContent = '🎉 فوز!';
        title.style.color = '#4caf50';
        message.textContent = 'لقد نجحت في الدفاع عن منزلك!';
    } else {
        title.textContent = '💀 خسارة!';
        title.style.color = '#f44336';
        message.textContent = 'وصل الزومبي إلى منزلك!';
    }
    
    layer.classList.remove('hidden');
}

function checkWinCondition() {
    if (gameState.currentWave > WAVES.length && gameState.zombies.length === 0) {
        gameOver(true);
    }
}

// ========== Drawing Functions ==========
function drawGrid() {
    // Draw cells
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const x = col * CELL_WIDTH;
            const y = row * CELL_HEIGHT;
            
            // Alternating pattern
            const isLight = (row + col) % 2 === 0;
            ctx.fillStyle = isLight ? '#7cb342' : '#689f38';
            ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
            
            // Border
            ctx.strokeStyle = '#558b2f';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, CELL_WIDTH, CELL_HEIGHT);
        }
    }
}

// ========== Game Loop ==========
function update() {
    if (gameState.gameOver) return;

    // Update cooldowns
    for (const plantType in gameState.cardCooldowns) {
        if (gameState.cardCooldowns[plantType] > 0) {
            gameState.cardCooldowns[plantType] -= 16; // ~60 FPS
            if (gameState.cardCooldowns[plantType] <= 0) {
                gameState.cardCooldowns[plantType] = 0;
            }
        }
    }

    // Passive sun generation
    const now = Date.now();
    if (now - gameState.lastSunDrop >= 10000) {
        gameState.sun += 25;
        updateSunDisplay();
        gameState.lastSunDrop = now;
    }

    // Random falling sun drops
    if (now >= gameState.nextRandomSunDrop) {
        const x = 60 + Math.random() * (canvas.width - 120);
        gameState.sunDrops.push(new SunDrop(x));
        gameState.nextRandomSunDrop = now + (7000 + Math.random() * 5000);
    }

    // Update plants
    gameState.plants.forEach(plant => {
        if (plant.update) {
            plant.update();
        }
    });

    // Update zombies
    gameState.zombies.forEach(zombie => {
        zombie.update();
    });

    // Update projectiles
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const projectile = gameState.projectiles[i];
        const shouldRemove = projectile.update();
        if (shouldRemove) {
            gameState.projectiles.splice(i, 1);
        }
    }

    // Update sun drops
    for (let i = gameState.sunDrops.length - 1; i >= 0; i--) {
        const remove = gameState.sunDrops[i].update();
        if (remove) gameState.sunDrops.splice(i, 1);
    }

    // Update lawn mowers
    gameState.mowers.forEach(m => m.update());

    // Update wave manager
    waveManager.update();

    // Update UI
    updateCardStates();
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid();

    // Draw plants
    gameState.plants.forEach(plant => {
        plant.draw();
    });

    // Draw projectiles
    gameState.projectiles.forEach(projectile => {
        projectile.draw();
    });

    // Draw zombies
    gameState.zombies.forEach(zombie => {
        zombie.draw();
    });

    // Draw sun drops
    gameState.sunDrops.forEach(s => s.draw());

    // Draw lawn mowers
    gameState.mowers.forEach(m => m.draw());
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ========== Initialize Game ==========
function init() {
    updateSunDisplay();
    updateWaveDisplay();
    updateCardStates();
    
    // Create lawn mowers per row
    gameState.mowers = Array(GRID_ROWS).fill(null).map((_, r) => new LawnMower(r));

    // Start first wave after 3 seconds
    setTimeout(() => {
        waveManager.startWave(1);
    }, 3000);
    
    gameLoop();
}

// Start game when page loads
window.addEventListener('load', init);
