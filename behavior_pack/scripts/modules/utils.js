import { system } from "@minecraft/server";

export function nowTick() {
  return system.currentTick;
}

export function getPlayerKey(playerOrName) {
  return typeof playerOrName === "string" ? playerOrName : playerOrName.name;
}
