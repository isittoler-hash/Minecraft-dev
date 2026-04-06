import { Player, system, world } from "@minecraft/server";
import {
  COMBAT_SCRIPT_EVENT_ID,
  clearCombatOverride,
  clearPlayerState,
  COMBAT_OVERRIDE_MODES,
  getCombatStatus,
  getPlayerDamager,
  isPlayerNameInCombat,
  setCombat,
  setCombatOverride,
  updateCombatState,
} from "./combat.js";
import { CONFIG, TICKS_PER_SECOND } from "./config.js";
import {
  getPlayerProxyStatus,
  handleSpawnedItemEntity,
  reconcileCombatElytra,
  reconcileGroundProxyItems,
  recordPlayerDeath,
} from "./elytra-proxy.js";
import { sendJoinWelcome } from "./join.js";
import { isInSafeZone, warnSafeZoneBlockedCombat } from "./safe-zones.js";
import { STATE } from "./state.js";
import { enforceWorldBorder } from "./world-border.js";
import { applySpeedByBlock } from "./speed.js";

let isBootstrapped = false;

export function bootstrapQolPlugin() {
  if (isBootstrapped) return;
  isBootstrapped = true;

  world.afterEvents.entityHurt.subscribe((event) => {
    const victim = event.hurtEntity;
    if (!(victim instanceof Player)) return;

    const damager = getPlayerDamager(event.damageSource);
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
    reconcileCombatElytra(damager);
    reconcileCombatElytra(victim);
  });

  world.afterEvents.entityDie.subscribe((event) => {
    if (event.deadEntity instanceof Player) {
      recordPlayerDeath(event.deadEntity);
    }
  });

  world.afterEvents.entitySpawn.subscribe((event) => {
    handleSpawnedItemEntity(event.entity);
  });

  world.afterEvents.playerLeave.subscribe((event) => {
    if (isPlayerNameInCombat(event.playerName)) {
      STATE.combatLogPenalty.add(event.playerName);
    }

    clearPlayerState(event.playerName);
  });

  world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    reconcileCombatElytra(player, { forceRestore: true });

    if (event.initialSpawn) {
      sendJoinWelcome(player);
    }

    if (!event.initialSpawn || !STATE.combatLogPenalty.has(player.name)) return;

    STATE.combatLogPenalty.delete(player.name);
    player.runCommandAsync("damage @s 9999 void");
    player.sendMessage("\u00a7cCombat logging penalty applied.");
  });

  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== COMBAT_SCRIPT_EVENT_ID) return;
    handleCombatScriptEvent(event);
  });

  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      updateCombatState(player);
      reconcileCombatElytra(player);
      applySpeedByBlock(player);
      enforceWorldBorder(player);
    }
  }, CONFIG.checkIntervalTicks);

  system.runInterval(() => {
    reconcileGroundProxyItems();
  }, CONFIG.proxyGroundScanIntervalTicks);
}

function handleCombatScriptEvent(event) {
  const sender = getScriptEventPlayer(event);
  const message = event.message.trim();
  const [action = "", ...rest] = message.length > 0 ? message.split(/\s+/) : [];
  const targetName = rest.join(" ").trim();

  if (!action) {
    replyToSender(sender, getCombatUsage());
    return;
  }

  const target = resolveTargetPlayer(sender, targetName);
  if (!target) {
    replyToSender(
      sender,
      targetName.length > 0
        ? `\u00a7cPlayer not found: ${targetName}`
        : getCombatUsage(),
    );
    return;
  }

  switch (action.toLowerCase()) {
    case COMBAT_OVERRIDE_MODES.forcedIn:
      setCombatOverride(target, COMBAT_OVERRIDE_MODES.forcedIn);
      updateCombatState(target);
      reconcileCombatElytra(target);
      notifyCombatCommand(sender, target, "forced into combat.");
      break;
    case COMBAT_OVERRIDE_MODES.forcedOut:
      setCombatOverride(target, COMBAT_OVERRIDE_MODES.forcedOut);
      updateCombatState(target);
      reconcileCombatElytra(target, { forceRestore: true });
      reconcileGroundProxyItems();
      notifyCombatCommand(sender, target, "forced out of combat.");
      break;
    case "auto":
      clearCombatOverride(target);
      updateCombatState(target);
      reconcileCombatElytra(target);
      notifyCombatCommand(sender, target, "returned to automatic combat state.");
      break;
    case "status":
      replyToSender(sender, formatCombatStatus(target));
      break;
    default:
      replyToSender(sender, getCombatUsage());
      break;
  }
}

function formatCombatStatus(player) {
  const combatStatus = getCombatStatus(player);
  const proxyStatus = getPlayerProxyStatus(player);
  const secondsRemaining = Math.ceil(combatStatus.timedTicksRemaining / TICKS_PER_SECOND);

  return [
    `\u00a76Combat status for ${player.name}`,
    `\u00a77Override: \u00a7f${combatStatus.overrideMode}`,
    `\u00a77In combat: \u00a7f${combatStatus.inCombat}`,
    `\u00a77Timed seconds remaining: \u00a7f${secondsRemaining}`,
    `\u00a77Chest item: \u00a7f${proxyStatus.chestItemTypeId}`,
    `\u00a77Carried proxy count: \u00a7f${proxyStatus.carriedProxyCount}`,
  ].join("\n");
}

function resolveTargetPlayer(sender, targetName) {
  if (targetName.length === 0) {
    return sender;
  }

  const exactMatch = world
    .getAllPlayers()
    .find((player) => player.name === targetName);
  if (exactMatch) return exactMatch;

  const lowerName = targetName.toLowerCase();
  const caseInsensitiveMatches = world
    .getAllPlayers()
    .filter((player) => player.name.toLowerCase() === lowerName);

  return caseInsensitiveMatches.length === 1 ? caseInsensitiveMatches[0] : undefined;
}

function getScriptEventPlayer(event) {
  if (event.sourceEntity instanceof Player) {
    return event.sourceEntity;
  }

  if (event.initiator instanceof Player) {
    return event.initiator;
  }

  return undefined;
}

function notifyCombatCommand(sender, target, detail) {
  const message = `\u00a7e${target.name} ${detail}`;
  replyToSender(sender, message);

  if (sender?.name !== target.name) {
    target.sendMessage(message);
  }
}

function replyToSender(sender, message) {
  if (sender) {
    sender.sendMessage(message);
    return;
  }

  world.sendMessage(message);
}

function getCombatUsage() {
  return [
    "\u00a7eUsage:",
    "\u00a77/scriptevent qol:combat force_in [player]",
    "\u00a77/scriptevent qol:combat force_out [player]",
    "\u00a77/scriptevent qol:combat auto [player]",
    "\u00a77/scriptevent qol:combat status [player]",
  ].join("\n");
}
