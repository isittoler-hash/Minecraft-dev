# Minecraft QoL Server Pack

This repository is now scaffolded for a server-focused Bedrock addon pair:

- `behavior_pack`: game logic modules.
- `resource_pack`: optional textures/UI resources.

## Implemented in this first scaffold

- Speed I on `minecraft:dirt_path`.
- Speed II on `minecraft:bricks`.
- Configurable square world border with pushback.
- Anti combat log tag window (15s) with reconnect penalty.
- Combat elytra disable (elytra unequips while combat-tagged).

## Main config

Edit `behavior_pack/scripts/main.js`:

- `worldBorderRadius`
- `combatTagSeconds`
- `checkIntervalTicks`

## Next suggested modules

- Per-world/per-dimension border settings.
- Visual HUD cues for combat tag timer.
- Region exceptions (spawn/safezones).
- Datadriven config via scoreboards or properties.
