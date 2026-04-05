import { CONFIG, TICKS_PER_SECOND } from "./config.js";

const FOOT_BLOCK_Y_OFFSET = -0.1;
const FOOTPRINT_SAMPLE_OFFSETS = [
  [0, 0],
  [0.29, 0.29],
  [0.29, -0.29],
  [-0.29, 0.29],
  [-0.29, -0.29],
];

const SPEED_EFFECT_AMPLIFIER_BY_BLOCK = new Map([
  ["minecraft:grass_path", 0],
  ["minecraft:dirt_path", 0],
  ["minecraft:path", 0],
  ["minecraft:bricks", 1],
]);

function getBlockIdAtPlayerOffset(player, xOffset, yOffset, zOffset) {
  const block = player.dimension.getBlock({
    x: Math.floor(player.location.x + xOffset),
    y: Math.floor(player.location.y + yOffset),
    z: Math.floor(player.location.z + zOffset),
  });

  return block?.typeId;
}

function getSpeedAmplifierForFooting(player) {
  let highestAmplifier;

  // Sample the center and corners of the player's footprint so partial overlap still counts.
  for (const [xOffset, zOffset] of FOOTPRINT_SAMPLE_OFFSETS) {
    const blockId = getBlockIdAtPlayerOffset(
      player,
      xOffset,
      FOOT_BLOCK_Y_OFFSET,
      zOffset,
    );
    const amplifier =
      blockId === undefined
        ? undefined
        : SPEED_EFFECT_AMPLIFIER_BY_BLOCK.get(blockId);

    if (typeof amplifier !== "number") continue;
    if (highestAmplifier === undefined || amplifier > highestAmplifier) {
      highestAmplifier = amplifier;
    }
  }

  return highestAmplifier;
}

export function applySpeedByBlock(player) {
  const amplifier = getSpeedAmplifierForFooting(player);
  if (typeof amplifier !== "number") return;

  player.addEffect("speed", CONFIG.speedEffectSeconds * TICKS_PER_SECOND, {
    amplifier,
    showParticles: false,
  });
}
