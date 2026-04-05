import { Player, system, world } from "@minecraft/server";
import {
  clearPlayerState,
  disableEquippedElytra,
  getCombatTicksRemainingByName,
  getPlayerDamager,
  setCombat,
  updateCombatState,
} from "./combat.js";
import { CONFIG } from "./config.js";
import { sendJoinWelcome } from "./join.js";
import { isInSafeZone, warnSafeZoneBlockedCombat } from "./safe-zones.js";
import { applySpeedByBlock } from "./speed.js";
import { STATE } from "./state.js";
import { enforceWorldBorder } from "./world-border.js";

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
    disableEquippedElytra(victim);
  });

  world.afterEvents.playerLeave.subscribe((event) => {
    if (getCombatTicksRemainingByName(event.playerName) > 0) {
      STATE.combatLogPenalty.add(event.playerName);
    }

    clearPlayerState(event.playerName);
  });

  world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn) return;

    const player = event.player;
    sendJoinWelcome(player);

    if (!STATE.combatLogPenalty.has(player.name)) return;

    STATE.combatLogPenalty.delete(player.name);
    player.runCommandAsync("damage @s 9999 void");
    player.sendMessage("\u00a7cCombat logging penalty applied.");
  });

  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      updateCombatState(player);
      applySpeedByBlock(player);
      enforceWorldBorder(player);
    }
  }, CONFIG.checkIntervalTicks);
}
