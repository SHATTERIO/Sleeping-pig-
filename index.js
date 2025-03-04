const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// API Keys and Configuration
const TELEGRAM_TOKEN = '7741465512:AAGzBMSPa5McuO12TgLkxH-HWfbFRTbkAWM'; // Replace with your Telegram bot token
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94'; // Replace with your TMDB API key
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL_1337X = 'https://1337x.to';
const BASE_URL_WCOFUN = 'https://www.wcofun.net';
const BASE_URL_ANIMEPAHE = 'https://animepahe.ru';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// In-memory cache and user selections
let cache = {};
let userSelections = {};
let indexCache = null;
let indexCacheTimestamp = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Alternative anime sources
const alternativeAnimeSources = [
  { name: 'AnimeKai', baseUrl: 'https://animekai.to' },
  { name: 'AnimePahe', baseUrl: BASE_URL_ANIMEPAHE },
  { name: 'HiAnime', baseUrl: 'https://hianime.tv' },
];

// Handle /start command with main menu
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const keyboardOptions = [
    [{ text: '📥 Scrape Torrents from 1337x', callback_data: 'scrape_1337x' }],
    [{ text: '📺 Scrape Anime from wcofun.net', callback_data: 'scrape_wcofun' }],
    [{ text: '📇 AnimePahe Index', callback_data: 'animepahe_index' }],
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
      bot.sendMessage(chatId, 'Enter the movie/series/game name to scrape from 1337x:', { reply_markup: { force_reply: true } });
    } else if (data === 'scrape_wcofun') {
      bot.sendMessage(chatId, 'Enter the anime name to scrape from wcofun.net:', { reply_markup: { force_reply: true } });
    } else if (data === 'animepahe_index') {
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
      bot.sendMessage(chatId, 'Select a letter to browse AnimePahe index:', {
        reply_markup: { inline_keyboard: keyboard },
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
      keyboard.push([{ text: 'Back to Menu', callback_data: 'back_to_start' }]);
      bot.sendMessage(chatId, 'Anime Sources:', { reply_markup: { inline_keyboard: keyboard } });
    } else if (data === 'cartoon_sources' || data === 'movie_series_sources') {
      bot.sendMessage(chatId, 'This feature is not yet implemented.');
    } else if (data === 'back_to_start') {
      const keyboardOptions = [
        [{ text: '📥 Scrape Torrents from 1337x', callback_data: 'scrape_1337x' }],
        [{ text: '📺 Scrape Anime from wcofun.net', callback_data: 'scrape_wcofun' }],
        [{ text: '📇 AnimePahe Index', callback_data: 'animepahe_index' }],
        [{ text: '🏴‍☠️ Anime Sources', callback_data: 'anime_sources' }],
        [{ text: '🏴‍☠️ Cartoon Sources', callback_data: 'cartoon_sources' }],
        [{ text: '🏴‍☠️ Movie/Series Sources', callback_data: 'movie_series_sources' }],
      ];
      bot.sendMessage(chatId, 'Choose an option to scrape or explore sources:', {
        reply_markup: { inline_keyboard: keyboardOptions },
      });
    }

    // Handle AnimePahe index letter selection
    else if (data.startsWith('index_')) {
      const letter = data.split('_')[1];
      if (indexCache && indexCache[letter]) {
        const animeList = indexCache[letter];
        const keyboard = animeList.map((anime, index) => [
          { text: anime.title, callback_data: `select_animepahe_${letter}_${index}` },
        ]);
        keyboard.push([{ text: 'Back to Letters', callback_data: 'animepahe_index' }]);
        bot.sendMessage(chatId, `Anime starting with ${letter} on AnimePahe:`, {
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        bot.sendMessage(chatId, `No anime found for letter ${letter} on AnimePahe.`, {
          reply_markup: { inline_keyboard: [[{ text: 'Back to Letters', callback_data: 'animepahe_index' }]] },
        });
      }
    }

    // Handle AnimePahe anime selection
    else if (data.startsWith('select_animepahe_')) {
      const [_, letter, index] = data.split('_');
      const anime = indexCache[letter][parseInt(index)];
      if (anime) {
        const { title, id } = anime;
        userSelections[userId] = { source: 'AnimePahe', title, animeId: id };
        let message = `<b>📺 ${title}</b>\n` +
                      `<b>Stream on AnimePahe:</b> <a href="${BASE_URL_ANIMEPAHE}/anime/${id}">Watch Now</a>`;
        const keyboard = [[{ text: 'View Episodes', callback_data: `view_episodes_AnimePahe_${title}` }]];
        bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
      } else {
        bot.sendMessage(chatId, 'Selected anime not found.');
      }
    }

    // Handle wcofun.net anime selection
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
        const animeId = userSelections[userId]?.animeId || null;
        const episodes = await getEpisodesFromSource(source, title, source.name === 'AnimePahe' ? animeId : null);
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

// Handle manual search replies
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (text && text.startsWith('/')) return;

  if (msg.reply_to_message && msg.reply_to_message.text.includes('Enter the')) {
    try {
      if (!text || text.trim() === '') {
        bot.sendMessage(chatId, 'Please provide a valid search term!');
        return;
      }

      if (msg.reply_to_message.text.includes('1337x')) {
        const torrents = await scrape1337x(text);
        const keyboard = torrents.slice(0, 5).map(t => [{ text: t.name, url: t.href }]);
        bot.sendMessage(chatId, torrents.length > 0 ? 'Top torrents:' : 'No torrents found.', {
          reply_markup: { inline_keyboard: keyboard },
        });
      } else if (msg.reply_to_message.text.includes('wcofun.net')) {
        const results = await searchMedia(text, 'tv');
        cache['search_' + chatId] = results;
        if (results.length > 0) {
          const keyboard = results.slice(0, 5).map(r => [{ text: r.data.name, callback_data: `tv_${r.data.id}_wcofun` }]);
          bot.sendMessage(chatId, 'Search results:', { reply_markup: { inline_keyboard: keyboard } });
        } else {
          bot.sendMessage(chatId, 'No anime found.');
        }
      }
    } catch (error) {
      console.error('Search handler error:', error);
      bot.sendMessage(chatId, 'Something went wrong while searching.');
    }
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

// Scrape the full AnimePahe index from https://animepahe.ru/anime using Puppeteer
async function scrapeAnimePaheFullIndex() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Set browser-like headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://animepahe.ru/',
    });

    // Navigate and wait for page to fully load including DDoS-Guard challenge
    await page.goto(`${BASE_URL_ANIMEPAHE}/anime`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for JavaScript challenge to resolve
    await page.waitForTimeout(5000);

    // Get page content
    const content = await page.content();
    await browser.close();

    // Parse with Cheerio
    const $ = cheerio.load(content);
    const index = {};

    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const animeList = [];
      $(`div[id="${letter}"] a`).each((_, el) => { // Adjust selector based on actual HTML
        const title = $(el).text().trim();
        const href = $(el).attr('href');
        if (title && href && href.startsWith('/anime/')) {
          const id = href.split('/')[2];
          animeList.push({ title, id });
        }
      });
      index[letter] = animeList;
    }
    return index;
  } catch (error) {
    console.error('AnimePahe full index scrape error:', error.message);
    throw error;
  }
}

// Get episodes from alternative source (specific for AnimePahe)
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
  // Placeholder for other sources
  return Array.from({ length: 12 }, (_, i) => ({
    title: `Episode ${i + 1}`,
    link: `${source.baseUrl}/anime/${title.toLowerCase().replace(' ', '-')}/episode-${i + 1}`,
  }));
}

// Scrape alternative source (specific for AnimePahe)
async function scrapeAlternativeSource(source, query) {
  if (source.name === 'AnimePahe') {
    try {
      const apiResponse = await axios.get(`${BASE_URL_ANIMEPAHE}/api?m=search&q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000,
      });
      const anime = apiResponse.data.data[0];
      return anime ? { link: `${BASE_URL_ANIMEPAHE}/anime/${anime.id}` } : null;
    } catch (error) {
      console.error(`AnimePahe alternative scrape error:`, error.message);
      return null;
    }
  }
  // Placeholder for other sources
  return { link: `${source.baseUrl}/anime/${query.toLowerCase().replace(' ', '-')}` };
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

// Error handling for polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
