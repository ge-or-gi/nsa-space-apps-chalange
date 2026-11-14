const GAME_STATE = {
  PLAYING: "playing",
  GAME_OVER: "game_over",
  VICTORY: "victory",
};

const CONFIG = {
  worldWidth: 2200,
  worldHeight: 1500,
  playerRadius: 16,
  playerSpeed: 210,
  playerMaxHealth: 100,
  bulletSpeed: 520,
  bulletLife: 0.9,
  interactionRange: 52,
  totalDiscoveries: 6,
  totalParts: 3,
  maxEnemiesPerWave: 18,
};

const RENDER_THEME = {
  terrain: {
    skyTop: "#1a3f87",
    skyBottom: "#2f225e",
    glow: "rgba(126, 240, 255, 0.16)",
    grid: "rgba(154, 216, 255, 0.11)",
    dust: "rgba(255, 236, 184, 0.38)",
  },
  player: {
    shell: "#9fe8ff",
    core: "#58b7ef",
    barrel: "#2d7db6",
    ring: "rgba(126, 240, 255, 0.32)",
    healthBg: "rgba(0, 9, 20, 0.65)",
    healthFill: "#73f3a7",
  },
  enemy: {
    shell: "#4a2a4f",
    core: "#ff8f95",
    glow: "rgba(255, 143, 149, 0.25)",
  },
  bullets: {
    core: "#ffe58f",
    glow: "rgba(255, 229, 143, 0.45)",
  },
};

const DEFAULT_RENDER_MANIFEST = {
  terrain: {
    sky: "assets/backgrounds/sky/sky_gradient_day.png",
    far: "assets/backgrounds/parallax/parallax_far_mountains.png",
    mid: "assets/backgrounds/parallax/parallax_mid_dust.png",
    near: "assets/backgrounds/parallax/parallax_near_rocks.png",
  },
  sprites: {
    player: "assets/sprites/player/astronaut_idle.png",
    enemy: "assets/sprites/enemies/drone_idle.png",
    bullet: "assets/sprites/projectiles/bullet_small.png",
  },
  pickups: {
    discovery: "assets/sprites/pickups/beacon_rover.png",
    rocketPart: "assets/sprites/pickups/rocket_part_hull.png",
  },
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hud = {
  health: document.getElementById("health"),
  wave: document.getElementById("wave"),
  discoveries: document.getElementById("discoveries"),
  parts: document.getElementById("parts"),
  objective: document.getElementById("objective"),
};

const intelUi = {
  root: document.getElementById("intelModal"),
  close: document.getElementById("intelClose"),
  title: document.getElementById("intelTitle"),
  image: document.getElementById("intelImage"),
  imageFallback: document.getElementById("intelImageFallback"),
  summary: document.getElementById("intelSummary"),
  launchDate: document.getElementById("intelLaunchDate"),
  landingDate: document.getElementById("intelLandingDate"),
  status: document.getElementById("intelStatus"),
  duration: document.getElementById("intelDuration"),
  operator: document.getElementById("intelOperator"),
  objective: document.getElementById("intelObjective"),
  achievements: document.getElementById("intelAchievements"),
  quizPrompt: document.getElementById("intelQuizPrompt"),
  quizOptions: document.getElementById("intelQuizOptions"),
  quizFeedback: document.getElementById("intelQuizFeedback"),
  source: document.getElementById("intelSource"),
  imageSource: document.getElementById("intelImageSource"),
};

function setIntelModalOpen(isOpen) {
  intelOpen = isOpen;
  if (!intelUi.root) return;
  intelUi.root.hidden = !isOpen;
}

let state = GAME_STATE.PLAYING;
let mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };
let keys = {};
let interactPressed = false;

let player;
let camera;
let bullets;
let enemies;
let discoveries;
let parts;
let dust;
let wave;
let waveBreakTimer;
let rocketZone;
let launchTimer;
let roverIntelByName = {};
let seenIntelEntries = new Set();
let intelOpen = false;
let activeDiscoveryNode = null;
let autoCloseIntelTimer = null;
let renderManifest = { ...DEFAULT_RENDER_MANIFEST };
let renderAssets = createRenderAssets(renderManifest);

