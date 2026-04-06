import {
  EnchantmentType,
  EquipmentSlot,
  ItemLockMode,
  ItemStack,
  Player,
  world,
} from "@minecraft/server";
import { isInCombat, isPlayerNameInCombat } from "./combat.js";
import { CONFIG } from "./config.js";
import { STATE } from "./state.js";
import { getPlayerKey, nowTick } from "./utils.js";

export const PROXY_ITEM_ID = "qol:combat_elytra_proxy";

const PROXY_VERSION = 1;
const PROXY_VERSION_KEY = "qol:elytra_proxy_version";
const PROXY_PAYLOAD_ID_KEY = "qol:elytra_payload_id";
const PROXY_OWNER_NAME_KEY = "qol:elytra_owner_name";
const PROXY_SNAPSHOT_KEY = "qol:elytra_snapshot";
const PROXY_LEDGER_KEY = "qol:elytra_proxy_ledger";
const PROXY_DISABLED_LORE = "\u00a7cGliding disabled while combat-tagged.";
const DIMENSION_IDS = [
  "minecraft:overworld",
  "minecraft:nether",
  "minecraft:the_end",
];

export function isProxyItem(itemStack) {
  return itemStack?.typeId === PROXY_ITEM_ID;
}

export function getPlayerProxyStatus(player) {
  const equippable = player.getComponent("equippable");
  const inventory = player.getComponent("inventory")?.container;
  const chestItem = equippable?.getEquipment(EquipmentSlot.Chest);

  let carriedProxyCount = isProxyItem(chestItem) ? 1 : 0;
  if (inventory) {
    for (let slot = 0; slot < inventory.size; slot += 1) {
      if (isProxyItem(inventory.getItem(slot))) {
        carriedProxyCount += 1;
      }
    }
  }

  return {
    carriedProxyCount,
    chestItemTypeId: chestItem?.typeId ?? "empty",
    chestHasProxy: isProxyItem(chestItem),
  };
}

export function suppressEquippedElytra(player, options = {}) {
  const equippable = player.getComponent("equippable");
  if (!equippable) return false;

  const chestItem = equippable.getEquipment(EquipmentSlot.Chest);
  if (!chestItem || chestItem.typeId !== "minecraft:elytra") return false;

  const payloadId = createPayloadId(player);
  const snapshot = snapshotItemStack(chestItem);
  const proxyItem = buildProxyFromSnapshot(player, snapshot, payloadId);

  markPayloadState(payloadId, getPlayerKey(player), "active");
  equippable.setEquipment(EquipmentSlot.Chest, proxyItem);

  if (!options.silent) {
    player.sendMessage("\u00a7eElytra locked while combat-tagged.");
  }

  return true;
}

export function reconcileCombatElytra(player, options = {}) {
  if (!options.forceRestore && isInCombat(player)) {
    return suppressEquippedElytra(player, { silent: true });
  }

  let changed = restoreProxyFromChest(player, options);
  changed = restoreProxyFromInventory(player, options) || changed;
  return changed;
}

export function recordPlayerDeath(player) {
  const playerKey = getPlayerKey(player);
  STATE.recentProxyDeathsByName.set(playerKey, {
    dimensionId: player.dimension.id,
    tick: nowTick(),
    location: {
      x: player.location.x,
      y: player.location.y,
      z: player.location.z,
    },
  });

  STATE.combatUntilByName.delete(playerKey);
  STATE.combatOverrideByName.delete(playerKey);
  STATE.lastCombatHudValueByName.delete(playerKey);
}

export function handleSpawnedItemEntity(entity) {
  if (!entity || entity.typeId !== "minecraft:item") return false;

  const itemStack = getEntityItemStack(entity);
  if (!isProxyItem(itemStack)) return false;

  const ownerName = getProxyOwnerName(itemStack);
  const deathMarker = ownerName
    ? STATE.recentProxyDeathsByName.get(ownerName)
    : undefined;
  const shouldConvertNow =
    (Boolean(deathMarker) && isWithinDeathWindow(entity, deathMarker)) ||
    (ownerName ? !isPlayerNameInCombat(ownerName) : true);

  if (!shouldConvertNow) return false;
  return convertProxyItemEntity(entity, itemStack);
}

