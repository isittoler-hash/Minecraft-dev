export const TICKS_PER_SECOND = 20;
export const BORDER_WARNING_COOLDOWN_TICKS = 100;
export const BORDER_TELEPORT_PADDING = 0.5;
export const BORDER_KNOCKBACK_HORIZONTAL = 0.8;
export const BORDER_KNOCKBACK_VERTICAL = 0.1;

export const CONFIG = {
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
  joinBroadcastMessage: "\u00a7a{player} joined the server. Welcome!",
  joinTitleEnabled: true,
  joinTitle: "\u00a76Welcome",
  joinSubtitle: "\u00a7eHave fun and play fair!",
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
  combatHudMessage: "\u00a7c\u2694 In combat: \u00a7e{seconds}s",
  combatHudFinalSeconds: 5,
};
