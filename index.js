const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');

// Initialize bot with your Telegram Bot Token
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Command to grab direct media links from a URL
bot.onText(/\/grab (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];

    bot.sendMessage(chatId, `🔍 Grabbing links from: ${url}`);

    try {
        // Get the HTML of the webpage
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);
        let links = [];

        // Search for media links (e.g., .mp4, .mp3, .zip, etc.)
        $('a').each((i, elem) => {
            const link = $(elem).attr('href');
            if (link && (link.includes('.mp4') || link.includes('.mp3') || link.includes('.zip'))) {
                links.push(link);
            }
        });

        // If links found, send them to user
        if (links.length > 0) {
            bot.sendMessage(chatId, `🔗 Found links:\n${links.join('\n')}`);
        } else {
            bot.sendMessage(chatId, `❌ No direct media links found.`);
        }
    } catch (error) {
        bot.sendMessage(chatId, `⚠️ Error: ${error.message}`);
    }
});

// Command to grab streaming links (M3U8 links) using yt-dlp
bot.onText(/\/stream (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];

    bot.sendMessage(chatId, `🔍 Checking stream...`);

    exec(`yt-dlp -g "${url}"`, (error, stdout) => {
        if (error) return bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        bot.sendMessage(chatId, `🎥 Direct stream link: ${stdout.trim()}`);
    });
});
