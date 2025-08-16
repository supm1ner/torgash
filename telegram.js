const TelegramBot = require("node-telegram-bot-api");
const tradesFile = require("fs");
const path = require("path");
const tradesPath = path.join(__dirname, "trades.js");

let mcBot = null;
let savedChatId = null;

function initTelegram(token, botInstance) {
  mcBot = botInstance;
  const tg = new TelegramBot(token, { polling: true });

  function saveTrades(trades) {
    const content = "module.exports = " + JSON.stringify(trades, null, 2) + ";\n";
    tradesFile.writeFileSync(tradesPath, content, "utf8");
  }

  tg.on("message", (msg) => {
    if (!savedChatId) savedChatId = msg.chat.id;
    if (!msg.text.startsWith("/")) {
      if (mcBot) mcBot.chat(`${msg.text}`);
    }
  });

  mcBot.setTelegramNotifier((text) => {
    if (savedChatId) tg.sendMessage(savedChatId, text);
    else console.log("[TGBOT] Нет chat.id для отправки:", text);
  });

  tg.onText(/\/start/, (msg) => {
    const helpText = `Привет! Я MC-трейдер-бот.\n\nДоступные команды:
/inventory - показать инвентарь
/price - показать цены товаров
/follow <ник> - следовать за игроком
/stopfollow - прекратить следование
/report - отчёт о продажах и заработке
/addtrade <input_name> <input_count> <output_name> <output_count> <diamondValue> - добавить новый товар
/deposit <chestName> <item> <count> - положить предмет в сундук
/withdraw <chestName> <item> <count> - забрать предмет из сундука
/radar on [ник1 ник2 ...] - включить радар, опционально указать никнеймы
/radar off - выключить радар
/start - показать это сообщение`;
    tg.sendMessage(msg.chat.id, helpText);
  });

  tg.onText(/\/inventory/, (msg) => {
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    const summary = mcBot.getInventorySummary();
    tg.sendMessage(msg.chat.id, `📦 Инвентарь:\n${summary.inventory}`);
  });

  tg.onText(/\/price/, (msg) => {
    const trades = require("./trades");
    const lines = trades.map(t => `${t.input.count}×${t.input.name} → ${t.output.count}×${t.output.name} (цена: ${t.output.diamondValue} алмазов/шт)`);
    tg.sendMessage(msg.chat.id, `💰 Товары и цены:\n${lines.join("\n")}`);
  });

  tg.onText(/\/follow (.+)/, (msg, match) => {
    const username = match[1].trim();
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    mcBot.followPlayer(username);
    tg.sendMessage(msg.chat.id, `Следую за игроком: ${username}`);
  });

  tg.onText(/\/stopfollow/, (msg) => {
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    mcBot.stopFollowing();
    tg.sendMessage(msg.chat.id, "Остановил следование");
  });

  tg.onText(/\/report/, (msg) => {
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    const summary = mcBot.getInventorySummary();
    tg.sendMessage(msg.chat.id,
      `📦 Инвентарь:\n${summary.inventory}\n\n` +
      `💎 Общий заработок: ${summary.totalEarnings} алмазов\n\n` +
      `📝 Продажи:\n${summary.salesHistory}`
    );
  });

  tg.onText(/\/addtrade (\w+) (\d+) (\w+) (\d+) (\d+)/, (msg, match) => {
    const [inputName, inputCount, outputName, outputCount, diamondValue] = match.slice(1);
    const trades = require("./trades");
    trades.push({
      input: { name: inputName, count: parseInt(inputCount) },
      output: { name: outputName, count: parseInt(outputCount), diamondValue: parseInt(diamondValue) }
    });
    saveTrades(trades);
    tg.sendMessage(msg.chat.id, `✅ Новый товар добавлен: ${inputCount}×${inputName} → ${outputCount}×${outputName} (цена: ${diamondValue} алмазов/шт)`);
  });

  tg.onText(/\/deposit (\w+) (\w+) (\d+)/, (msg, match) => {
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    const [chest, item, count] = match.slice(1);
    mcBot.depositToChest(chest, item, parseInt(count));
  });

  tg.onText(/\/withdraw (\w+) (\w+) (\d+)/, (msg, match) => {
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    const [chest, item, count] = match.slice(1);
    mcBot.withdrawFromChest(chest, item, parseInt(count));
  });

  tg.onText(/\/radar (on|off)(.*)/, (msg, match) => {
    if (!mcBot) return tg.sendMessage(msg.chat.id, "MC-бот ещё не готов");
    const action = match[1];
    const targetStr = match[2].trim();
    if (action === "on") {
      const targets = targetStr ? targetStr.split(/\s+/) : [];
      mcBot.setRadar(true, targets);
    } else mcBot.setRadar(false);
  });

  return tg;
}

module.exports = initTelegram;
