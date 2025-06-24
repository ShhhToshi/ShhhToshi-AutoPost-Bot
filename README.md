# ShhhToshi Auto Post Bot

An open-source Telegram bot that automatically forwards messages to categorized threads based on keywords. Originally developed for the ShhhToshi community.

![Maintained](https://img.shields.io/badge/maintained-yes-brightgreen)
![License](https://img.shields.io/github/license/Zeeyan05/shhhtoshi-auto-post-bot)
[![Made by @ExoticCo_BDM](https://img.shields.io/badge/Made%20by-@ExoticCo__BDM-blue?style=flat-square)](https://t.me/ExoticCo_BDM)


## 🔧 Features

- Automatically forwards messages based on keyword mapping
- Add/remove keyword topics through admin panel
- Real-time keyword reload without restart
- Ban/unban user functionality
- Fallback alerts if forwarding fails

## 🚀 Getting Started

### Clone & Install
```bash
git clone https://github.com/Zeeyan05/shhhtoshi-auto-post-bot.git
cd shhhtoshi-auto-post-bot
npm install
```

### Configure Environment
Rename `.env.example` to `.env` and fill in your bot details:

```env
BOT_TOKEN=your_telegram_bot_token
BASE_URL=https://your-deployment-url.com
ADMIN_IDS=123456789,987654321
```

### Run the Bot
```bash
node index.js
```

## 📜 License

This project is licensed under the MIT License.
---

> 💼 Built & maintained by [@ExoticCo_BDM](https://t.me/ExoticCo_BDM)

