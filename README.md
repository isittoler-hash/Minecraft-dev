# Minecraft QoL Server Pack

This repository is now scaffolded for a server-focused Bedrock addon pair:

- `behavior_pack`: game logic modules.
- `resource_pack`: optional textures/UI resources.

## Implemented in this first scaffold

- Speed I on `minecraft:dirt_path`.
- Speed II on `minecraft:bricks`.
- Configurable square world border with per-dimension settings and pushback.
- Anti combat log tag window (15s) with reconnect penalty.
- Combat elytra disable (elytra unequips while combat-tagged).
- Region-based safezone exceptions for combat systems (spawn support by default).
- Combat HUD actionbar countdown while tagged (with final-seconds color warning).

## Main config

Edit `behavior_pack/scripts/main.js`:

- `worldBorderRadius` (fallback radius)
- `worldBorderRadiusByDimension`
- `combatTagSeconds`
- `checkIntervalTicks`
- `joinBroadcastEnabled`
- `joinBroadcastMessage` (`{player}` placeholder supported)
- `joinTitleEnabled`
- `joinTitle`
- `joinSubtitle`
- `safeZones` (AABB regions by dimension for spawn/safezone exceptions)
- `safeZoneMessageCooldownTicks`
- `combatHudEnabled`
- `combatHudMessage` (`{seconds}` placeholder supported)
- `combatHudFinalSeconds`

