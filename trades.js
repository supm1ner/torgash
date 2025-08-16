/**
 * Список торгов.
 * name — это minecraft id предмета (например, "diamond", "netherite_chestplate").
 * count — количество предметов.
 */
// Торговые правила
module.exports = [
  {
    input: { name: "diamond", count: 64 },
    output: { name: "netherite_chestplate", count: 1, diamondValue: 32 }
  },
  {
    input: { name: "emerald", count: 32 },
    output: { name: "diamond_sword", count: 1, diamondValue: 16 }
  },
  {
    input: { name: "diamond", count: 1 },
    output: { name: "fern", count: 2, diamondValue: 1 }
  }
];
