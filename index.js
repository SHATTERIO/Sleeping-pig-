const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');

// API Keys and Configuration
const TELEGRAM_TOKEN = '7741465512:AAGzBMSPa5McuO12TgLkxH-HWfbFRTbkAWM';
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL_1337X = 'https://1337x.to';
const BASE_URL_WCOFUN = 'https://www.wcofun.net';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// In-memory cache
let cache = {};

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
  const data = callbackQuery.data;

  // Acknowledge callback immediately
  bot.answerCallbackQuery(callbackQuery.id);

  try {
    if (data === 'noop') return;

    // Main menu options
    if (data === 'anime_sources') {
      const animeSourcesOptions = [
        [{ text: 'AnimeKai', url: 'https://animekai.to/home' }],
        [{ text: 'AnimePahe', url: 'https://animepahe.ru/' }],
        [{ text: 'Back', callback_data: 'back_to_start' }],
      ];
      bot.sendMessage(chatId, '🏴‍☠️ Anime Sources:', { reply_markup: { inline_keyboard: animeSourcesOptions } });
    } else if (data === 'cartoon_sources') {
      const cartoonSourcesOptions = [
        [{ text: 'Kimcartoon', url: 'https://kimcartoon.li/' }],
        [{ text: 'WCOFun', url: 'https://www.wcofun.net/' }],
        [{ text: 'Back', callback_data: 'back_to_start' }],
      ];
      bot.sendMessage(chatId, '🏴‍☠️ Cartoon Sources:', { reply_markup: { inline_keyboard: cartoonSourcesOptions } });
    } else if (data === 'movie_series_sources') {
      const movieSeriesSourcesOptions = [
        [{ text: '1337x', url: 'https://1337x.to/home/' }],
        [{ text: 'SFlix', url: 'https://sflix.to/' }],
        [{ text: 'Back', callback_data: 'back_to_start' }],
      ];
      bot.sendMessage(chatId, '🏴‍☠️ Movie/Series Sources:', { reply_markup: { inline_keyboard: movieSeriesSourcesOptions } });
    } else if (data === 'back_to_start') {
      const keyboardOptions = [
        [{ text: '📥 Scrape Torrents from 1337x', callback_data: 'scrape_1337x' }],
        [{ text: '📺 Scrape Anime from wcofun.net', callback_data: 'scrape_wcofun' }],
        [{ text: '🏴‍☠️ Anime Sources', callback_data: 'anime_sources' }],
        [{ text: '🏴‍☠️ Cartoon Sources', callback_data: 'cartoon_sources' }],
        [{ text: '🏴‍☠️ Movie/Series Sources', callback_data: 'movie_series_sources' }],
      ];
      bot.sendMessage(chatId, 'Choose an option:', { reply_markup: { inline_keyboard: keyboardOptions } });
    }
    // Scrape 1337x trending
    else if (data === 'scrape_1337x') {
      const [trendingMovies, trendingShows] = await Promise.all([getTrendingMovies(), getTrendingShows()]);
      const keyboardOptions = [
        ...trendingMovies.map((movie, index) => [{ text: movie.title, callback_data: `trending_movie_${index}_1337x` }]),
        ...trendingShows.map((show, index) => [{ text: show.name, callback_data: `trending_tv_${index}_1337x` }]),
        [{ text: '🔍 Search 1337x', callback_data: 'search_1337x' }],
      ];
      bot.sendMessage(chatId, 'Select a trending movie or show:', { reply_markup: { inline_keyboard: keyboardOptions } });
    }
    // Scrape wcofun.net trending
    else if (data === 'scrape_wcofun') {
      const trendingAnime = await getTrendingAnime();
      const keyboardOptions = [
        ...trendingAnime.map((anime, index) => [{ text: anime.name, callback_data: `trending_anime_${index}_wcofun` }]),
        [{ text: '🔍 Search wcofun.net', callback_data: 'search_wcofun' }],
      ];
      bot.sendMessage(chatId, 'Select a trending anime:', { reply_markup: { inline_keyboard: keyboardOptions } });
    }
    // Search prompts
    else if (data === 'search_1337x' || data === 'search_wcofun') {
      bot.sendMessage(chatId, `Please type the name of a ${data === 'search_1337x' ? 'movie/show' : 'anime'} to search:`, {
        reply_markup: { force_reply: true },
      });
    }
    // Handle trending selections
    else if (data.startsWith('trending_movie_')) {
      const [_, __, index] = data.split('_');
      const movie = cache['trending_movies'].data[parseInt(index)];
      await send1337xDetails(chatId, movie, 'movie');
    } else if (data.startsWith('trending_tv_')) {
      const [_, __, index] = data.split('_');
      const show = cache['trending_shows'].data[parseInt(index)];
      await send1337xDetails(chatId, show, 'tv');
    } else if (data.startsWith('trending_anime_')) {
      const [_, __, index] = data.split('_');
      const anime = cache['trending_anime'].data[parseInt(index)];
      await sendWCOFunDetails(chatId, anime, 'tv');
    }
    // Handle search selections
    else if (data.startsWith('search_')) {
      const [_, type, index, source] = data.split('_');
      const media = cache['search_' + chatId][parseInt(index)].data;
      if (source === '1337x') await send1337xDetails(chatId, media, type);
      else await sendWCOFunDetails(chatId, media, type);
    }
    // Handle episode view and back to info
    else if (data.startsWith('episodes_')) {
      const [_, title] = data.split('_');
      const episodes = await scrapeWCOFunEpisodes(title);
      const episodeButtons = episodes.map((ep, i) => [{ text: `Ep. ${i + 1}`, url: ep.link }]);
      episodeButtons.push([{ text: 'Back to Info', callback_data: `info_${title}_wcofun` }]);
      bot.sendMessage(chatId, 'Episodes:', { reply_markup: { inline_keyboard: episodeButtons } });
    } else if (data.startsWith('info_')) {
      const [_, title] = data.split('_');
      const media = cache['search_' + chatId]?.find(r => r.data.name === title)?.data;
      if (media) await sendWCOFunDetails(chatId, media, 'tv');
    }
  } catch (error) {
    console.error('Callback error:', error);
    bot.sendMessage(chatId, 'An error occurred while processing your request.');
  }
});

