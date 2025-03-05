const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { execSync } = require('child_process');

// API Keys and Configuration
const TELEGRAM_TOKEN = '7741465512:AAGzBMSPa5McuO12TgLkxH-HWfbFRTbkAWM'; // Replace with your Telegram bot token
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94'; // Replace with your TMDB API key
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL_1337X = 'https://1337x.to';
const BASE_URL_WCOFUN = 'https://www.wcofun.net';
const BASE_URL_ANIMEPAHE = 'https://animepahe.ru';
const BASE_URL_9ANIME = 'https://9anime.to';
const BASE_URL_HIANIME = 'https://hianime.tv';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// In-memory cache and user selections
let cache = {};
let userSelections = {};
let indexCache = null;
let indexCacheTimestamp = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Alternative sources
const sources = [
  { name: 'AnimePahe', baseUrl: BASE_URL_ANIMEPAHE, type: 'anime' },
  { name: 'wcofun.net', baseUrl: BASE_URL_WCOFUN, type: 'anime' },
  { name: '9anime', baseUrl: BASE_URL_9ANIME, type: 'anime' },
  { name: 'HiAnime', baseUrl: BASE_URL_HIANIME, type: 'anime' },
  { name: '1337x', baseUrl: BASE_URL_1337X, type: 'torrent' },
];