export function reconcileGroundProxyItems() {
  pruneRecentDeathMarkers();

  let changed = false;
  for (const dimensionId of DIMENSION_IDS) {
    const dimension = world.getDimension(dimensionId);
    const entities = dimension.getEntities({ type: "minecraft:item" });

    for (const entity of entities) {
      const itemStack = getEntityItemStack(entity);
      if (!isProxyItem(itemStack)) continue;

      const ownerName = getProxyOwnerName(itemStack);
      if (ownerName && isPlayerNameInCombat(ownerName)) continue;

      changed = convertProxyItemEntity(entity, itemStack) || changed;
    }
  }

  return changed;
}

function restoreProxyFromChest(player, options) {
  const equippable = player.getComponent("equippable");
  if (!equippable) return false;

  const chestItem = equippable.getEquipment(EquipmentSlot.Chest);
  if (!isProxyItem(chestItem)) return false;

  const restoredItem = buildRealElytraFromProxy(chestItem, player);
  if (!restoredItem) return false;

  equippable.setEquipment(EquipmentSlot.Chest, restoredItem.itemStack);
  markPayloadState(restoredItem.payloadId, restoredItem.ownerName, "restored");
  return true;
}

function restoreProxyFromInventory(player, options) {
  const inventory = player.getComponent("inventory")?.container;
  if (!inventory) return false;

  let changed = false;
  for (let slot = 0; slot < inventory.size; slot += 1) {
    const itemStack = inventory.getItem(slot);
    if (!isProxyItem(itemStack)) continue;

    const restoredItem = buildRealElytraFromProxy(itemStack, player);
    if (!restoredItem) continue;

    inventory.setItem(slot, restoredItem.itemStack);
    markPayloadState(restoredItem.payloadId, restoredItem.ownerName, "restored");
    changed = true;
  }

  return changed;
}

function buildProxyFromSnapshot(player, snapshot, payloadId) {
  const proxyItem = new ItemStack(PROXY_ITEM_ID, 1);

  applySnapshotToItem(proxyItem, snapshot, { includeDisabledLore: true });
  proxyItem.setDynamicProperty(PROXY_VERSION_KEY, PROXY_VERSION);
  proxyItem.setDynamicProperty(PROXY_PAYLOAD_ID_KEY, payloadId);
  proxyItem.setDynamicProperty(PROXY_OWNER_NAME_KEY, getPlayerKey(player));
  proxyItem.setDynamicProperty(PROXY_SNAPSHOT_KEY, JSON.stringify(snapshot));

  return proxyItem;
}

function buildRealElytraFromProxy(proxyItem, player) {
  const payloadId = getProxyPayloadId(proxyItem);
  const ownerName = getProxyOwnerName(proxyItem) ?? getPlayerKey(player);
  const ledgerState = payloadId ? getPayloadState(payloadId) : undefined;

  if (payloadId && ledgerState && ledgerState !== "active") {
    return undefined;
  }

  const snapshot = getProxySnapshot(proxyItem);
  if (!snapshot) {
    if (payloadId) {
      markPayloadState(payloadId, ownerName, "error");
    }
    player.sendMessage("\u00a7cCombat elytra restore failed: missing snapshot data.");
    return undefined;
  }

  try {
    const realItem = new ItemStack(snapshot.typeId ?? "minecraft:elytra", 1);
    applySnapshotToItem(realItem, snapshot);

    return {
      itemStack: realItem,
      ownerName,
      payloadId,
    };
  } catch (error) {
    if (payloadId) {
      markPayloadState(payloadId, ownerName, "error");
    }
    player.sendMessage("\u00a7cCombat elytra restore failed. Proxy item left in place.");
    return undefined;
  }
}

