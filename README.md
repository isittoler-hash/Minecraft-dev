# Minecraft QoL Server Pack

This repository contains a Bedrock **behavior pack** focused on command-only QoL features (no scripts).

## Implemented systems

- Welcome chat message for players detected by the tick function after pack/world load.
- Speed I on `minecraft:dirt_path`.
- Speed II on `minecraft:bricks`.

## Command-only architecture

All logic is handled with `.mcfunction` files:

- `behavior_pack/functions/load.json` → `qol/load`
- `behavior_pack/functions/tick.json` → `qol/tick`

## Notes

- This pack intentionally avoids Script API usage and JavaScript modules.
- If you want true per-login event handling, that normally requires script/event hooks; this pack uses command function polling.
