import { EquipmentSlot, Player } from "@minecraft/server";
import { CONFIG, TICKS_PER_SECOND } from "./config.js";
import { STATE } from "./state.js";
import { getPlayerKey, nowTick } from "./utils.js";

export function getCombatTicksRemainingByName(playerName) {
  const expiry = STATE.combatUntilByName.get(playerName);
  if (typeof expiry !== "number") return 0;
  return Math.max(0, expiry - nowTick());
}

export function getCombatTicksRemaining(player) {
  return getCombatTicksRemainingByName(getPlayerKey(player));
}

export function setCombat(player) {
  const expiry = nowTick() + CONFIG.combatTagSeconds * TICKS_PER_SECOND;
  STATE.combatUntilByName.set(getPlayerKey(player), expiry);
  player.addTag("qol:in_combat");
}

export function isInCombat(player) {
  return getCombatTicksRemaining(player) > 0;
}

export function clearCombatHud(player) {
  if (!CONFIG.combatHudEnabled) return;
  player.onScreenDisplay.setActionBar(" ");
  STATE.lastCombatHudSecondsByName.delete(getPlayerKey(player));
}

export function updateCombatHud(player) {
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
      ? `\u00a74${secondsRemaining}`
      : `\u00a7e${secondsRemaining}`;
  const message = CONFIG.combatHudMessage.replace("{seconds}", formattedSeconds);

  player.onScreenDisplay.setActionBar(message);
  STATE.lastCombatHudSecondsByName.set(playerKey, secondsRemaining);
}

export function updateCombatState(player) {
  if (isInCombat(player)) {
    player.addTag("qol:in_combat");
    updateCombatHud(player);
    return;
  }

  STATE.combatUntilByName.delete(getPlayerKey(player));
  player.removeTag("qol:in_combat");
  clearCombatHud(player);
}

export function disableEquippedElytra(player) {
  const equippable = player.getComponent("equippable");
  const inventory = player.getComponent("inventory")?.container;
  if (!equippable || !inventory) return;

  const chestItem = equippable.getEquipment(EquipmentSlot.Chest);
  if (!chestItem || chestItem.typeId !== "minecraft:elytra") return;

  equippable.setEquipment(EquipmentSlot.Chest);
  const leftover = inventory.addItem(chestItem);
  if (leftover) {
    player.dimension.spawnItem(leftover, player.location);
    player.sendMessage(
      "\u00a7eElytra disabled. Inventory full, leftover item dropped.",
    );
    return;
  }

  player.sendMessage("\u00a7eElytra disabled after taking player damage.");
}

export function getPlayerDamager(damageSource) {
  if (damageSource?.damagingEntity instanceof Player) {
    return damageSource.damagingEntity;
  }

  const projectile = damageSource?.damagingProjectile;
  if (!projectile || projectile.typeId !== "minecraft:arrow") return undefined;

  const projectileOwner = projectile.getComponent("projectile")?.owner;
  return projectileOwner instanceof Player ? projectileOwner : undefined;
}

export function clearPlayerState(playerOrName) {
  const playerKey = getPlayerKey(playerOrName);
  STATE.combatUntilByName.delete(playerKey);
  STATE.borderWarnCooldownByName.delete(playerKey);
  STATE.safeZoneWarnCooldownByName.delete(playerKey);
  STATE.lastCombatHudSecondsByName.delete(playerKey);
}
