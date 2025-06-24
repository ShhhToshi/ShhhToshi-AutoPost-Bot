require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const SOURCE_CHANNEL = '@ShhhToshi';
const DESTINATION_GROUP = '@ShhhToshiHub';
const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(id => parseInt(id));

let keywordMap = {};
let lastReloadTime = null;

const loadKeywords = () => {
  try {
    keywordMap = JSON.parse(fs.readFileSync('./keywords.json'));
    lastReloadTime = new Date().toLocaleString();
    console.log("✅ keywords.json reloaded");
  } catch (e) {
    console.error("❌ Failed to reload keywords.json:", e);
  }
};
loadKeywords();

const saveKeywords = () => {
  try {
    fs.writeFileSync('./keywords.json', JSON.stringify(keywordMap, null, 2));
    console.log("✅ keywords.json updated");
  } catch (e) {
    console.error("❌ Failed to write keywords.json:", e);
  }
};

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
bot.setWebHook(`${BASE_URL}/bot${BOT_TOKEN}`);

// === In-memory Stores ===
const verifiedUsers = new Set();
const bannedUsers = new Set();
const pendingActions = {}; // track ongoing admin actions

// === Keyboards ===
const adminKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📊 Stats' }, { text: '📚 Manage Keywords' }],
      [{ text: '📢 Broadcast Test' }, { text: 'ℹ️ Help' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true
  }
};

const keywordMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '➕ Add Keyword' }, { text: '➖ Remove Keyword' }],
      [{ text: '🔙 Back to Menu' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true
  }
};

// === Webhook ===
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('✅ Bot is running.');
});

// === /start Verification ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (msg.chat.type !== 'private') return;

  if (ADMIN_IDS.includes(userId)) {
    verifiedUsers.add(userId);
    delete pendingActions[userId];
    return bot.sendMessage(chatId, "👋 Welcome Admin!", adminKeyboard);
  }

  if (verifiedUsers.has(userId)) {
    return bot.sendMessage(chatId, "✅ You are already verified.");
  }

  const question = "🤖 Verification: Which of these is a fruit?";
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🍎 Apple", callback_data: "captcha_correct" }, { text: "🚗 Car", callback_data: "captcha_wrong" }, { text: "🧱 Brick", callback_data: "captcha_wrong" }]
      ]
    }
  };
  bot.sendMessage(chatId, question, options);
});

bot.on('callback_query', (query) => {
  const msg = query.message;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'captcha_correct') {
    verifiedUsers.add(userId);
    bot.answerCallbackQuery(query.id, { text: '✅ Verified!' });
    bot.sendMessage(msg.chat.id, "🎉 You're verified!");
  } else {
    bot.answerCallbackQuery(query.id, { text: '❌ Wrong. Try again!' });
    bot.sendMessage(msg.chat.id, "⚠️ Wrong answer. Use /start to retry.");
  }
});

// === Channel Post Forwarder ===
bot.on('channel_post', (msg) => {
  const text = msg.text || msg.caption || '';
  const lower = text.toLowerCase();

  for (const [topicName, topic] of Object.entries(keywordMap)) {
    for (const keyword of topic.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        bot.copyMessage(
          DESTINATION_GROUP,
          msg.chat.id,
          msg.message_id,
          { message_thread_id: topic.thread_id }
        ).catch(err => {
          ADMIN_IDS.forEach(adminId =>
            bot.sendMessage(adminId, `❌ Failed to forward to #${topicName}: ${err.message}`)
          );
        });
        break;
      }
    }
  }
});