function createSpriteAsset(src) {
  const image = new Image();
  const asset = {
    src: typeof src === "string" ? src : "",
    image,
    loaded: false,
    failed: false,
  };

  if (!asset.src) {
    asset.failed = true;
    return asset;
  }

  image.onload = () => {
    asset.loaded = true;
  };

  image.onerror = () => {
    asset.failed = true;
  };

  image.src = asset.src;
  return asset;
}

function createRenderAssets(manifest) {
  return {
    terrainSky: createSpriteAsset(manifest?.terrain?.sky),
    terrainFar: createSpriteAsset(manifest?.terrain?.far),
    terrainMid: createSpriteAsset(manifest?.terrain?.mid),
    terrainNear: createSpriteAsset(manifest?.terrain?.near),
    player: createSpriteAsset(manifest?.sprites?.player),
    enemy: createSpriteAsset(manifest?.sprites?.enemy),
    bullet: createSpriteAsset(manifest?.sprites?.bullet),
    discovery: createSpriteAsset(manifest?.pickups?.discovery),
    rocketPart: createSpriteAsset(manifest?.pickups?.rocketPart),
  };
}

function coerceManifestPath(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function loadAssetManifest() {
  try {
    const response = await fetch("assets/asset-manifest.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load asset manifest: ${response.status}`);
    }

    const manifest = await response.json();
    const render = manifest && typeof manifest === "object" ? manifest.render : null;

    renderManifest = {
      terrain: {
        sky: coerceManifestPath(render?.terrain?.sky, DEFAULT_RENDER_MANIFEST.terrain.sky),
        far: coerceManifestPath(render?.terrain?.far, DEFAULT_RENDER_MANIFEST.terrain.far),
        mid: coerceManifestPath(render?.terrain?.mid, DEFAULT_RENDER_MANIFEST.terrain.mid),
        near: coerceManifestPath(render?.terrain?.near, DEFAULT_RENDER_MANIFEST.terrain.near),
      },
      sprites: {
        player: coerceManifestPath(render?.sprites?.player, DEFAULT_RENDER_MANIFEST.sprites.player),
        enemy: coerceManifestPath(render?.sprites?.enemy, DEFAULT_RENDER_MANIFEST.sprites.enemy),
        bullet: coerceManifestPath(render?.sprites?.bullet, DEFAULT_RENDER_MANIFEST.sprites.bullet),
      },
      pickups: {
        discovery: coerceManifestPath(render?.pickups?.discovery, DEFAULT_RENDER_MANIFEST.pickups.discovery),
        rocketPart: coerceManifestPath(render?.pickups?.rocketPart, DEFAULT_RENDER_MANIFEST.pickups.rocketPart),
      },
    };
  } catch (error) {
    renderManifest = { ...DEFAULT_RENDER_MANIFEST };
    console.warn("Asset manifest unavailable; rendering fallbacks will be used.", error);
  }

  renderAssets = createRenderAssets(renderManifest);
}

function resetGame() {
  state = GAME_STATE.PLAYING;
  player = {
    x: CONFIG.worldWidth * 0.5,
    y: CONFIG.worldHeight * 0.5,
    radius: CONFIG.playerRadius,
    speed: CONFIG.playerSpeed,
    health: CONFIG.playerMaxHealth,
    angle: 0,
    fireCooldown: 0,
    damageCooldown: 0,
  };

  camera = { x: 0, y: 0 };
  bullets = [];
  enemies = [];
  discoveries = spawnDiscoveryNodes();
  parts = spawnRocketParts();
  dust = spawnDust(110);

  wave = 1;
  waveBreakTimer = 0;
  launchTimer = -1;
  seenIntelEntries = new Set();
  closeIntelModal();
  rocketZone = {
    x: CONFIG.worldWidth - 220,
    y: CONFIG.worldHeight - 180,
    radius: 58,
    assembled: false,
  };

  spawnWave(wave);
  updateHud();
}

function spawnDust(amount) {
  const items = [];
  for (let i = 0; i < amount; i += 1) {
    items.push({
      x: Math.random() * CONFIG.worldWidth,
      y: Math.random() * CONFIG.worldHeight,
      r: 1 + Math.random() * 2,
      drift: 8 + Math.random() * 16,
    });
  }
  return items;
}

function spawnDiscoveryNodes() {
  const names = ["Sojourner", "Spirit", "Opportunity", "Curiosity", "Perseverance", "Ingenuity"];
  return names.slice(0, CONFIG.totalDiscoveries).map((name) => ({
    ...randomMapPoint(),
    radius: 20,
    name,
    found: false,
  }));
}

function spawnRocketParts() {
  const names = ["Thruster", "Fuel Cell", "Guidance Chip"];
  return names.slice(0, CONFIG.totalParts).map((name) => ({
    ...randomMapPoint(),
    radius: 15,
    name,
    collected: false,
  }));
}

function randomMapPoint() {
  return {
    x: 150 + Math.random() * (CONFIG.worldWidth - 300),
    y: 150 + Math.random() * (CONFIG.worldHeight - 300),
  };
}

function spawnWave(waveNumber) {
  const count = Math.min(3 + waveNumber * 2, CONFIG.maxEnemiesPerWave);
  for (let i = 0; i < count; i += 1) {
    const p = spawnAwayFromPlayer(280 + Math.random() * 220);
    enemies.push({
      x: p.x,
      y: p.y,
      radius: 14,
      speed: Math.min(52 + waveNumber * 7, 120),
      health: Math.min(22 + waveNumber * 7, 85),
      damage: Math.min(7 + waveNumber * 1.6, 20),
      pulse: Math.random() * Math.PI * 2,
    });
  }
}

function spawnAwayFromPlayer(minDistance) {
  let x;
  let y;
  do {
    x = Math.random() * CONFIG.worldWidth;
    y = Math.random() * CONFIG.worldHeight;
  } while (distance(x, y, player.x, player.y) < minDistance);
  return { x, y };
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function updateHud() {
  const discoveriesFound = discoveries.filter((d) => d.found).length;
  const partsCollected = parts.filter((p) => p.collected).length;

  hud.health.textContent = `Health: ${Math.max(0, Math.round(player.health))}`;
  hud.wave.textContent = `Wave: ${wave}`;
  hud.discoveries.textContent = `Rovers Found: ${discoveriesFound}/${discoveries.length}`;
  hud.parts.textContent = `Rocket Parts: ${partsCollected}/${parts.length}`;

  if (state === GAME_STATE.GAME_OVER) {
    hud.objective.textContent = "Objective: Mission failed. Press R to restart.";
    return;
  }

  if (state === GAME_STATE.VICTORY) {
    hud.objective.textContent = "Objective: Rocket launched. You are returning home! Press R to play again.";
    return;
  }

  if (!allDiscoveriesFound()) {
    hud.objective.textContent = "Objective: Find all NASA rovers/robots (press E near a beacon).";
    return;
  }

  if (!allPartsCollected()) {
    hud.objective.textContent = "Objective: Collect all rocket parts (press E near a part).";
    return;
  }

  if (!rocketZone.assembled) {
    hud.objective.textContent = "Objective: Reach the launch zone and press E to assemble your rocket.";
    return;
  }

  hud.objective.textContent = "Objective: Launch sequence active. Hold out until liftoff!";
}

function allDiscoveriesFound() {
  return discoveries.every((d) => d.found);
}

function allPartsCollected() {
  return parts.every((p) => p.collected);
}

function update(dt) {
  if (state !== GAME_STATE.PLAYING || intelOpen) {
    updateCamera();
    updateHud();
    return;
  }

  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateDust(dt);
  updateWaveFlow(dt);

  if (interactPressed) {
    handleInteraction();
    interactPressed = false;
  }

  if (launchTimer > 0) {
    launchTimer -= dt;
    if (launchTimer <= 0) {
      state = GAME_STATE.VICTORY;
    }
  }

  if (player.health <= 0) {
    state = GAME_STATE.GAME_OVER;
  }

  updateCamera();
  updateHud();
}

function updatePlayer(dt) {
  let moveX = 0;
  let moveY = 0;

  if (keys.i) moveY -= 1;
  if (keys.k) moveY += 1;
  if (keys.j) moveX -= 1;
  if (keys.l) moveX += 1;

  const mag = Math.hypot(moveX, moveY);
  if (mag > 0) {
    moveX /= mag;
    moveY /= mag;
  }

  player.x += moveX * player.speed * dt;
  player.y += moveY * player.speed * dt;

  player.x = Math.max(player.radius, Math.min(CONFIG.worldWidth - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(CONFIG.worldHeight - player.radius, player.y));

  const worldMouse = screenToWorld(mouse.x, mouse.y);
  player.angle = Math.atan2(worldMouse.y - player.y, worldMouse.x - player.x);

  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (player.damageCooldown > 0) player.damageCooldown -= dt;

  if (mouse.down && player.fireCooldown <= 0) {
    shoot();
    player.fireCooldown = 0.18;
  }
}

function shoot() {
  bullets.push({
    x: player.x,
    y: player.y,
    vx: Math.cos(player.angle) * CONFIG.bulletSpeed,
    vy: Math.sin(player.angle) * CONFIG.bulletSpeed,
    life: CONFIG.bulletLife,
    radius: 4,
  });
}

function updateBullets(dt) {
  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  }

  bullets = bullets.filter((b) => {
    const inBounds = b.x >= 0 && b.y >= 0 && b.x <= CONFIG.worldWidth && b.y <= CONFIG.worldHeight;
    return b.life > 0 && inBounds;
  });
}

function updateEnemies(dt) {
  for (const enemy of enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / d) * enemy.speed * dt;
    enemy.y += (dy / d) * enemy.speed * dt;
    enemy.pulse += dt * 5;

    const contact = d < player.radius + enemy.radius;
    if (contact && player.damageCooldown <= 0) {
      player.health -= enemy.damage;
      player.damageCooldown = 0.55;
    }
  }

  for (const bullet of bullets) {
    for (const enemy of enemies) {
      if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < bullet.radius + enemy.radius) {
        enemy.health -= 26;
        bullet.life = -1;
        break;
      }
    }
  }

  enemies = enemies.filter((e) => e.health > 0);
}