// Handle /start command with main menu
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const keyboardOptions = [
    [{ text: '🔍 Search Anime', callback_data: 'search_anime' }],
    [{ text: '🔍 Search Series', callback_data: 'search_series' }],
    [{ text: '🔍 Search Movies', callback_data: 'search_movies' }],
    [{ text: '📇 AnimePahe Index', callback_data: 'animepahe_index' }],
    [{ text: '🏴‍☠️ All Sources', callback_data: 'all_sources' }],
  ];
  bot.sendMessage(chatId, 'Choose an option to search or explore:', {
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

    // Handle search options
    if (data === 'search_anime' || data === 'search_series' || data === 'search_movies') {
      const type = data === 'search_anime' ? 'anime' : data === 'search_series' ? 'series' : 'movie';
      bot.sendMessage(chatId, `Enter the ${type} name to search for:`, { reply_markup: { force_reply: true } });
      bot.once('message', async (msg) => {
        const query = msg.text.trim();
        if (!query) {
          bot.sendMessage(chatId, 'Please provide a valid search term!');
          return;
        }
        const results = await searchContent(query, type);
        if (results.length > 0) {
          const keyboard = results.slice(0, 5).map(r => [{ text: r.title, callback_data: `content_${type}_${r.id}` }]);
          bot.sendMessage(chatId, `Search results for "${query}":`, { reply_markup: { inline_keyboard: keyboard } });
        } else {
          bot.sendMessage(chatId, `No ${type} found for "${query}".`);
        }
      });
    } else if (data === 'animepahe_index') {
      if (!indexCache || Date.now() - indexCacheTimestamp > CACHE_DURATION) {
        bot.sendMessage(chatId, 'Loading AnimePahe index, please wait...');
        indexCache = await scrapeAnimePaheFullIndex();
        indexCacheTimestamp = Date.now();
        bot.sendMessage(chatId, 'AnimePahe index loaded successfully.');
      }
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const keyboard = letters.map(letter => [{ text: letter, callback_data: `index_${letter}` }]);
      bot.sendMessage(chatId, 'Select a letter to browse AnimePahe index:', {
        reply_markup: { inline_keyboard: keyboard },
      });
    } else if (data === 'all_sources') {
      const keyboard = sources.map(s => [{ text: s.name, url: s.baseUrl }]);
      bot.sendMessage(chatId, 'Available Sources:', { reply_markup: { inline_keyboard: keyboard } });
    }

    // Handle AnimePahe index letter selection
    else if (data.startsWith('index_')) {
      const letter = data.split('_')[1];
      if (indexCache && indexCache[letter]) {
        const animeList = indexCache[letter];
        const keyboard = animeList.map((anime, index) => [
          { text: anime.title, callback_data: `content_anime_${anime.id}` },
        ]);
        keyboard.push([{ text: 'Back to Letters', callback_data: 'animepahe_index' }]);
        bot.sendMessage(chatId, `Anime starting with ${letter} on AnimePahe:`, {
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        bot.sendMessage(chatId, `No anime found for letter ${letter} on AnimePahe.`);
      }
    }

    // Handle content selection
    else if (data.startsWith('content_')) {
      const [_, type, id] = data.split('_');
      const content = type === 'anime' && indexCache ? Object.values(indexCache).flat().find(a => a.id === id) : await getContentDetails(type, id);
      if (content) {
        userSelections[userId] = { type, id: content.id || id, title: content.title };
        const mediaLinks = await fetchMediaLinks(content.title, type);
        let message = `<b>📺 ${content.title}</b>\n`;
        const keyboard = [];
        
        if (mediaLinks.length > 0) {
          const seasons = organizeSeasonsEpisodes(mediaLinks, type);
          Object.keys(seasons).forEach(season => {
            keyboard.push([{ text: `Season ${season}`, callback_data: `season_${type}_${id}_${season}` }]);
          });
          message += 'Select a season to view episodes:';
        } else {
          message += 'No media links found.';
        }
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
      } else {
        bot.sendMessage(chatId, 'Content not found.');
      }
    }

    // Handle season selection
    else if (data.startsWith('season_')) {
      const [_, type, id, season] = data.split('_');
      const content = userSelections[userId];
      if (content) {
        const mediaLinks = await fetchMediaLinks(content.title, type);
        const seasons = organizeSeasonsEpisodes(mediaLinks, type);
        const episodes = seasons[season] || [];
        const keyboard = episodes.map((ep, i) => [
          { text: `Ep. ${i + 1}`, url: ep.url },
        ]);
        keyboard.push([{ text: 'Back to Seasons', callback_data: `content_${type}_${id}` }]);
        bot.sendMessage(chatId, `Episodes for ${content.title} Season ${season}:`, {
          reply_markup: { inline_keyboard: keyboard },
        });
      }
    }

    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Callback error:', error);
    bot.sendMessage(chatId, 'An error occurred while processing your request.');
  }
});

// **Helper Functions**

// Search content using TMDB or internal logic
async function searchContent(query, type) {
  if (type === 'anime' && indexCache) {
    return Object.values(indexCache).flat().filter(a => a.title.toLowerCase().includes(query.toLowerCase()));
  }
  try {
    const url = `${TMDB_BASE_URL}/search/${type === 'series' ? 'tv' : 'movie'}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 5000 });
    return response.data.results.map(r => ({ id: r.id, title: r.name || r.title }));
  } catch (error) {
    console.error('TMDB search error:', error.message);
    return [];
  }
}

// Get content details from TMDB
async function getContentDetails(type, id) {
  try {
    const url = `${TMDB_BASE_URL}/${type === 'series' ? 'tv' : 'movie'}/${id}?api_key=${TMDB_API_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });
    return { id: response.data.id, title: response.data.name || response.data.title };
  } catch (error) {
    console.error('TMDB details error:', error.message);
    return null;
  }
}

