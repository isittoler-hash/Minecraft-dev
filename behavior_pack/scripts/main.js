import { EquipmentSlot, Player, system, world } from "@minecraft/server";

const TICKS_PER_SECOND = 20;
const BORDER_WARNING_COOLDOWN_TICKS = 100;
const BORDER_TELEPORT_PADDING = 0.5;
const BORDER_KNOCKBACK_HORIZONTAL = 0.8;
const BORDER_KNOCKBACK_VERTICAL = 0.1;

const CONFIG = {
  worldBorderRadius: 1500,
  worldBorderRadiusByDimension: {
    "minecraft:overworld": 1500,
    "minecraft:nether": 375,
    "minecraft:the_end": 1500,
  },
  combatTagSeconds: 15,
  checkIntervalTicks: 20,
  speedEffectSeconds: 2,
  joinBroadcastEnabled: true,
  joinBroadcastMessage: "§a{player} joined the server. Welcome!",
  joinTitleEnabled: true,
  joinTitle: "§6Welcome",
  joinSubtitle: "§eHave fun and play fair!",
  safeZones: [
    {
      name: "spawn",
      dimensionId: "minecraft:overworld",
      min: { x: -64, y: -64, z: -64 },
      max: { x: 64, y: 320, z: 64 },
    },
  ],
  safeZoneMessageCooldownTicks: 100,
  combatHudEnabled: true,
  combatHudMessage: "§c⚔ In combat: §e{seconds}s",
  combatHudFinalSeconds: 5,
};

const STATE = {
  combatUntilByName: new Map(),
  combatLogPenalty: new Set(),
  borderWarnCooldownByName: new Map(),
  safeZoneWarnCooldownByName: new Map(),
  lastCombatHudSecondsByName: new Map(),
};

function nowTick() {
  return system.currentTick;
}

function getPlayerKey(playerOrName) {
  return typeof playerOrName === "string" ? playerOrName : playerOrName.name;
}

function getCombatTicksRemainingByName(playerName) {
  const expiry = STATE.combatUntilByName.get(playerName);
  if (typeof expiry !== "number") return 0;
  return Math.max(0, expiry - nowTick());
}

function getCombatTicksRemaining(player) {
  return getCombatTicksRemainingByName(getPlayerKey(player));
}

function setCombat(player) {
  const expiry = nowTick() + CONFIG.combatTagSeconds * TICKS_PER_SECOND;
  STATE.combatUntilByName.set(getPlayerKey(player), expiry);
  player.addTag("qol:in_combat");
}

function isInCombat(player) {
  return getCombatTicksRemaining(player) > 0;
}

function clearCombatHud(player) {
  if (!CONFIG.combatHudEnabled) return;
  player.onScreenDisplay.setActionBar("");
  STATE.lastCombatHudSecondsByName.delete(getPlayerKey(player));
}

function updateCombatHud(player) {
  if (!CONFIG.combatHudEnabled) return;

  const remainingTicks = getCombatTicksRemaining(player);
  if (remainingTicks <= 0) {
    STATE.lastCombatHudSecondsByName.delete(getPlayerKey(player));
    return;
  }

  const playerKey = getPlayerKey(player);
  const secondsRemaining = Math.ceil(remainingTicks / TICKS_PER_SECOND);
  const lastShown = STATE.lastCombatHudSecondsByName.get(playerKey);
  if (lastShown === secondsRemaining) return;

  const formattedSeconds =
    secondsRemaining <= CONFIG.combatHudFinalSeconds
      ? `§4${secondsRemaining}`
      : `§e${secondsRemaining}`;
  const message = CONFIG.combatHudMessage.replace("{seconds}", formattedSeconds);

  player.onScreenDisplay.setActionBar(message);
  STATE.lastCombatHudSecondsByName.set(playerKey, secondsRemaining);
}

function updateCombatState(player) {
  if (isInCombat(player)) {
    player.addTag("qol:in_combat");
    updateCombatHud(player);
    return;
  }

  STATE.combatUntilByName.delete(getPlayerKey(player));
  player.removeTag("qol:in_combat");
  clearCombatHud(player);
}

function isInsideBounds(location, min, max) {
  return (
    location.x >= min.x &&
    location.x <= max.x &&
    location.y >= min.y &&
    location.y <= max.y &&
    location.z >= min.z &&
    location.z <= max.z
  );
}

function getSafeZoneAtPlayer(player) {
  for (const zone of CONFIG.safeZones) {
    if (zone.dimensionId !== player.dimension.id) continue;
    if (isInsideBounds(player.location, zone.min, zone.max)) {
      return zone;
    }
  }

  return undefined;
}

function isInSafeZone(player) {
  return !!getSafeZoneAtPlayer(player);
}

function warnSafeZoneBlockedCombat(player) {
  const playerKey = getPlayerKey(player);
  const cooldownUntil = STATE.safeZoneWarnCooldownByName.get(playerKey) ?? 0;
  if (cooldownUntil > nowTick()) return;

  player.sendMessage("§eCombat interactions are disabled in this safe zone.");
  STATE.safeZoneWarnCooldownByName.set(
    playerKey,
    nowTick() + CONFIG.safeZoneMessageCooldownTicks,
  );
}