function updateDust(dt) {
  for (const d of dust) {
    d.x -= d.drift * dt;
    if (d.x < 0) {
      d.x = CONFIG.worldWidth;
      d.y = Math.random() * CONFIG.worldHeight;
    }
  }
}

function updateWaveFlow(dt) {
  if (enemies.length > 0) {
    waveBreakTimer = 0;
    return;
  }

  if (waveBreakTimer <= 0) {
    waveBreakTimer = 3;
  }

  waveBreakTimer -= dt;
  if (waveBreakTimer <= 0) {
    wave += 1;
    spawnWave(wave);
    waveBreakTimer = 0;
  }
}

function handleInteraction() {
  for (const d of discoveries) {
    if (!d.found && distance(player.x, player.y, d.x, d.y) <= CONFIG.interactionRange) {
      maybeShowDiscoveryIntel(d);
      return;
    }
  }

  for (const p of parts) {
    if (!p.collected && distance(player.x, player.y, p.x, p.y) <= CONFIG.interactionRange) {
      p.collected = true;
      return;
    }
  }

  const canAssemble = allDiscoveriesFound() && allPartsCollected() && !rocketZone.assembled;
  const closeToRocket = distance(player.x, player.y, rocketZone.x, rocketZone.y) <= CONFIG.interactionRange + 8;
  if (canAssemble && closeToRocket) {
    rocketZone.assembled = true;
    launchTimer = 4;
  }
}