function convertProxyItemEntity(entity, proxyItem) {
  const payloadId = getProxyPayloadId(proxyItem);
  const ownerName = getProxyOwnerName(proxyItem) ?? "unknown";
  const ledgerState = payloadId ? getPayloadState(payloadId) : undefined;

  if (payloadId && ledgerState && ledgerState !== "active") return false;

  const snapshot = getProxySnapshot(proxyItem);
  if (!snapshot) {
    if (payloadId) {
      markPayloadState(payloadId, ownerName, "error");
    }
    return false;
  }

  try {
    const realItem = new ItemStack(snapshot.typeId ?? "minecraft:elytra", 1);
    applySnapshotToItem(realItem, snapshot);
    entity.dimension.spawnItem(realItem, entity.location);
    entity.remove();

    if (payloadId) {
      markPayloadState(payloadId, ownerName, "restored");
    }

    return true;
  } catch (error) {
    if (payloadId) {
      markPayloadState(payloadId, ownerName, "error");
    }
    return false;
  }
}

function snapshotItemStack(itemStack) {
  const durability = itemStack.getComponent("minecraft:durability");
  const enchantable = itemStack.getComponent("minecraft:enchantable");

  return {
    typeId: itemStack.typeId,
    nameTag: itemStack.nameTag ?? null,
    lore: safeArray(itemStack.getLore?.()),
    keepOnDeath: itemStack.keepOnDeath === true,
    lockMode: itemStack.lockMode ?? ItemLockMode.none,
    canDestroy: safeArray(getOptionalArray(() => itemStack.getCanDestroy())),
    canPlaceOn: safeArray(getOptionalArray(() => itemStack.getCanPlaceOn())),
    damage: typeof durability?.damage === "number" ? durability.damage : 0,
    enchantments: serializeEnchantments(enchantable),
    dynamicProperties: serializeDynamicProperties(itemStack),
  };
}

function applySnapshotToItem(itemStack, snapshot, options = {}) {
  itemStack.keepOnDeath = snapshot.keepOnDeath === true;
  itemStack.lockMode = snapshot.lockMode ?? ItemLockMode.none;
  itemStack.nameTag = snapshot.nameTag ?? undefined;

  const lore = safeArray(snapshot.lore);
  if (options.includeDisabledLore) {
    lore.unshift(PROXY_DISABLED_LORE);
  }
  itemStack.setLore(lore);

  setItemTargets(itemStack, "setCanDestroy", snapshot.canDestroy);
  setItemTargets(itemStack, "setCanPlaceOn", snapshot.canPlaceOn);
  applyDurability(itemStack, snapshot.damage);
  applyDynamicProperties(itemStack, snapshot.dynamicProperties);
  applyEnchantments(itemStack, snapshot.enchantments);
}

function applyDurability(itemStack, damage) {
  const durability = itemStack.getComponent("minecraft:durability");
  if (!durability || typeof damage !== "number") return;

  durability.damage = damage;
}

function applyEnchantments(itemStack, enchantments) {
  const enchantable = itemStack.getComponent("minecraft:enchantable");
  if (!enchantable) return;

  if (typeof enchantable.removeAllEnchantments === "function") {
    enchantable.removeAllEnchantments();
  }

  const normalizedEnchantments = [];
  for (const enchantment of safeArray(enchantments)) {
    if (!enchantment?.typeId || typeof enchantment.level !== "number") continue;

    const normalized = {
      type: new EnchantmentType(enchantment.typeId),
      level: enchantment.level,
    };

    if (
      typeof enchantable.canAddEnchantment === "function" &&
      !enchantable.canAddEnchantment(normalized)
    ) {
      throw new Error(`Cannot restore enchantment ${enchantment.typeId}`);
    }

    normalizedEnchantments.push(normalized);
  }

  if (normalizedEnchantments.length > 0) {
    enchantable.addEnchantments(normalizedEnchantments);
  }
}

function serializeEnchantments(enchantable) {
  if (!enchantable || typeof enchantable.getEnchantments !== "function") {
    return [];
  }

  return enchantable.getEnchantments().map((enchantment) => ({
    typeId: enchantment.type.id,
    level: enchantment.level,
  }));
}