// Fetch media links from all sources using IDM+ techniques
async function fetchMediaLinks(title, type) {
  const mediaLinks = [];
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/app/.apt/usr/bin/google-chrome', // Heroku path
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const mediaUrls = new Set();

    page.on('request', request => {
      const url = request.url();
      if (url.match(/\.(mp4|m3u8|torrent|ts)$/i) || url.includes('download') || url.includes('stream')) {
        mediaUrls.add(url);
      }
      request.continue();
    });

    for (const source of sources) {
      if (type === 'anime' && source.type !== 'anime' && source.type !== 'torrent') continue;
      if (type === 'series' && source.type === 'anime') continue;
      if (type === 'movie' && source.type === 'anime') continue;

      let searchUrl;
      switch (source.name) {
        case 'AnimePahe':
          searchUrl = `${BASE_URL_ANIMEPAHE}/api?m=search&q=${encodeURIComponent(title)}`;
          const apiRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const anime = apiRes.data.data.find(a => a.title.toLowerCase() === title.toLowerCase());
          if (anime) searchUrl = `${BASE_URL_ANIMEPAHE}/anime/${anime.id}`;
          break;
        case 'wcofun.net':
          searchUrl = `${BASE_URL_WCOFUN}/search`;
          await axios.post(searchUrl, `keyword=${encodeURIComponent(title)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          break;
        case '9anime':
          searchUrl = `${BASE_URL_9ANIME}/search?keyword=${encodeURIComponent(title)}`;
          break;
        case 'HiAnime':
          searchUrl = `${BASE_URL_HIANIME}/search?keyword=${encodeURIComponent(title)}`;
          break;
        case '1337x':
          searchUrl = `${BASE_URL_1337X}/search/${encodeURIComponent(title)}/1/`;
          break;
        default:
          continue;
      }

      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForTimeout(3000); // Wait for dynamic content

      const content = await page.content();
      const $ = cheerio.load(content);
      $('a[href], source[src], video[src]').each((_, el) => {
        const url = $(el).attr('href') || $(el).attr('src');
        if (url && (url.match(/\.(mp4|m3u8|torrent|ts)$/i) || url.includes('episode') || url.includes('season'))) {
          mediaUrls.add(url.startsWith('http') ? url : `${source.baseUrl}${url}`);
        }
      });

      // Follow redirects for detected URLs
      for (const url of mediaUrls) {
        try {
          const finalUrl = await resolveRedirects(url);
          if (finalUrl) mediaLinks.push({ url: finalUrl, source: source.name });
        } catch (e) {
          console.error(`Redirect error for ${url}:`, e.message);
        }
      }
    }

    await browser.close();
    return mediaLinks;
  } catch (error) {
    await browser.close();
    console.error('Fetch media links error:', error.message);
    return [];
  }
}

// Resolve redirects like IDM+
async function resolveRedirects(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 10,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: () => true, // Accept all status codes
    });
    return response.request.res.responseUrl || url;
  } catch (error) {
    console.error('Redirect resolution error:', error.message);
    return null;
  }
}

// Organize media links into seasons and episodes
function organizeSeasonsEpisodes(mediaLinks, type) {
  const seasons = {};
  mediaLinks.forEach(link => {
    const url = link.url.toLowerCase();
    let season = '1', episode = '1';

    // Extract season and episode from URL patterns
    const seasonMatch = url.match(/season[-_]?(\d+)/i);
    const episodeMatch = url.match(/episode[-_]?(\d+)/i) || url.match(/ep[-_]?(\d+)/i);
    if (seasonMatch) season = seasonMatch[1];
    if (episodeMatch) episode = episodeMatch[1];

    if (!seasons[season]) seasons[season] = [];
    seasons[season].push({ url: link.url, source: link.source });
  });

  // For movies or single-season content
  if (type === 'movie' || Object.keys(seasons).length === 0) {
    seasons['1'] = mediaLinks.map(link => ({ url: link.url, source: link.source }));
  }

  return seasons;
}

// Scrape AnimePahe full index
async function scrapeAnimePaheFullIndex() {
  const chromePath = '/app/.apt/usr/bin/google-chrome';
  if (!fs.existsSync(chromePath)) {
    console.error(`Chrome executable not found at ${chromePath}`);
    throw new Error('Chrome not found');
  }
  console.log(`Chrome found at ${chromePath}`);
  try {
    const chromeVersion = execSync(`${chromePath} --version`).toString().trim();
    console.log(`Chrome version: ${chromeVersion}`);
  } catch (e) {
    console.error('Failed to get Chrome version:', e.message);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://animepahe.ru/',
    });

    await page.goto(`${BASE_URL_ANIMEPAHE}/anime`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(5000);

    const content = await page.content();
    await browser.close();

    const $ = cheerio.load(content);
    const index = {};
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const animeList = [];
      $(`.anime-letter-${letter.toLowerCase()} a`).each((_, el) => {
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
    await browser.close();
    console.error('AnimePahe full index scrape error:', error.message);
    throw error;
  }
}

console.log('Bot is running...');
