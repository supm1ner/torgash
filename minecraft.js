const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals: { GoalFollow } } = require("mineflayer-pathfinder");
const trades = require("./trades");

function createMCBot(config) {
  const bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  let mcData = null;
  let defaultMovements = null;
  let followTargetName = null;
  let invCounts = {};
  let tgNotify = null;
  let totalEarnings = 0;
  let salesHistory = [];
  let radarActive = false;
  let radarTargets = new Set();

  function log(...args) { console.log("[MCBOT]", ...args); }

  function snapshotCounts() {
    const counts = {};
    for (const it of bot.inventory.items()) {
      counts[it.name] = (counts[it.name] || 0) + it.count;
    }
    return counts;
  }
// autoMessage.js
function autoMessage(bot, message = "/reg zxcebloQ12345678 zxcebloQ12345678") {
  bot.once("spawn", () => {
    // Немного подождём, чтобы сервер успел прогрузить игрока
    setTimeout(() => {
      bot.chat(message)
    }, 2000)
  })
}
module.exports = autoMessage

  function nearestPlayerEntity(maxDistance = 6) {
    let chosen = null;
    let min = Infinity;
    for (const [name, data] of Object.entries(bot.players)) {
      if (!data || !data.entity || name === bot.username) continue;
      const d = bot.entity.position.distanceTo(data.entity.position);
      if (d < min) { min = d; chosen = data.entity; }
    }
    if (!chosen || min > maxDistance) return null;
    return chosen;
  }

  async function tossOutputTo(entity, out) {
    const itemDef = mcData.itemsByName[out.name];
    if (!itemDef) { bot.chat(`Не знаю предмет ${out.name}`); return false; }
    const have = bot.inventory.count(itemDef.id, null);
    if (have < out.count) { bot.chat("Нет товара для обмена"); return false; }
    try {
      await bot.lookAt(entity.position.offset(0, entity.height, 0));
      await bot.toss(itemDef.id, null, out.count);

      const diamondPrice = out.diamondValue || 1;
      const saleValue = diamondPrice * out.count;
      totalEarnings += saleValue;
      salesHistory.push({
        item: out.name,
        count: out.count,
        player: entity.username,
        value: saleValue
      });

      if (tgNotify) {
        tgNotify(
          `✅ Продажа: ${out.name} ×${out.count} → ${entity.username}\n` +
          `💰 Заработок за эту продажу: ${saleValue} алмазов\n` +
          `📦 Остаток: ${bot.inventory.count(itemDef.id, null)} шт.\n` +
          `💎 Общий заработок: ${totalEarnings} алмазов`
        );
      }

      return true;
    } catch (e) {
      log("Ошибка выдачи:", e?.message || e);
      bot.chat("Ошибка выдачи");
      return false;
    }
  }

  function processTradeDeltas(deltas) {
    for (const rule of trades) {
      const got = deltas[rule.input.name] || 0;
      if (got >= rule.input.count) {
        const times = Math.floor(got / rule.input.count);
        const target = nearestPlayerEntity(8);
        if (!target) { bot.chat("Не вижу покупателя рядом"); continue; }
        (async () => {
          for (let i = 0; i < times; i++) {
            const ok = await tossOutputTo(target, rule.output);
            if (!ok) break;
          }
        })();
      }
    }
  }

  bot.once("spawn", () => {
    mcData = require("minecraft-data")(bot.version);
    defaultMovements = new Movements(bot, mcData);
    invCounts = snapshotCounts();
    log("Зашёл на сервер. Версия:", bot.version);
    bot.chat("/reg zxcebloQ12345678 zxcebloQ12345678")
    bot.chat("/login zxcebloQ12345678")
  });

  bot.followPlayer = (username) => {
    followTargetName = username;
    const player = bot.players[username]?.entity;
    if (!player) { bot.chat("Не вижу игрока для следования"); return; }
    bot.pathfinder.setMovements(defaultMovements);
    bot.pathfinder.setGoal(new GoalFollow(player, 1), true);
  };

  bot.stopFollowing = () => {
    followTargetName = null;
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
  };

  bot.on("physicTick", () => {
    if (followTargetName) {
      const ent = bot.players[followTargetName]?.entity;
      if (ent) bot.pathfinder.setGoal(new GoalFollow(ent, 1), true);
    }

    if (radarActive && tgNotify) {
      for (const [name, data] of Object.entries(bot.players)) {
        if (!data?.entity || name === bot.username) continue;
        if (radarTargets.size && !radarTargets.has(name)) continue;
        const dist = bot.entity.position.distanceTo(data.entity.position);
        if (dist < 10) tgNotify(`⚠ Игрок рядом: ${name}, дистанция: ${dist.toFixed(1)}`);
      }
    }
  });

  bot.on("playerCollect", (collector) => {
    if (collector !== bot.entity) return;
    setTimeout(() => {
      const now = snapshotCounts();
      const deltas = {};
      const names = new Set([...Object.keys(now), ...Object.keys(invCounts)]);
      for (const n of names) deltas[n] = (now[n] || 0) - (invCounts[n] || 0);
      processTradeDeltas(deltas);
      invCounts = now;
    }, 250);
  });

  bot.getInventorySummary = () => {
    const lines = [];
    const counts = snapshotCounts();
    Object.keys(counts).sort().forEach(n => lines.push(`${n}: ${counts[n]}`));
    let salesText = salesHistory.map(s => `${s.item}×${s.count} → ${s.player} (${s.value} алмазов)`).join("\n") || "(пока нет продаж)";
    return {
      inventory: lines.join("\n") || "(пусто)",
      totalEarnings,
      salesHistory: salesText
    };
  };

  bot.setTelegramNotifier = (fn) => { tgNotify = fn; };

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    if (tgNotify) tgNotify(`${username}: ${message}`);
  });

  // --- Сундуки ---
  bot.depositToChest = async (chestBlockName, itemName, count) => {
    const chest = bot.findBlock({ matching: mcData.blocksByName[chestBlockName]?.id, maxDistance: 6 });
    if (!chest) return tgNotify?.(`Не найден сундук ${chestBlockName}`);
    await bot.openChest(chest).then(async (chestObj) => {
      await bot.transferToChest(chestObj, mcData.itemsByName[itemName].id, null, count);
      chestObj.close();
      tgNotify?.(`✅ Положил ${count}×${itemName} в сундук ${chestBlockName}`);
    }).catch(e => tgNotify?.(`Ошибка сундука: ${e.message}`));
  };

  bot.withdrawFromChest = async (chestBlockName, itemName, count) => {
    const chest = bot.findBlock({ matching: mcData.blocksByName[chestBlockName]?.id, maxDistance: 6 });
    if (!chest) return tgNotify?.(`Не найден сундук ${chestBlockName}`);
    await bot.openChest(chest).then(async (chestObj) => {
      await bot.withdraw(chestObj, mcData.itemsByName[itemName].id, null, count);
      chestObj.close();
      tgNotify?.(`✅ Забрал ${count}×${itemName} из сундука ${chestBlockName}`);
    }).catch(e => tgNotify?.(`Ошибка сундука: ${e.message}`));
  };

  // --- Радар ---
  bot.setRadar = (active, targets = []) => {
    radarActive = active;
    radarTargets = new Set(targets);
    tgNotify?.(`Радар ${active ? "включен" : "выключен"} для ${targets.length ? targets.join(", ") : "всех игроков"}`);
  };

  bot.on("kicked", (r) => log("KICKED:", r));
  bot.on("error", (e) => log("ERROR:", e?.message || e));

  return bot;
}

module.exports = createMCBot;