function serializeDynamicProperties(itemStack) {
  const dynamicProperties = [];

  for (const propertyId of itemStack.getDynamicPropertyIds()) {
    if (
      propertyId === PROXY_VERSION_KEY ||
      propertyId === PROXY_PAYLOAD_ID_KEY ||
      propertyId === PROXY_OWNER_NAME_KEY ||
      propertyId === PROXY_SNAPSHOT_KEY
    ) {
      continue;
    }

    const value = itemStack.getDynamicProperty(propertyId);
    if (value === undefined) continue;

    dynamicProperties.push({
      id: propertyId,
      value,
    });
  }

  return dynamicProperties;
}

function applyDynamicProperties(itemStack, dynamicProperties) {
  for (const property of safeArray(dynamicProperties)) {
    if (!property?.id) continue;
    itemStack.setDynamicProperty(property.id, property.value);
  }
}

function setItemTargets(itemStack, methodName, targets) {
  const values = safeArray(targets);

  try {
    itemStack[methodName](values);
  } catch (error) {
    if (values.length > 0) {
      throw error;
    }
  }
}

function getProxyPayloadId(itemStack) {
  const payloadId = itemStack.getDynamicProperty(PROXY_PAYLOAD_ID_KEY);
  return typeof payloadId === "string" ? payloadId : undefined;
}

function getProxyOwnerName(itemStack) {
  const ownerName = itemStack.getDynamicProperty(PROXY_OWNER_NAME_KEY);
  return typeof ownerName === "string" ? ownerName : undefined;
}

function getProxySnapshot(itemStack) {
  const rawSnapshot = itemStack.getDynamicProperty(PROXY_SNAPSHOT_KEY);
  if (typeof rawSnapshot !== "string" || rawSnapshot.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(rawSnapshot);
  } catch (error) {
    return undefined;
  }
}

function createPayloadId(player) {
  return `${getPlayerKey(player)}:${nowTick()}:${Math.random().toString(36).slice(2, 10)}`;
}

function getPayloadState(payloadId) {
  const ledger = loadLedger();
  return ledger[payloadId]?.state;
}

function markPayloadState(payloadId, ownerName, state) {
  if (!payloadId) return;

  const ledger = loadLedger();
  ledger[payloadId] = {
    ownerName,
    state,
    updatedAtTick: nowTick(),
  };
  saveLedger(ledger);
}

function loadLedger() {
  const rawLedger = world.getDynamicProperty(PROXY_LEDGER_KEY);
  if (typeof rawLedger !== "string" || rawLedger.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawLedger);
  } catch (error) {
    return {};
  }
}

function saveLedger(ledger) {
  const cutoff = nowTick() - CONFIG.proxyLedgerTombstoneTicks;

  for (const [payloadId, entry] of Object.entries(ledger)) {
    if (!entry) {
      delete ledger[payloadId];
      continue;
    }

    if (entry.state === "active") continue;
    if (typeof entry.updatedAtTick === "number" && entry.updatedAtTick >= cutoff) {
      continue;
    }

    delete ledger[payloadId];
  }

  if (Object.keys(ledger).length === 0) {
    world.setDynamicProperty(PROXY_LEDGER_KEY, "{}");
    return;
  }

  world.setDynamicProperty(PROXY_LEDGER_KEY, JSON.stringify(ledger));
}

function pruneRecentDeathMarkers() {
  const cutoff = nowTick() - CONFIG.proxyDeathMarkerWindowTicks;

  for (const [playerName, marker] of STATE.recentProxyDeathsByName.entries()) {
    if (marker.tick >= cutoff) continue;
    STATE.recentProxyDeathsByName.delete(playerName);
  }
}

function isWithinDeathWindow(entity, deathMarker) {
  if (!deathMarker || deathMarker.dimensionId !== entity.dimension.id) {
    return false;
  }

  const dx = entity.location.x - deathMarker.location.x;
  const dy = entity.location.y - deathMarker.location.y;
  const dz = entity.location.z - deathMarker.location.z;
  return dx * dx + dy * dy + dz * dz <= 64;
}

function getEntityItemStack(entity) {
  try {
    return entity.getComponent("minecraft:item")?.itemStack;
  } catch (error) {
    return undefined;
  }
}

function getOptionalArray(factory) {
  try {
    return factory();
  } catch (error) {
    return [];
  }
}

function safeArray(value) {
  return Array.isArray(value) ? [...value] : [];
}
