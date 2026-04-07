import {
  BORDER_TELEPORT_PADDING,
  BORDER_WARNING_COOLDOWN_TICKS,
  CONFIG,
} from "./config.js";
import { STATE } from "./state.js";
import { getPlayerKey, nowTick } from "./utils.js";

const BORDER_SAFE_PADDING_CANDIDATES = [
  BORDER_TELEPORT_PADDING,
  1.5,
  3.5,
  7.5,
  15.5,
];

const BORDER_SAFE_Y_OFFSETS = [0, 1, 2, 3, -1, 4, -2];

function getBorderRadiusForDimension(dimensionId) {
  const perDimensionRadius =
    CONFIG.worldBorderRadiusByDimension?.[dimensionId];

  if (typeof perDimensionRadius === "number" && perDimensionRadius > 0) {
    return perDimensionRadius;
  }

  return CONFIG.worldBorderRadius;
}

function clampToBorder(value, radius, padding = BORDER_TELEPORT_PADDING) {
  if (value > radius) return radius - padding;
  if (value < -radius) return -radius + padding;
  return value;
}

function createCorrectionCandidates(location, radius) {
  const seen = new Set();
  const candidates = [];

  for (const padding of BORDER_SAFE_PADDING_CANDIDATES) {
    const clampedLocation = {
      x: clampToBorder(location.x, radius, padding),
      y: location.y,
      z: clampToBorder(location.z, radius, padding),
    };

    for (const yOffset of BORDER_SAFE_Y_OFFSETS) {
      const candidate = {
        x: clampedLocation.x,
        y: clampedLocation.y + yOffset,
        z: clampedLocation.z,
      };
      const candidateKey = `${candidate.x}|${candidate.y}|${candidate.z}`;

      if (seen.has(candidateKey)) continue;

      seen.add(candidateKey);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function tryCorrectPlayerPosition(player, radius) {
  for (const candidate of createCorrectionCandidates(player.location, radius)) {
    if (
      player.tryTeleport(candidate, {
        checkForBlocks: true,
        dimension: player.dimension,
        keepVelocity: false,
      })
    ) {
      return candidate;
    }
  }

  return undefined;
}

export function enforceWorldBorder(player) {
  const { x, z } = player.location;
  const radius = getBorderRadiusForDimension(player.dimension.id);

  if (Math.abs(x) <= radius && Math.abs(z) <= radius) {
    return;
  }

  const playerKey = getPlayerKey(player);
  const cooldownUntil = STATE.borderWarnCooldownByName.get(playerKey) ?? 0;
  const correctedLocation = tryCorrectPlayerPosition(player, radius);

  if (correctedLocation) {
    if (cooldownUntil <= nowTick()) {
      player.sendMessage("\u00a7cYou reached the world border.");
      STATE.borderWarnCooldownByName.set(
        playerKey,
        nowTick() + BORDER_WARNING_COOLDOWN_TICKS,
      );
    }

    return;
  }

  if (cooldownUntil <= nowTick()) {
    player.sendMessage(
      "\u00a7cWorld border reached, but no safe spot was available yet. Move back inside.",
    );
    STATE.borderWarnCooldownByName.set(
      playerKey,
      nowTick() + BORDER_WARNING_COOLDOWN_TICKS,
    );
  }
}