function applySpeedByBlock(player) {
  const blockBelow = player.dimension.getBlock({
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y - 0.1),
    z: Math.floor(player.location.z),
  });

  if (!blockBelow) return;

  const blockId = blockBelow.typeId;

  if (blockId === "minecraft:bricks") {
    player.addEffect("speed", CONFIG.speedEffectSeconds * TICKS_PER_SECOND, {
      amplifier: 1,
      showParticles: false,
    });
    return;
  }

  if (blockId === "minecraft:dirt_path") {
    player.addEffect("speed", CONFIG.speedEffectSeconds * TICKS_PER_SECOND, {
      amplifier: 0,
      showParticles: false,
    });
  }
}

function getBorderRadiusForDimension(dimensionId) {
  const perDimensionRadius =
    CONFIG.worldBorderRadiusByDimension?.[dimensionId];

  if (typeof perDimensionRadius === "number" && perDimensionRadius > 0) {
    return perDimensionRadius;
  }

  return CONFIG.worldBorderRadius;
}

function clampToBorder(value, radius) {
  if (value > radius) return radius - BORDER_TELEPORT_PADDING;
  if (value < -radius) return -radius + BORDER_TELEPORT_PADDING;
  return value;
}

function enforceWorldBorder(player) {
  const { x, y, z } = player.location;
  const r = getBorderRadiusForDimension(player.dimension.id);

  if (Math.abs(x) <= r && Math.abs(z) <= r) {
    return;
  }

  const clamped = {
    x: clampToBorder(x, r),
    y,
    z: clampToBorder(z, r),
  };

  player.teleport(clamped, { dimension: player.dimension });
  player.applyKnockback(0, 0, BORDER_KNOCKBACK_HORIZONTAL, BORDER_KNOCKBACK_VERTICAL);

  const playerKey = getPlayerKey(player);
  const cooldownUntil = STATE.borderWarnCooldownByName.get(playerKey) ?? 0;
  if (cooldownUntil <= nowTick()) {
    player.sendMessage("§cYou reached the world border.");
    STATE.borderWarnCooldownByName.set(playerKey, nowTick() + BORDER_WARNING_COOLDOWN_TICKS);
  }
}

function disableEquippedElytra(player) {
  const equippable = player.getComponent("equippable");
  const inventory = player.getComponent("inventory")?.container;
  if (!equippable || !inventory) return;

  const chestItem = equippable.getEquipment(EquipmentSlot.Chest);
  if (!chestItem || chestItem.typeId !== "minecraft:elytra") return;

  equippable.setEquipment(EquipmentSlot.Chest);
  const leftover = inventory.addItem(chestItem);
  if (leftover) {
    player.dimension.spawnItem(leftover, player.location);
    player.sendMessage("§eElytra disabled. Inventory full, leftover item dropped.");
    return;
  }

  player.sendMessage("§eElytra disabled after taking player damage.");
}

function getPlayerDamager(damageSource) {
  if (damageSource.damagingEntity instanceof Player) {
    return damageSource.damagingEntity;
  }

  const projectile = damageSource.damagingProjectile;
  if (!projectile || projectile.typeId !== "minecraft:arrow") return undefined;

  const projectileOwner = projectile.getComponent("projectile")?.owner;
  return projectileOwner instanceof Player ? projectileOwner : undefined;
}

function sendJoinWelcome(player) {
  if (CONFIG.joinBroadcastEnabled) {
    const msg = CONFIG.joinBroadcastMessage.replace("{player}", player.name);
    world.sendMessage(msg);
  }

  if (CONFIG.joinTitleEnabled) {
    player.onScreenDisplay.setTitle(CONFIG.joinTitle, {
      subtitle: CONFIG.joinSubtitle,
      stayDuration: 70,
      fadeInDuration: 10,
      fadeOutDuration: 20,
    });
  }
}

function clearPlayerState(playerOrName) {
  const playerKey = getPlayerKey(playerOrName);
  STATE.combatUntilByName.delete(playerKey);
  STATE.borderWarnCooldownByName.delete(playerKey);
  STATE.safeZoneWarnCooldownByName.delete(playerKey);
  STATE.lastCombatHudSecondsByName.delete(playerKey);
}

world.afterEvents.entityHurt.subscribe((ev) => {
  const victim = ev.hurtEntity;
  if (!(victim instanceof Player)) return;

  const damager = getPlayerDamager(ev.damageSource);
  if (!damager) return;

  if (isInSafeZone(victim) || isInSafeZone(damager)) {
    warnSafeZoneBlockedCombat(victim);
    if (damager.name !== victim.name) {
      warnSafeZoneBlockedCombat(damager);
    }
    return;
  }

  setCombat(damager);
  setCombat(victim);
  disableEquippedElytra(victim);
});

world.afterEvents.playerLeave.subscribe((ev) => {
  if (getCombatTicksRemainingByName(ev.playerName) > 0) {
    STATE.combatLogPenalty.add(ev.playerName);
  }
  clearPlayerState(ev.playerName);
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;

  const player = ev.player;
  sendJoinWelcome(player);

  if (!STATE.combatLogPenalty.has(player.name)) return;

  STATE.combatLogPenalty.delete(player.name);
  player.runCommandAsync("damage @s 9999 void");
  player.sendMessage("§cCombat logging penalty applied.");
});

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    updateCombatState(player);
    applySpeedByBlock(player);
    enforceWorldBorder(player);
  }
}, CONFIG.checkIntervalTicks);
