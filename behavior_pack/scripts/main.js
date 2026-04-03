import { EquipmentSlot, Player, system, world } from "@minecraft/server";

const CONFIG = {
  worldBorderRadius: 1500,
  combatTagSeconds: 15,
  checkIntervalTicks: 20,
  speedEffectSeconds: 2,
};

const STATE = {
  combatUntilByName: new Map(),
  combatLogPenalty: new Set(),
  borderWarnCooldownByName: new Map(),
};

function nowTick() {
  return system.currentTick;
}

function setCombat(player) {
  const expiry = nowTick() + CONFIG.combatTagSeconds * 20;
  STATE.combatUntilByName.set(player.name, expiry);
  player.addTag("qol:in_combat");
}

function isInCombat(player) {
  const expiry = STATE.combatUntilByName.get(player.name);
  return typeof expiry === "number" && expiry > nowTick();
}

function updateCombatState(player) {
  if (isInCombat(player)) {
    player.addTag("qol:in_combat");
    return;
  }

  STATE.combatUntilByName.delete(player.name);
  player.removeTag("qol:in_combat");
}

function applySpeedByBlock(player) {
  const blockBelow = player.dimension.getBlock({
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y) - 1,
    z: Math.floor(player.location.z),
  });

  if (!blockBelow) return;

  const blockId = blockBelow.typeId;

  if (blockId === "minecraft:bricks") {
    player.addEffect("speed", CONFIG.speedEffectSeconds * 20, {
      amplifier: 1,
      showParticles: false,
    });
    return;
  }

  if (blockId === "minecraft:dirt_path") {
    player.addEffect("speed", CONFIG.speedEffectSeconds * 20, {
      amplifier: 0,
      showParticles: false,
    });
  }
}

function clampToBorder(value, radius) {
  if (value > radius) return radius - 0.5;
  if (value < -radius) return -radius + 0.5;
  return value;
}

function enforceWorldBorder(player) {
  const { x, y, z } = player.location;
  const r = CONFIG.worldBorderRadius;

  if (Math.abs(x) <= r && Math.abs(z) <= r) {
    return;
  }

  const clamped = {
    x: clampToBorder(x, r),
    y,
    z: clampToBorder(z, r),
  };

  player.teleport(clamped, { dimension: player.dimension });
  player.applyKnockback(0, 0, 0.8, 0.1);

  const cooldownUntil = STATE.borderWarnCooldownByName.get(player.name) ?? 0;
  if (cooldownUntil <= nowTick()) {
    player.sendMessage("§cYou reached the world border.");
    STATE.borderWarnCooldownByName.set(player.name, nowTick() + 100);
  }
}

function applyCombatElytraRule(player) {
  if (!player.hasTag("qol:in_combat")) return;

  const equippable = player.getComponent("equippable");
  if (!equippable) return;

  const chestItem = equippable.getEquipment(EquipmentSlot.Chest);
  if (!chestItem || chestItem.typeId !== "minecraft:elytra") return;

  equippable.setEquipment(EquipmentSlot.Chest);
  player.dimension.spawnItem(chestItem, player.location);
  player.sendMessage("§eElytra is disabled while in combat.");
}

world.afterEvents.entityHurt.subscribe((ev) => {
  const attacker = ev.damageSource.damagingEntity;
  const victim = ev.hurtEntity;

  if (!(attacker instanceof Player) || !(victim instanceof Player)) return;

  setCombat(attacker);
  setCombat(victim);
});

world.afterEvents.playerLeave.subscribe((ev) => {
  const pseudoPlayer = { name: ev.playerName };
  if (isInCombat(pseudoPlayer)) {
    STATE.combatLogPenalty.add(ev.playerName);
  }
  STATE.combatUntilByName.delete(ev.playerName);
  STATE.borderWarnCooldownByName.delete(ev.playerName);
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;

  const player = ev.player;
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
    applyCombatElytraRule(player);
  }
}, CONFIG.checkIntervalTicks);
