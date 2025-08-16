const config = require("./config");
const createMCBot = require("./minecraft");
const initTelegram = require("./telegram");

const mcBot = createMCBot(config.mc);
initTelegram(config.telegram.token, mcBot);
