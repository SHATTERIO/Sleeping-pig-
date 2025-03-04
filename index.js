const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');

// API Keys and Configuration
const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_TOKEN'; // Replace with your Telegram bot token
const BASE_URL_ANIMEPAHE = 'https://animepahe.ru';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// In-memory cache and user selections
let indexCache = null;
let indexCacheTimestamp = 0;
const CACHE_DURATION = 3600000; // 1 hour
let userSelections = {};

// Handle /start command with main menu
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const keyboardOptions = [
    [{ text: '📇 AnimePahe Index', callback_data: 'animepahe_index' }],
    // Add other menu options as needed
  ];
  bot.sendMessage(chatId, 'Choose an option:', {
    reply_markup: { inline_keyboard: keyboardOptions },
  });
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  try {
    // Show A-Z letter selection
    if (data === 'animepahe_index') {
      if (!indexCache || Date.now() - indexCacheTimestamp > CACHE_DURATION) {
        try {
          indexCache = await scrapeAnimePaheFullIndex();
          indexCacheTimestamp = Date.now();
        } catch (error) {
          console.error('Error loading AnimePahe index:', error);
          bot.sendMessage(chatId, 'Failed to load AnimePahe index. Please try again later.');
          return;
        }
      }
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const keyboard = letters.map(letter => [{ text: letter, callback_data: `index_${letter}` }]);
      bot.sendMessage(chatId, 'Select a letter to browse anime on AnimePahe:', {
        reply_markup: { inline_keyboard: keyboard },
      });
    }

    // Handle letter selection and list anime titles
    else if (data.startsWith('index_')) {
      const letter = data.split('_')[1];
      if (indexCache && indexCache[letter]) {
        const animeList = indexCache[letter];
        const keyboard = animeList.map((anime, index) => [
          { text: anime.title, callback_data: `select_animepahe_${letter}_${index}` }
        ]);
        keyboard.push([{ text: 'Back to Letters', callback_data: 'animepahe_index' }]);
        bot.sendMessage(chatId, `Anime starting with ${letter} on AnimePahe:`, {
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        bot.sendMessage(chatId, 'No anime found or cache expired. Please try again.');
      }
    }

    // Handle anime selection
    else if (data.startsWith('select_animepahe_')) {
      const [_, letter, index] = data.split('_');
      const anime = indexCache[letter][parseInt(index)];
      if (anime) {
        const { title, id } = anime;
        userSelections[userId] = { source: 'AnimePahe', title, animeId: id };
        let message = `<b>📺 ${title}</b>\n` +
                      `<b>Stream on AnimePahe:</b> <a href="${BASE_URL_ANIMEPAHE}/anime/${id}">Watch Now</a>`;
        const keyboard = [[{ text: 'View Episodes', callback_data: `view_episodes_AnimePahe_${title}` }]];
        bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        bot.sendMessage(chatId, 'Selected anime not found.');
      }
    }

    // Handle episode viewing
    else if (data.startsWith('view_episodes_AnimePahe_')) {
      const title = data.split('_').slice(3).join('_');
      if (userSelections[userId] && userSelections[userId].title === title) {
        const animeId = userSelections[userId].animeId;
        const episodes = await getEpisodesFromSource({ name: 'AnimePahe' }, title, animeId);
        if (episodes.length > 0) {
          const episodeButtons = episodes.map((ep, i) => [
            { text: `Ep. ${i + 1}`, url: ep.link }
          ]);
          episodeButtons.push([{ text: 'Back to Info', callback_data: `info_AnimePahe_${title}` }]);
          bot.sendMessage(chatId, `Episodes for "${title}" on AnimePahe:`, {
            reply_markup: { inline_keyboard: episodeButtons },
          });
        } else {
          bot.sendMessage(chatId, `No episodes found for "${title}".`);
        }
      } else {
        bot.sendMessage(chatId, 'Session expired or invalid selection.');
      }
    }

    // Handle back to anime info
    else if (data.startsWith('info_AnimePahe_')) {
      const title = data.split('_').slice(2).join('_');
      if (userSelections[userId] && userSelections[userId].title === title) {
        const { animeId, title } = userSelections[userId];
        let message = `<b>📺 ${title}</b>\n` +
                      `<b>Stream on AnimePahe:</b> <a href="${BASE_URL_ANIMEPAHE}/anime/${animeId}">Watch Now</a>`;
        const keyboard = [[{ text: 'View Episodes', callback_data: `view_episodes_AnimePahe_${title}` }]];
        bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        bot.sendMessage(chatId, 'Session expired or invalid selection.');
      }
    }

    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Callback error:', error);
    bot.sendMessage(chatId, 'An error occurred. Please try again.');
  }
});

// Helper Functions

// Scrape the full AnimePahe index from https://animepahe.ru/anime
async function scrapeAnimePaheFullIndex() {
  const url = 'https://animepahe.ru/anime';
  const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(response.data);
  const index = {};
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const animeList = [];
    $(`#anime-list-group-${letter.toLowerCase()} a`).each((_, el) => { // Adjust selector based on actual HTML
      const title = $(el).text().trim();
      const href = $(el).attr('href');
      if (title && href && href.startsWith('/anime/')) {
        const id = href.split('/')[2]; // Assuming /anime/<id>/<slug>
        animeList.push({ title, id });
      }
    });
    index[letter] = animeList;
  }
  return index;
}

// Fetch episodes using animeId if available
async function getEpisodesFromSource(source, title, animeId = null) {
  if (source.name === 'AnimePahe') {
    try {
      if (!animeId) {
        const apiResponse = await axios.get(`${BASE_URL_ANIMEPAHE}/api?m=search&q=${encodeURIComponent(title)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 5000,
        });
        const anime = apiResponse.data.data.find(a => a.title.toLowerCase() === title.toLowerCase());
        if (!anime) return [];
        animeId = anime.id;
      }
      const episodeResponse = await axios.get(`${BASE_URL_ANIMEPAHE}/api?m=release&id=${animeId}&sort=episode_asc`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000,
      });
      const episodes = episodeResponse.data.data.map(ep => ({
        title: `Episode ${ep.episode}`,
        link: `${BASE_URL_ANIMEPAHE}/play/${animeId}/${ep.session}`,
      }));
      return episodes;
    } catch (error) {
      console.error('AnimePahe episodes scrape error:', error.message);
      return [];
    }
  }
  return [];
}

console.log('Bot is running...');