function updateCamera() {
  camera.x = player.x - canvas.width * 0.5;
  camera.y = player.y - canvas.height * 0.5;

  camera.x = Math.max(0, Math.min(CONFIG.worldWidth - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(CONFIG.worldHeight - canvas.height, camera.y));
}

function worldToScreen(x, y) {
  return { x: x - camera.x, y: y - camera.y };
}

function screenToWorld(x, y) {
  return { x: x + camera.x, y: y + camera.y };
}

function draw() {
  drawTerrain();
  drawRocketZone();
  drawDiscoveries();
  drawParts();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawInteractionPrompt();
  drawStateOverlay();
}

function drawTerrain() {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0, RENDER_THEME.terrain.skyTop);
  skyGrad.addColorStop(1, RENDER_THEME.terrain.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const skyTexture = renderAssets.terrainSky;
  if (skyTexture.loaded) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(skyTexture.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  drawParallaxLayer(renderAssets.terrainFar, 0.16, canvas.height * 0.18, canvas.height * 0.5, 0.35);
  drawParallaxLayer(renderAssets.terrainMid, 0.34, canvas.height * 0.36, canvas.height * 0.47, 0.4);
  drawParallaxLayer(renderAssets.terrainNear, 0.58, canvas.height * 0.53, canvas.height * 0.42, 0.48);

  const glowX = canvas.width * 0.74;
  const glowY = canvas.height * 0.16;
  const glow = ctx.createRadialGradient(glowX, glowY, 12, glowX, glowY, canvas.width * 0.52);
  glow.addColorStop(0, RENDER_THEME.terrain.glow);
  glow.addColorStop(1, "rgba(126, 240, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const d of dust) {
    const p = worldToScreen(d.x, d.y);
    if (p.x < -5 || p.y < -5 || p.x > canvas.width + 5 || p.y > canvas.height + 5) continue;
    ctx.fillStyle = RENDER_THEME.terrain.dust;
    ctx.beginPath();
    ctx.arc(p.x, p.y, d.r * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = RENDER_THEME.terrain.grid;
  ctx.lineWidth = 1;
  for (let x = -((camera.x % 80) + 80); x < canvas.width + 80; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = -((camera.y % 80) + 80); y < canvas.height + 80; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawParallaxLayer(asset, speed, y, height, alpha) {
  if (!asset.loaded) return;
  const image = asset.image;
  const imageWidth = image.naturalWidth || image.width;
  if (!imageWidth) return;
  const scale = height / ((image.naturalHeight || image.height) || 1);
  const drawWidth = Math.max(1, imageWidth * scale);
  const offset = -((camera.x * speed) % drawWidth);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = offset - drawWidth; x < canvas.width + drawWidth; x += drawWidth) {
    ctx.drawImage(image, x, y, drawWidth, height);
  }
  ctx.restore();
}

function drawPlayer() {
  const p = worldToScreen(player.x, player.y);

  if (renderAssets.player.loaded) {
    const size = player.radius * 2.8;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(player.angle);
    ctx.drawImage(renderAssets.player.image, -size * 0.5, -size * 0.5, size, size);
    ctx.restore();
  } else {
    drawPlayerFallback(p);
  }

  const healthPct = Math.max(0, player.health / CONFIG.playerMaxHealth);
  ctx.fillStyle = RENDER_THEME.player.healthBg;
  ctx.fillRect(p.x - 20, p.y - 28, 40, 6);
  ctx.fillStyle = RENDER_THEME.player.healthFill;
  ctx.fillRect(p.x - 20, p.y - 28, 40 * healthPct, 6);
}

function drawPlayerFallback(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(player.angle);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(player.angle);

  ctx.fillStyle = RENDER_THEME.player.ring;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius + 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = RENDER_THEME.player.shell;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = RENDER_THEME.player.core;
  ctx.beginPath();
  ctx.arc(-3, 0, player.radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = RENDER_THEME.player.barrel;
  ctx.fillRect(0, -4, 22, 8);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    const p = worldToScreen(enemy.x, enemy.y);
    if (renderAssets.enemy.loaded) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const size = enemy.radius * 3;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.drawImage(renderAssets.enemy.image, -size * 0.5, -size * 0.5, size, size);
      ctx.restore();
      continue;
    }
    drawEnemyFallback(p, enemy);
  }
}

function drawEnemyFallback(p, enemy) {
    const pulse = Math.sin(enemy.pulse) * 2;
    ctx.fillStyle = RENDER_THEME.enemy.glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, enemy.radius + pulse + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = RENDER_THEME.enemy.shell;
    ctx.beginPath();
    ctx.arc(p.x, p.y, enemy.radius + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = RENDER_THEME.enemy.core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, enemy.radius - 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawBullets() {
  for (const bullet of bullets) {
    const p = worldToScreen(bullet.x, bullet.y);
    if (renderAssets.bullet.loaded) {
      const angle = Math.atan2(bullet.vy, bullet.vx);
      const width = bullet.radius * 5.2;
      const height = bullet.radius * 2.2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.drawImage(renderAssets.bullet.image, -width * 0.5, -height * 0.5, width, height);
      ctx.restore();
      continue;
    }
    drawBulletFallback(p, bullet);
  }
}

function drawBulletFallback(p, bullet) {
    ctx.fillStyle = RENDER_THEME.bullets.glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, bullet.radius + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = RENDER_THEME.bullets.core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawDiscoveries() {
  for (const d of discoveries) {
    const p = worldToScreen(d.x, d.y);
    if (d.found) {
      ctx.fillStyle = "rgba(115, 243, 167, 0.86)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.strokeStyle = "#9fe8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, d.radius + 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(159, 232, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, d.radius, 0, Math.PI * 2);
    ctx.fill();

    if (renderAssets.discovery.loaded) {
      const size = d.radius * 2.1;
      ctx.drawImage(renderAssets.discovery.image, p.x - size * 0.5, p.y - size * 0.5, size, size);
    } else {
      ctx.fillStyle = "#d9f4ff";
      ctx.fillRect(p.x - 8, p.y - 8, 16, 16);
    }
  }
}

function drawParts() {
  for (const pObj of parts) {
    if (pObj.collected) continue;
    const p = worldToScreen(pObj.x, pObj.y);
    if (renderAssets.rocketPart.loaded) {
      const width = 26;
      const height = 18;
      ctx.drawImage(renderAssets.rocketPart.image, p.x - width * 0.5, p.y - height * 0.5, width, height);
    } else {
      ctx.fillStyle = "#ffe8a0";
      ctx.fillRect(p.x - 10, p.y - 6, 20, 12);
      ctx.strokeStyle = "#8d6d2e";
      ctx.strokeRect(p.x - 10, p.y - 6, 20, 12);
    }
  }
}

function drawRocketZone() {
  const p = worldToScreen(rocketZone.x, rocketZone.y);
  const active = allDiscoveriesFound() && allPartsCollected();

  ctx.strokeStyle = active ? "#87ffb4" : "#9ea9c9";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rocketZone.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = active ? "rgba(126, 240, 255, 0.35)" : "rgba(158, 169, 201, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rocketZone.radius + 9, 0, Math.PI * 2);
  ctx.stroke();

  if (rocketZone.assembled) {
    const flame = launchTimer > 0 ? 10 + Math.sin(launchTimer * 15) * 5 : 0;
    ctx.fillStyle = "#ecf6ff";
    ctx.fillRect(p.x - 10, p.y - 40, 20, 40);
    ctx.fillStyle = "#ffbd64";
    ctx.beginPath();
    ctx.moveTo(p.x - 8, p.y);
    ctx.lineTo(p.x + 8, p.y);
    ctx.lineTo(p.x, p.y + flame + 12);
    ctx.closePath();
    ctx.fill();
  }
}

function drawInteractionPrompt() {
  if (state !== GAME_STATE.PLAYING || intelOpen) return;

  const nearby = getNearbyInteractable();
  if (!nearby) return;

  ctx.fillStyle = "rgba(9, 16, 40, 0.74)";
  ctx.fillRect(12, canvas.height - 47, 388, 34);
  ctx.fillStyle = "#f4fbff";
  ctx.font = "700 16px Inter, Arial";
  ctx.fillText(`Press E to ${nearby.action}: ${nearby.label}`, 20, canvas.height - 24);
}

function getNearbyInteractable() {
  for (const d of discoveries) {
    if (!d.found && distance(player.x, player.y, d.x, d.y) <= CONFIG.interactionRange) {
      return { action: "scan rover", label: d.name };
    }
  }

  for (const p of parts) {
    if (!p.collected && distance(player.x, player.y, p.x, p.y) <= CONFIG.interactionRange) {
      return { action: "collect part", label: p.name };
    }
  }

  const canAssemble = allDiscoveriesFound() && allPartsCollected() && !rocketZone.assembled;
  const nearRocket = distance(player.x, player.y, rocketZone.x, rocketZone.y) <= CONFIG.interactionRange + 8;
  if (canAssemble && nearRocket) {
    return { action: "assemble rocket", label: "Launch Site" };
  }

  return null;
}

function drawStateOverlay() {
  if (state === GAME_STATE.PLAYING) return;

  ctx.fillStyle = "rgba(6, 10, 28, 0.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff6e8";
  ctx.font = "800 52px 'Baloo 2', Arial";

  if (state === GAME_STATE.GAME_OVER) {
    ctx.fillText("MISSION FAILED", canvas.width / 2, canvas.height / 2 - 10);
  } else {
    ctx.fillText("ROCKET LAUNCHED", canvas.width / 2, canvas.height / 2 - 10);
  }

  ctx.font = "700 24px Inter, Arial";
  ctx.fillText("Press R to restart", canvas.width / 2, canvas.height / 2 + 35);
  ctx.textAlign = "start";
}

let lastTimestamp;
function gameLoop(timestamp) {
  if (lastTimestamp === undefined) {
    lastTimestamp = timestamp;
  }

  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  update(dt);
  draw();
  window.requestAnimationFrame(gameLoop);
}

function maybeShowDiscoveryIntel(discoveryNode) {
  if (!discoveryNode || typeof discoveryNode.name !== "string") return;
  openIntelModal(discoveryNode.name, discoveryNode);
}

function openIntelModal(name, discoveryNode = null) {
  if (autoCloseIntelTimer !== null) {
    window.clearTimeout(autoCloseIntelTimer);
    autoCloseIntelTimer = null;
  }

  activeDiscoveryNode = discoveryNode;

  const intel = roverIntelByName[name] || {
    name,
    missionSummary: "NASA intel is currently unavailable for this discovery.",
    missionObjective: "Not available",
    launchDate: "Not available",
    landingDate: "Not available",
    status: "Not available",
    missionDuration: "Not available",
    operator: "Not available",
    keyAchievements: [],
    source: {
      title: "Local fallback",
      url: "",
    },
    imageSource: {
      title: "Not available",
      url: "",
    },
  };

  intelUi.title.textContent = `${intel.name} Intel`;
  intelUi.summary.textContent = asText(intel.missionSummary);
  intelUi.launchDate.textContent = asText(intel.launchDate);
  intelUi.landingDate.textContent = asText(intel.landingDate);
  intelUi.status.textContent = asText(intel.status);
  intelUi.duration.textContent = asText(intel.missionDuration);
  intelUi.operator.textContent = asText(intel.operator);
  intelUi.objective.textContent = asText(intel.missionObjective);

  intelUi.achievements.replaceChildren();
  const achievements = Array.isArray(intel.keyAchievements) && intel.keyAchievements.length > 0 ? intel.keyAchievements : ["Not available"];
  for (const fact of achievements) {
    const li = document.createElement("li");
    li.textContent = asText(fact);
    intelUi.achievements.append(li);
  }

  renderIntelImage(intel);
  renderIntelQuiz(intel, discoveryNode);

  renderAttribution(intelUi.source, "Source", intel.source);
  renderAttribution(intelUi.imageSource, "Image Source", intel.imageSource);

  setIntelModalOpen(true);
  interactPressed = false;
}

function parseLaunchYear(launchDate) {
  if (typeof launchDate !== "string") return null;
  const match = launchDate.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function getNameSeed(name) {
  if (typeof name !== "string") return 0;
  let seed = 0;
  for (const ch of name) seed += ch.charCodeAt(0);
  return seed;
}

function buildQuizOptions(correctYear, roverName) {
  const offsets = [-9, -6, -4, -2, 2, 4, 6, 9, 12, -12];
  const seed = getNameSeed(roverName);
  const start = seed % offsets.length;
  const wrongYears = [];

  for (let i = 0; i < offsets.length && wrongYears.length < 3; i += 1) {
    const offset = offsets[(start + i) % offsets.length];
    const candidate = correctYear + offset;
    if (candidate === correctYear || candidate < 1900 || candidate > 2100 || wrongYears.includes(candidate)) continue;
    wrongYears.push(candidate);
  }

  while (wrongYears.length < 3) {
    const bump = 14 + wrongYears.length * 3;
    wrongYears.push(correctYear + bump);
  }

  const options = [correctYear, ...wrongYears];
  const rotate = seed % options.length;
  return options.slice(rotate).concat(options.slice(0, rotate));
}

function setQuizFeedback(message, status) {
  intelUi.quizFeedback.textContent = message;
  intelUi.quizFeedback.className = "intel-modal__quiz-feedback";
  if (status === "error") {
    intelUi.quizFeedback.classList.add("intel-modal__quiz-feedback--error");
  } else if (status === "success") {
    intelUi.quizFeedback.classList.add("intel-modal__quiz-feedback--success");
  }
}

function markDiscoveryRetrieved() {
  if (!activeDiscoveryNode || activeDiscoveryNode.found) return;
  activeDiscoveryNode.found = true;
  seenIntelEntries.add(activeDiscoveryNode.name);
  updateHud();
}

function renderIntelQuiz(intel, discoveryNode) {
  intelUi.quizOptions.replaceChildren();
  setQuizFeedback("", null);

  const alreadyRetrieved = Boolean(discoveryNode?.found);
  const launchYear = parseLaunchYear(intel?.launchDate);

  if (alreadyRetrieved) {
    intelUi.quizPrompt.textContent = "Rover retrieval already confirmed.";
    setQuizFeedback("Rover already retrieved.", "success");
    return;
  }

  if (!Number.isInteger(launchYear)) {
    intelUi.quizPrompt.textContent = "Launch year data is unavailable for this rover.";
    const fallbackButton = document.createElement("button");
    fallbackButton.type = "button";
    fallbackButton.className = "intel-modal__quiz-option";
    fallbackButton.textContent = "Retrieve Rover";
    fallbackButton.addEventListener("click", () => {
      markDiscoveryRetrieved();
      setQuizFeedback("Success! Rover retrieved.", "success");
      autoCloseIntelTimer = window.setTimeout(() => {
        closeIntelModal();
      }, 650);
    });
    intelUi.quizOptions.append(fallbackButton);
    return;
  }

  intelUi.quizPrompt.textContent = `What year was ${asText(intel.name)} launched?`;
  const options = buildQuizOptions(launchYear, intel?.name);
  for (const optionYear of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "intel-modal__quiz-option";
    button.textContent = String(optionYear);
    button.addEventListener("click", () => {
      if (optionYear !== launchYear) {
        setQuizFeedback("Not quite. Try again!", "error");
        return;
      }

      markDiscoveryRetrieved();
      setQuizFeedback("Correct! Rover retrieved.", "success");
      autoCloseIntelTimer = window.setTimeout(() => {
        closeIntelModal();
      }, 650);
    });
    intelUi.quizOptions.append(button);
  }
}

function asText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "Not available";
}

function asAttribution(value) {
  if (value && typeof value === "object") {
    const title = asText(value.title);
    const url = typeof value.url === "string" ? value.url.trim() : "";
    return { title, url };
  }

  if (typeof value === "string" && value.trim()) {
    return { title: value.trim(), url: "" };
  }

  return { title: "Not available", url: "" };
}

function renderAttribution(element, label, attribution) {
  const source = asAttribution(attribution);
  element.replaceChildren();
  element.append(`${label}: `);
  if (source.url) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title;
    element.append(link);
    return;
  }
  element.append(source.title);
}

function renderIntelImage(intel) {
  const url = typeof intel.imageUrl === "string" ? intel.imageUrl.trim() : "";
  const name = asText(intel.name);
  intelUi.image.alt = `${name} mission image`;

  if (!url) {
    intelUi.image.hidden = true;
    intelUi.image.removeAttribute("src");
    intelUi.imageFallback.hidden = false;
    intelUi.imageFallback.textContent = "Image not available";
    return;
  }

  intelUi.image.hidden = false;
  intelUi.imageFallback.hidden = true;
  intelUi.imageFallback.textContent = "Image not available";
  intelUi.image.onerror = () => {
    intelUi.image.hidden = true;
    intelUi.imageFallback.hidden = false;
    intelUi.imageFallback.textContent = "Image failed to load";
  };
  intelUi.image.onload = () => {
    intelUi.image.hidden = false;
    intelUi.imageFallback.hidden = true;
  };
  intelUi.image.src = url;
}

function closeIntelModal() {
  if (autoCloseIntelTimer !== null) {
    window.clearTimeout(autoCloseIntelTimer);
    autoCloseIntelTimer = null;
  }
  activeDiscoveryNode = null;
  setIntelModalOpen(false);
}

async function loadRoverIntel() {
  try {
    const response = await fetch("data/rovers.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load rover data: ${response.status}`);
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) {
      throw new Error("Rover data is not an array");
    }

    roverIntelByName = {};
    for (const entry of entries) {
      if (!entry || typeof entry.name !== "string") continue;
      roverIntelByName[entry.name] = entry;
    }
  } catch (error) {
    roverIntelByName = {};
    console.warn("Rover intel unavailable; fallback text will be used.", error);
  }
}

function bindIntelModalEvents() {
  intelUi.close.addEventListener("click", closeIntelModal);
  intelUi.root.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeIntel === "true") {
      closeIntelModal();
    }
  });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (intelOpen) {
    if (key === "escape" || key === "enter" || key === " ") {
      closeIntelModal();
      event.preventDefault();
    }
    return;
  }

  keys[key] = true;

  if (key === "e" && state === GAME_STATE.PLAYING) {
    interactPressed = true;
  }

  if (key === "r" && state !== GAME_STATE.PLAYING) {
    resetGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    mouse.down = true;
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    mouse.down = false;
  }
});

bindIntelModalEvents();
Promise.allSettled([loadRoverIntel(), loadAssetManifest()]).finally(() => {
  resetGame();
  window.requestAnimationFrame(gameLoop);
});
