# Welcome message (first tick seen after server start/reload)
execute as @a[tag=!qol:welcomed] run tellraw @s {"rawtext":[{"text":"§aWelcome back, "},{"selector":"@s"},{"text":"§a!"}]}
execute as @a[tag=!qol:welcomed] run tag @s add qol:welcomed

# Movement boosts by block type below the player
execute as @a at @s if block ~ ~-1 ~ minecraft:dirt_path run effect @s speed 2 0 true
execute as @a at @s if block ~ ~-1 ~ minecraft:bricks run effect @s speed 2 1 true
