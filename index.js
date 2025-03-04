const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');

// API Keys and Configuration
const TELEGRAM_TOKEN = '7741465512:AAGzBMSPa5McuO12TgLkxH-HWfbFRTbkAWM'; // Replace with your Telegram bot token
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94'; // Replace with your TMDB API key
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL_1337X = 'https://1337x.to';
const BASE_URL_WCOFUN = 'https://www.wcofun.net';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// In-memory cache and user selections
let cache = {};
let userSelections = {};

// Alternative anime sources
const alternativeAnimeSources = [
  { name: 'AnimeKai', baseUrl: 'https://animekai.to' },
  { name: 'AnimePahe', baseUrl: 'https://animepahe.ru' },
  { name: 'HiAnime', baseUrl: 'https://hianime.tv' },
];

// Handle /start command with main menu
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const keyboardOptions = [
    [{ text: '📥 Scrape Torrents from 1337x', callback_data: 'scrape_1337x' }],
    [{ text: '📺 Scrape Anime from wcofun.net', callback_data: 'scrape_wcofun' }],
    [{ text: '🏴‍☠️ Anime Sources', callback_data: 'anime_sources' }],
    [{ text: '🏴‍☠️ Cartoon Sources', callback_data: 'cartoon_sources' }],
    [{ text: '🏴‍☠️ Movie/Series Sources', callback_data: 'movie_series_sources' }],
  ];
  bot.sendMessage(chatId, 'Choose an option to scrape or explore sources:', {
    reply_markup: { inline_keyboard: keyboardOptions },
  });
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  try {
    if (data === 'noop') {
      bot.answerCallbackQuery(callbackQuery.id);
      return;
    }

    // Handle main menu options
    if (data === 'scrape_1337x') {
      bot.sendMessage(chatId, 'Enter the movie/series/game name to scrape from 1337x:');
      bot.once('message', async (msg) => {
        const torrents = await scrape1337x(msg.text);
        const keyboard = torrents.slice(0, 5).map(t => [{ text: t.name, url: t.href }]);
        bot.sendMessage(chatId, torrents.length > 0 ? 'Top torrents:' : 'No torrents found.', {
          reply_markup: { inline_keyboard: keyboard },
        });
      });
    } else if (data === 'scrape_wcofun') {
      bot.sendMessage(chatId, 'Enter the anime name to scrape from wcofun.net:');
      bot.once('message', async (msg) => {
        const results = await searchMedia(msg.text, 'tv');
        cache['search_' + chatId] = results;
        const keyboard = results.slice(0, 5).map(r => [{ text: r.data.name, callback_data: `tv_${r.data.id}_wcofun` }]);
        bot.sendMessage(chatId, results.length > 0 ? 'Search results:' : 'No anime found.', {
          reply_markup: { inline_keyboard: keyboard },
        });
      });
    } else if (data === 'anime_sources') {
      const sources = [
        { name: 'AnimeKai', url: 'https://animekai.to/home' },
        { name: 'AnimePahe', url: 'https://animepahe.ru/' },
        { name: 'HiAnime', url: 'https://hianime.tv/' },
        { name: 'AnimeZ', url: 'https://animez.org/' },
        { name: 'WCOStream', url: 'https://www.wcostream.tv/' },
        { name: '9anime', url: 'https://9anime.to/' },
        { name: 'Animesuge', url: 'https://animesuge.to/' },
        { name: 'Animeonsen', url: 'https://animeonsen.xyz/' },
      ];
      const keyboard = sources.map(s => [{ text: s.name, url: s.url }]);
      bot.sendMessage(chatId, 'Anime Sources:', { reply_markup: { inline_keyboard: keyboard } });
    } else if (data === 'cartoon_sources' || data === 'movie_series_sources') {
      bot.sendMessage(chatId, 'This feature is not yet implemented.');
    }

    // Handle anime selection for wcofun.net
    else if (data.startsWith('tv_') && data.endsWith('_wcofun')) {
      const [type, id] = data.split('_');
      const media = await getMediaDetails(type, id);
      if (media) {
        userSelections[userId] = { type, id, source: 'wcofun', title: media.name };
        await sendWCOFunDetails(chatId, media, type);
      } else {
        bot.sendMessage(chatId, 'Sorry, I couldn’t fetch details for this anime.');
      }
    }

    // Handle "Try Other Sources"
    else if (data.startsWith('try_other_sources_')) {
      const title = data.split('_').slice(3).join('_');
      const keyboardOptions = alternativeAnimeSources.map(source => [
        { text: source.name, callback_data: `scrape_${source.name}_${title}` },
      ]);
      bot.sendMessage(chatId, `Select another source to scrape for "${title}":`, {
        reply_markup: { inline_keyboard: keyboardOptions },
      });
    }

    // Handle scraping alternative source
    else if (data.startsWith('scrape_')) {
      const [_, sourceName, ...titleParts] = data.split('_');
      const title = titleParts.join('_');
      const source = alternativeAnimeSources.find(s => s.name === sourceName);
      if (source) {
        const animeLink = await scrapeAlternativeSource(source, title);
        if (animeLink) {
          let message = `<b>📺 ${title}</b>\n` +
                        `<b>Stream on ${source.name}:</b> <a href="${animeLink.link}">Watch Now</a>`;
          const keyboard = [[{ text: 'View Episodes', callback_data: `view_episodes_${source.name}_${title}` }]];
          bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        } else {
          bot.sendMessage(chatId, `Sorry, I couldn’t find "${title}" on ${source.name}.`, {
            reply_markup: { inline_keyboard: [[{ text: 'Try Other Sources', callback_data: `try_other_sources_${title}` }]] },
          });
        }
      }
    }

    // Handle "View Episodes" for wcofun.net
    else if (data.startsWith('view_episodes_wcofun_')) {
      const title = data.split('_').slice(2).join('_');
      const episodes = await scrapeWCOFunEpisodes(title);
      if (episodes && episodes.length > 0) {
        const episodeButtons = episodes.map((ep, i) => [{ text: `Ep. ${i + 1}`, url: ep.link }]);
        episodeButtons.push([{ text: 'Back to Info', callback_data: `info_wcofun_${title}` }]);
        bot.sendMessage(chatId, `Episodes for "${title}" on wcofun.net:`, {
          reply_markup: { inline_keyboard: episodeButtons },
        });
      } else {
        bot.sendMessage(chatId, `Unable to retrieve episodes for "${title}" on wcofun.net.`);
      }
    }

    // Handle "View Episodes" for alternative sources
    else if (data.startsWith('view_episodes_')) {
      const [_, sourceName, ...titleParts] = data.split('_');
      const title = titleParts.join('_');
      const source = alternativeAnimeSources.find(s => s.name === sourceName);
      if (source) {
        const episodes = await getEpisodesFromSource(source, title);
        if (episodes && episodes.length > 0) {
          const episodeButtons = episodes.map((ep, i) => [{ text: `Ep. ${i + 1}`, url: ep.link }]);
          episodeButtons.push([{ text: 'Back to Info', callback_data: `info_${source.name}_${title}` }]);
          bot.sendMessage(chatId, `Episodes for "${title}" on ${source.name}:`, {
            reply_markup: { inline_keyboard: episodeButtons },
          });
        } else {
          bot.sendMessage(chatId, `Unable to retrieve episodes for "${title}" on ${source.name}.`, {
            reply_markup: { inline_keyboard: [[{ text: 'Try Other Sources', callback_data: `try_other_sources_${title}` }]] },
          });
        }
      }
    }

    // Handle "Back to Info" for wcofun.net
    else if (data.startsWith('info_wcofun_')) {
      const title = data.split('_').slice(2).join('_');
      const media = await getMediaDetails('tv', userSelections[userId]?.id);
      if (media) await sendWCOFunDetails(chatId, media, 'tv');
      else bot.sendMessage(chatId, 'Unable to retrieve anime details.');
    }

    // Handle "Back to Info" for alternative sources
    else if (data.startsWith('info_')) {
      const [_, sourceName, ...titleParts] = data.split('_');
      const title = titleParts.join('_');
      const source = alternativeAnimeSources.find(s => s.name === sourceName);
      if (source) {
        const animeLink = await scrapeAlternativeSource(source, title);
        if (animeLink) {
          let message = `<b>📺 ${title}</b>\n` +
                        `<b>Stream on ${source.name}:</b> <a href="${animeLink.link}">Watch Now</a>`;
          const keyboard = [[{ text: 'View Episodes', callback_data: `view_episodes_${source.name}_${title}` }]];
          bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        } else {
          bot.sendMessage(chatId, `Sorry, I couldn’t find "${title}" on ${source.name}.`, {
            reply_markup: { inline_keyboard: [[{ text: 'Try Other Sources', callback_data: `try_other_sources_${title}` }]] },
          });
        }
      }
    }

    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Callback error:', error);
    bot.sendMessage(chatId, 'An error occurred while processing your request.');
  }
});

