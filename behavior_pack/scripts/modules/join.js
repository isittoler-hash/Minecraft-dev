import { world } from "@minecraft/server";
import { CONFIG } from "./config.js";

export function sendJoinWelcome(player) {
  if (CONFIG.joinBroadcastEnabled) {
    const message = CONFIG.joinBroadcastMessage.replace("{player}", player.name);
    world.sendMessage(message);
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
