import { CONFIG } from "./config.js";
import { STATE } from "./state.js";
import { getPlayerKey, nowTick } from "./utils.js";

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

export function getSafeZoneAtPlayer(player) {
  for (const zone of CONFIG.safeZones) {
    if (zone.dimensionId !== player.dimension.id) continue;
    if (isInsideBounds(player.location, zone.min, zone.max)) {
      return zone;
    }
  }

  return undefined;
}

export function isInSafeZone(player) {
  return !!getSafeZoneAtPlayer(player);
}

export function warnSafeZoneBlockedCombat(player) {
  const playerKey = getPlayerKey(player);
  const cooldownUntil = STATE.safeZoneWarnCooldownByName.get(playerKey) ?? 0;
  if (cooldownUntil > nowTick()) return;

  player.sendMessage("\u00a7eCombat interactions are disabled in this safe zone.");
  STATE.safeZoneWarnCooldownByName.set(
    playerKey,
    nowTick() + CONFIG.safeZoneMessageCooldownTicks,
  );
}