// Handle manual search replies
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text && text.startsWith('/')) return;

  if (msg.reply_to_message && msg.reply_to_message.text.includes('Please type the name')) {
    try {
      if (!text || text.trim() === '') {
        bot.sendMessage(chatId, 'Please provide a valid search term!');
        return;
      }

      const is1337xSearch = msg.reply_to_message.text.includes('movie/show');
      const results = is1337xSearch ? await searchMedia(text) : await searchAnime(text);
      if (!results) {
        bot.sendMessage(chatId, `Sorry, I couldn’t find anything for "${text}". Try another name!`);
        return;
      }

      cache['search_' + chatId] = results;
      if (results.length === 1) {
        const media = results[0].data;
        const type = results[0].type;
        if (is1337xSearch) await send1337xDetails(chatId, media, type);
        else await sendWCOFunDetails(chatId, media, type);
      } else {
        const keyboardOptions = results.map((result, index) => [
          { text: formatMediaPreview(result.data, result.type), callback_data: `search_${result.type}_${index}_${is1337xSearch ? '1337x' : 'wcofun'}` },
        ]);
        bot.sendMessage(chatId, `Found multiple matches for "${text}":`, { reply_markup: { inline_keyboard: keyboardOptions } });
      }
    } catch (error) {
      console.error('Search handler error:', error);
      bot.sendMessage(chatId, 'Something went wrong while searching.');
    }
  }
});

// Fetch trending movies (for 1337x)
async function getTrendingMovies() {
  const cacheKey = 'trending_movies';
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 3600000) return cached.data;
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/day`, { params: { api_key: TMDB_API_KEY }, timeout: 5000 });
    const data = response.data.results.slice(0, 5);
    cache[cacheKey] = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error('Error fetching trending movies:', error.message);
    return [];
  }
}

// Fetch trending shows (for 1337x)
async function getTrendingShows() {
  const cacheKey = 'trending_shows';
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 3600000) return cached.data;
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/day`, { params: { api_key: TMDB_API_KEY }, timeout: 5000 });
    const data = response.data.results.slice(0, 5);
    cache[cacheKey] = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error('Error fetching trending shows:', error.message);
    return [];
  }
}

