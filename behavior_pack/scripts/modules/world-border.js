import {
  BORDER_KNOCKBACK_HORIZONTAL,
  BORDER_KNOCKBACK_VERTICAL,
  BORDER_TELEPORT_PADDING,
  BORDER_WARNING_COOLDOWN_TICKS,
  CONFIG,
} from "./config.js";
import { STATE } from "./state.js";
import { getPlayerKey, nowTick } from "./utils.js";

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

export function enforceWorldBorder(player) {
  const { x, y, z } = player.location;
  const radius = getBorderRadiusForDimension(player.dimension.id);

  if (Math.abs(x) <= radius && Math.abs(z) <= radius) {
    return;
  }

  const clampedLocation = {
    x: clampToBorder(x, radius),
    y,
    z: clampToBorder(z, radius),
  };

  player.teleport(clampedLocation, { dimension: player.dimension });
  player.applyKnockback(
    0,
    0,
    BORDER_KNOCKBACK_HORIZONTAL,
    BORDER_KNOCKBACK_VERTICAL,
  );

  const playerKey = getPlayerKey(player);
  const cooldownUntil = STATE.borderWarnCooldownByName.get(playerKey) ?? 0;
  if (cooldownUntil <= nowTick()) {
    player.sendMessage("\u00a7cYou reached the world border.");
    STATE.borderWarnCooldownByName.set(
      playerKey,
      nowTick() + BORDER_WARNING_COOLDOWN_TICKS,
    );
  }
}