// **Helper Functions**

// Send WCOFun details
async function sendWCOFunDetails(chatId, media, type) {
  const title = media.name;
  const releaseDate = media.first_air_date;

  let message = `<b>📺 ${title}</b>\n\n` +
                `<b>Release Date:</b> ${releaseDate || 'N/A'}\n` +
                `<b>Rating:</b> ${media.vote_average || 'N/A'}/10\n` +
                `<b>Overview:</b> ${media.overview || 'No description available.'}\n`;

  const animeLink = await scrapeWCOFun(title);
  let keyboard = [];
  if (animeLink) {
    message += `\n<b>Stream on wcofun.net:</b> <a href="${animeLink.link}">Watch Now</a>`;
    keyboard = [[{ text: 'View Episodes', callback_data: `view_episodes_wcofun_${title}` }]];
  } else {
    message += `\nSorry, no streaming link found for "${title}" on wcofun.net.`;
    keyboard = [[{ text: 'Try Other Sources', callback_data: `try_other_sources_${title}` }]];
  }

  bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

// Scrape WCOFun for anime link
async function scrapeWCOFun(query) {
  try {
    const searchUrl = `${BASE_URL_WCOFUN}/search`;
    const response = await axios.post(searchUrl, `keyword=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
    });
    const $ = cheerio.load(response.data);
    const firstResult = $('.film_list-wrap .flw-item a.film-poster').first().attr('href');
    if (firstResult) {
      return { link: `${BASE_URL_WCOFUN}${firstResult}` };
    }
    return null;
  } catch (error) {
    console.error('WCOFun scrape error:', error.message);
    return null;
  }
}

// Scrape WCOFun episodes
async function scrapeWCOFunEpisodes(title) {
  try {
    const animeLink = await scrapeWCOFun(title);
    if (!animeLink) return [];
    const response = await axios.get(animeLink.link, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    const $ = cheerio.load(response.data);
    const episodes = [];
    $('.ep-item').each((_, el) => {
      const epTitle = $(el).attr('title');
      const epLink = $(el).attr('href');
      if (epTitle && epLink) {
        episodes.push({ title: epTitle, link: `${BASE_URL_WCOFUN}${epLink}` });
      }
    });
    return episodes;
  } catch (error) {
    console.error('WCOFun episodes scrape error:', error.message);
    return [];
  }
}

// Scrape alternative source (placeholder)
async function scrapeAlternativeSource(source, query) {
  // Placeholder: Simulates scraping; replace with actual logic per source
  try {
    // Example: Construct a hypothetical search URL and parse results
    return { link: `${source.baseUrl}/anime/${query.toLowerCase().replace(' ', '-')}` };
  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error.message);
    return null;
  }
}

// Get episodes from alternative source (placeholder)
async function getEpisodesFromSource(source, title) {
  // Placeholder: Simulates episode retrieval; replace with actual logic per source
  try {
    // Simulate 12 episodes as an example
    return Array.from({ length: 12 }, (_, i) => ({
      title: `Episode ${i + 1}`,
      link: `${source.baseUrl}/anime/${title.toLowerCase().replace(' ', '-')}/episode-${i + 1}`,
    }));
  } catch (error) {
    console.error(`Error getting episodes from ${source.name}:`, error.message);
    return [];
  }
}

// Scrape 1337x torrents
async function scrape1337x(query) {
  try {
    const searchUrl = `${BASE_URL_1337X}/search/${encodeURIComponent(query)}/1/`;
    const response = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    const $ = cheerio.load(response.data);
    const torrents = [];
    $('tbody tr').each((_, row) => {
      const name = $(row).find('.name').text().trim();
      const href = BASE_URL_1337X + $(row).find('.name a:nth-child(2)').attr('href');
      if (name && href) torrents.push({ name, href });
    });
    return torrents;
  } catch (error) {
    console.error('1337x scrape error:', error.message);
    return [];
  }
}

// Search media on TMDB
async function searchMedia(query, type) {
  try {
    const url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 5000 });
    return response.data.results.map(r => ({ type, data: r }));
  } catch (error) {
    console.error('TMDB search error:', error.message);
    return [];
  }
}

// Get media details from TMDB
async function getMediaDetails(type, id) {
  try {
    const url = `${TMDB_BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });
    return response.data;
  } catch (error) {
    console.error('TMDB details error:', error.message);
    return null;
  }
}

console.log('Bot is running...');