// Fetch trending anime (for wcofun.net)
async function getTrendingAnime() {
  const cacheKey = 'trending_anime';
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 3600000) return cached.data;
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/day`, { params: { api_key: TMDB_API_KEY }, timeout: 5000 });
    const data = response.data.results.filter(show => show.origin_country.includes('JP')).slice(0, 5);
    cache[cacheKey] = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error('Error fetching trending anime:', error.message);
    return [];
  }
}

// Search TMDB for movies and shows (for 1337x)
async function searchMedia(query) {
  try {
    const results = [];
    const movieResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params: { api_key: TMDB_API_KEY, query }, timeout: 5000 });
    if (movieResponse.data.results.length > 0) {
      results.push(...movieResponse.data.results.map(data => ({ type: 'movie', data })));
    }
    const tvResponse = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params: { api_key: TMDB_API_KEY, query }, timeout: 5000 });
    if (tvResponse.data.results.length > 0) {
      results.push(...tvResponse.data.results.map(data => ({ type: 'tv', data })));
    }
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Error searching media:', error.message);
    return null;
  }
}

// Search TMDB for anime (for wcofun.net)
async function searchAnime(query) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params: { api_key: TMDB_API_KEY, query }, timeout: 5000 });
    const results = response.data.results
      .filter(show => show.origin_country.includes('JP'))
      .map(data => ({ type: 'tv', data }));
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Error searching anime:', error.message);
    return null;
  }
}

// Scrape 1337x for torrents
async function scrape1337x(query) {
  const cacheKey = '1337x_' + query.toLowerCase();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 300000) return cached.data;

  const searchUrl = `${BASE_URL_1337X}/search/${encodeURIComponent(query)}/1/`;
  try {
    const searchResponse = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    const $ = cheerio.load(searchResponse.data);
    const results = $('table.table-list tbody tr').map((_, el) => {
      const name = $(el).find('td.name a:nth-child(2)').text().trim();
      const link = $(el).find('td.name a:nth-child(2)').attr('href');
      const seeds = parseInt($(el).find('td.seeds').text().trim()) || 0;
      const size = $(el).find('td.size').text().trim().split(' ')[0] + ' GB';
      return name && link ? { name, link, seeds, size, quality: extractQuality(name) } : null;
    }).get().filter(Boolean);

    if (!results.length) return null;
    results.sort((a, b) => b.seeds - a.seeds);
    const bestTorrent = results[0];

    const torrentPageUrl = `${BASE_URL_1337X}${bestTorrent.link}`;
    const torrentPageResponse = await axios.get(torrentPageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    const $$ = cheerio.load(torrentPageResponse.data);
    const magnetLink = $$('a[href^="magnet:"]').first().attr('href');

    const result = magnetLink ? { ...bestTorrent, magnetLink } : bestTorrent;
    cache[cacheKey] = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    console.error('1337x scraping error:', error.message);
    return null;
  }
}

// Scrape wcofun.net for anime links
async function scrapeWCOFun(query) {
  const cacheKey = 'wcofun_' + query.toLowerCase();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 300000) return cached.data;

  try {
    const response = await axios.get(BASE_URL_WCOFUN, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    const $ = cheerio.load(response.data);
    const results = $('a').map((_, el) => {
      const title = $(el).text().trim();
      const link = $(el).attr('href');
      if (title && link && title.toLowerCase().includes(query.toLowerCase())) {
        return { title, link: link.startsWith('http') ? link : `${BASE_URL_WCOFUN}${link}` };
      }
      return null;
    }).get().filter(Boolean);

    const result = results.length > 0 ? results[0] : null;
    cache[cacheKey] = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    console.error('wcofun.net scraping error:', error.message);
    return null;
  }
}

// Scrape wcofun.net episodes (simulated)
async function scrapeWCOFunEpisodes(query) {
  const cacheKey = 'wcofun_episodes_' + query.toLowerCase();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 300000) return cached.data;

  // Simulated scraping; replace with actual logic if wcofun.net provides episode lists
  const episodes = Array.from({ length: 12 }, (_, i) => ({
    title: `Episode ${i + 1}`,
    link: `https://www.wcofun.net/${query.toLowerCase().replace(' ', '-')}-episode-${i + 1}`
  }));
  cache[cacheKey] = { data: episodes, timestamp: Date.now() };
  return episodes;
}

// Helper to extract quality from torrent name
function extractQuality(name) {
  const qualityPatterns = ['4k', '1080p', '720p', '480p', '360p', 'hdr', 'bluray', 'web-dl', 'hdtv'];
  for (const quality of qualityPatterns) {
    if (name.toLowerCase().includes(quality)) return quality.toUpperCase();
  }
  return 'Unknown';
}

// Format preview for selection
function formatMediaPreview(media, type) {
  const title = type === 'movie' ? media.title : media.name;
  const releaseDate = type === 'movie' ? media.release_date : media.first_air_date;
  return `${type === 'movie' ? '🎬' : '📺'} ${title} (${releaseDate ? releaseDate.slice(0, 4) : 'N/A'})`;
}

// Send 1337x details with torrent links
async function send1337xDetails(chatId, media, type) {
  const title = type === 'movie' ? media.title : media.name;
  const releaseDate = type === 'movie' ? media.release_date : media.first_air_date;

  let message = `<b>${type === 'movie' ? '🎬' : '📺'} ${title}</b>\n` +
                `📅 Release: ${releaseDate || 'N/A'}\n` +
                `⭐ Rating: ${media.vote_average || 'N/A'}/10\n` +
                `📝 Overview: ${media.overview || 'No description available.'}\n`;

  const torrent = await scrape1337x(title);
  if (torrent) {
    message += `\n<b>Download via Torrent:</b> <a href="${torrent.magnetLink || `${BASE_URL_1337X}${torrent.link}`}">${torrent.quality} (${torrent.size})</a>`;
  } else {
    message += `\nSorry, no torrents found for "${title}" on 1337x.`;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// Send wcofun.net details with streaming links
async function sendWCOFunDetails(chatId, media, type) {
  const title = media.name;
  const releaseDate = media.first_air_date;

  let message = `<b>📺 ${title}</b>\n` +
                `<b>Release Date:</b> ${releaseDate || 'N/A'}\n` +
                `<b>Rating:</b> ${media.vote_average || 'N/A'}/10\n` +
                `<b>Overview:</b> ${media.overview || 'No description available.'}\n`;

  const animeLink = await scrapeWCOFun(title);
  if (animeLink) {
    message += `\n<b>Stream on wcofun.net:</b> <a href="${animeLink.link}">Watch Now</a>`;
  } else {
    message += `\nSorry, no streaming link found for "${title}" on wcofun.net.`;
  }

  const keyboard = animeLink ? [[{ text: 'View Episodes', callback_data: `episodes_${title}_wcofun` }]] : [];
  bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

// Error handling for polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