// === Admin and Public Commands ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  if (bannedUsers.has(userId)) return bot.sendMessage(chatId, "🚫 You are banned.");

  if (!ADMIN_IDS.includes(userId)) {
    if (!verifiedUsers.has(userId) && msg.chat.type === 'private') {
      return bot.sendMessage(chatId, "⚠️ Please complete CAPTCHA using /start.");
    }
    return;
  }

  const action = pendingActions[userId];

  // === Handle Keyword Add/Remove Step ===
  if (action && action.step === 'choose_topic') {
    if (!keywordMap[text]) return bot.sendMessage(chatId, "❌ Topic not found.");
    action.topic = text;
    action.step = 'keyword_input';
    return bot.sendMessage(chatId, `✏️ Enter keyword to ${action.type}:`);
  }

  if (action && action.step === 'keyword_input') {
    const keyword = text.trim();
    const topic = action.topic;
    if (!keyword) return bot.sendMessage(chatId, "❌ Invalid keyword.");

    if (action.type === 'add') {
      keywordMap[topic].keywords.push(keyword);
      bot.sendMessage(chatId, `✅ Added keyword "${keyword}" to "${topic}"`);
    } else {
      keywordMap[topic].keywords = keywordMap[topic].keywords.filter(k => k !== keyword);
      bot.sendMessage(chatId, `✅ Removed keyword "${keyword}" from "${topic}"`);
    }

    saveKeywords();
    loadKeywords();
    delete pendingActions[userId];
    return bot.sendMessage(chatId, "🔙 Returning to menu.", adminKeyboard);
  }

  // === Keyword Menu Navigation ===
  if (text === '📚 Manage Keywords') {
    delete pendingActions[userId];
    return bot.sendMessage(chatId, "Choose an action:", keywordMenu);
  }

  if (text === '➕ Add Keyword') {
    const topicList = Object.keys(keywordMap).join(', ');
    pendingActions[userId] = { type: 'add', step: 'choose_topic' };
    return bot.sendMessage(chatId, `🔸 Enter topic name to add keyword:\n(Available: ${topicList})`);
  }

  if (text === '➖ Remove Keyword') {
    const topicList = Object.keys(keywordMap).join(', ');
    pendingActions[userId] = { type: 'remove', step: 'choose_topic' };
    return bot.sendMessage(chatId, `🔸 Enter topic name to remove keyword:\n(Available: ${topicList})`);
  }

  if (text === '🔙 Back to Menu') {
    delete pendingActions[userId];
    return bot.sendMessage(chatId, "🔙 Returned to main menu.", adminKeyboard);
  }

  // === Admin Utilities ===
  if (text === '📊 Stats') {
    const topicCount = Object.keys(keywordMap).length;
    const keywordCount = Object.values(keywordMap).reduce((acc, val) => acc + val.keywords.length, 0);
    return bot.sendMessage(chatId,
      `📈 Bot Stats:\n• Topics: ${topicCount}\n• Keywords: ${keywordCount}\n• Last Reload: ${lastReloadTime}`, adminKeyboard);
  }

  if (text === 'ℹ️ Help') {
    return bot.sendMessage(chatId,
      'ℹ️ Admin Commands:\n' +
      '• 📚 Manage Keywords\n' +
      '• 📊 Stats\n' +
      '• 📢 Broadcast Test\n' +
      '• /reload, /ban <id>, /unban <id>, /verified', adminKeyboard);
  }

  if (text === '/reload') {
    loadKeywords();
    return bot.sendMessage(chatId, "♻️ Reloaded keywords.json", adminKeyboard);
  }

  if (text.startsWith('/ban ')) {
    const id = parseInt(text.split(' ')[1]);
    bannedUsers.add(id);
    return bot.sendMessage(chatId, `✅ Banned user ${id}`);
  }

  if (text.startsWith('/unban ')) {
    const id = parseInt(text.split(' ')[1]);
    bannedUsers.delete(id);
    return bot.sendMessage(chatId, `✅ Unbanned user ${id}`);
  }

  if (text === '/verified') {
    return bot.sendMessage(chatId, `👥 Verified:\n${[...verifiedUsers].join('\n') || 'None'}`);
  }

  if (text === '📢 Broadcast Test') {
    const topic = keywordMap['gift'];
    if (!topic) return bot.sendMessage(chatId, "❌ 'gift' topic not found.");
    bot.sendMessage(DESTINATION_GROUP, "🎁 Test message to gift thread", {
      message_thread_id: topic.thread_id
    }).then(() => {
      bot.sendMessage(chatId, "✅ Test broadcasted.");
    }).catch(err => {
      bot.sendMessage(chatId, `❌ Failed: ${err.message}`);
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
