import { Player } from "@minecraft/server";
import { CONFIG, TICKS_PER_SECOND } from "./config.js";
import { STATE } from "./state.js";
import { getPlayerKey, nowTick } from "./utils.js";

export const COMBAT_SCRIPT_EVENT_ID = "qol:combat";
export const COMBAT_OVERRIDE_MODES = {
  forcedIn: "force_in",
  forcedOut: "force_out",
};

const FORCED_IN_OVERRIDE = "forced_in";
const FORCED_OUT_OVERRIDE = "forced_out";
const FORCED_HUD_VALUE = "__forced__";

function getCombatOverrideByName(playerName) {
  return STATE.combatOverrideByName.get(playerName);
}

function getForcedOverrideMode(overrideValue) {
  if (overrideValue === FORCED_IN_OVERRIDE) return FORCED_IN_OVERRIDE;
  if (overrideValue === FORCED_OUT_OVERRIDE) return FORCED_OUT_OVERRIDE;
  return undefined;
}

export function getCombatTicksRemainingByName(playerName) {
  const expiry = STATE.combatUntilByName.get(playerName);
  if (typeof expiry !== "number") return 0;
  return Math.max(0, expiry - nowTick());
}

export function getCombatTicksRemaining(player) {
  return getCombatTicksRemainingByName(getPlayerKey(player));
}

export function isPlayerNameInCombat(playerName) {
  const override = getForcedOverrideMode(getCombatOverrideByName(playerName));
  if (override === FORCED_IN_OVERRIDE) return true;
  if (override === FORCED_OUT_OVERRIDE) return false;
  return getCombatTicksRemainingByName(playerName) > 0;
}

export function isInCombat(player) {
  return isPlayerNameInCombat(getPlayerKey(player));
}

export function setCombat(player) {
  const playerKey = getPlayerKey(player);
  if (getForcedOverrideMode(getCombatOverrideByName(playerKey)) === FORCED_OUT_OVERRIDE) {
    return;
  }

  const expiry = nowTick() + CONFIG.combatTagSeconds * TICKS_PER_SECOND;
  STATE.combatUntilByName.set(playerKey, expiry);
  player.addTag("qol:in_combat");
}

export function clearCombatHud(player) {
  if (!CONFIG.combatHudEnabled) return;

  const playerKey = getPlayerKey(player);
  if (!STATE.lastCombatHudValueByName.has(playerKey)) return;

  player.onScreenDisplay.setActionBar("");
  STATE.lastCombatHudValueByName.delete(playerKey);
}

export function updateCombatHud(player) {
  if (!CONFIG.combatHudEnabled) return;

  const playerKey = getPlayerKey(player);
  if (getForcedOverrideMode(getCombatOverrideByName(playerKey)) === FORCED_IN_OVERRIDE) {
    if (STATE.lastCombatHudValueByName.get(playerKey) === FORCED_HUD_VALUE) {
      return;
    }

    player.onScreenDisplay.setActionBar(CONFIG.combatHudManualMessage);
    STATE.lastCombatHudValueByName.set(playerKey, FORCED_HUD_VALUE);
    return;
  }

  const remainingTicks = getCombatTicksRemainingByName(playerKey);
  if (remainingTicks <= 0) {
    STATE.lastCombatHudValueByName.delete(playerKey);
    return;
  }

  const secondsRemaining = Math.ceil(remainingTicks / TICKS_PER_SECOND);
  if (STATE.lastCombatHudValueByName.get(playerKey) === secondsRemaining) {
    return;
  }

  const formattedSeconds =
    secondsRemaining <= CONFIG.combatHudFinalSeconds
      ? `\u00a74${secondsRemaining}`
      : `\u00a7e${secondsRemaining}`;

  player.onScreenDisplay.setActionBar(
    CONFIG.combatHudMessage.replace("{seconds}", formattedSeconds),
  );
  STATE.lastCombatHudValueByName.set(playerKey, secondsRemaining);
}

export function updateCombatState(player) {
  const playerKey = getPlayerKey(player);
  if (isPlayerNameInCombat(playerKey)) {
    player.addTag("qol:in_combat");
    updateCombatHud(player);
    return;
  }

  STATE.combatUntilByName.delete(playerKey);
  player.removeTag("qol:in_combat");
  clearCombatHud(player);
}

export function setCombatOverride(playerOrName, mode) {
  const playerKey = getPlayerKey(playerOrName);

  if (mode === COMBAT_OVERRIDE_MODES.forcedIn || mode === FORCED_IN_OVERRIDE) {
    STATE.combatOverrideByName.set(playerKey, FORCED_IN_OVERRIDE);
    return;
  }

  if (mode === COMBAT_OVERRIDE_MODES.forcedOut || mode === FORCED_OUT_OVERRIDE) {
    STATE.combatOverrideByName.set(playerKey, FORCED_OUT_OVERRIDE);
    STATE.combatUntilByName.delete(playerKey);
    return;
  }

  STATE.combatOverrideByName.delete(playerKey);
}

export function clearCombatOverride(playerOrName) {
  STATE.combatOverrideByName.delete(getPlayerKey(playerOrName));
}

export function getCombatStatus(player) {
  const playerKey = getPlayerKey(player);
  const override = getForcedOverrideMode(getCombatOverrideByName(playerKey));

  return {
    overrideMode:
      override === FORCED_IN_OVERRIDE
        ? COMBAT_OVERRIDE_MODES.forcedIn
        : override === FORCED_OUT_OVERRIDE
          ? COMBAT_OVERRIDE_MODES.forcedOut
          : "auto",
    inCombat: isPlayerNameInCombat(playerKey),
    timedTicksRemaining: getCombatTicksRemainingByName(playerKey),
  };
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
  STATE.combatOverrideByName.delete(playerKey);
  STATE.borderWarnCooldownByName.delete(playerKey);
  STATE.safeZoneWarnCooldownByName.delete(playerKey);
  STATE.lastCombatHudValueByName.delete(playerKey);
  STATE.recentProxyDeathsByName.delete(playerKey);
}
