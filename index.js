const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');

// API Keys and Configuration
const TELEGRAM_TOKEN = '7741465512:AAGzBMSPa5McuO12TgLkxH-HWfbFRTbkAWM'; // Updated token
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL_1337X = 'https://1337x.to';
const BASE_URL_WCOFUN = 'https://www.wcofun.net';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// In-memory cache and user selections
let cache = {};
let userSelections = {};

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

    // Show anime sources
    if (data === 'anime_sources') {
      const animeSourcesOptions = [
        [{ text: 'AnimeKai', url: 'https://animekai.to/home' }],
        [{ text: 'AnimePahe', url: 'https://animepahe.ru/' }],
        [{ text: 'HiAnime', url: 'https://hianime.tv/' }],
        [{ text: 'AnimeZ', url: 'https://animez.org/' }],
        [{ text: 'WCOStream', url: 'https://www.wcostream.tv/' }],
        [{ text: '9anime', url: 'https://9anime.to/' }],
        [{ text: 'Animesuge', url: 'https://animesuge.to/' }],
        [{ text: 'Animeonsen', url: 'https://animeonsen.xyz/' }],
        [{ text: 'Back', callback_data: 'back_to_start' }],
      ];
      bot.sendMessage(chatId, '🏴‍☠️ Anime Sources:', {
        reply_markup: { inline_keyboard: animeSourcesOptions },
      });
    }
    // Show cartoon sources
    else if (data === 'cartoon_sources') {
      const cartoonSourcesOptions = [
        [{ text: 'Kimcartoon', url: 'https://kimcartoon.li/' }],
        [{ text: 'WCOFun', url: 'https://www.wcofun.net/' }],
        [{ text: 'Steven Universe Cartoons', url: 'https://stevenuniverse.best/cartoons/' }],
        [{ text: 'Back', callback_data: 'back_to_start' }],
      ];
      bot.sendMessage(chatId, '🏴‍☠️ Cartoon Sources:', {
        reply_markup: { inline_keyboard: cartoonSourcesOptions },
      });
    }
    // Show movie/series sources
    else if (data === 'movie_series_sources') {
      const movieSeriesSourcesOptions = [
        [{ text: '1337x', url: 'https://1337x.to/home/' }],
        [{ text: 'SFlix', url: 'https://sflix.to/' }],
        [{ text: 'Soap2Day', url: 'https://ww25.soap2day.day/' }],
        [{ text: '123Movies', url: 'https://ww4.123moviesfree.net/' }],
        [{ text: 'YTS', url: 'https://yts.mx/' }],
        [{ text: 'RARBG', url: 'https://rarbg.to/' }],
        [{ text: 'Back', callback_data: 'back_to_start' }],
      ];
      bot.sendMessage(chatId, '🏴‍☠️ Movie/Series Sources:', {
        reply_markup: { inline_keyboard: movieSeriesSourcesOptions },
      });
    }
    // Back to start menu
    else if (data === 'back_to_start') {
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
    }
    // Scrape 1337x
    else if (data === 'scrape_1337x') {
      const [trendingMovies, trendingShows] = await Promise.all([getTrendingMovies(), getTrendingShows()]);
      if (trendingMovies.length === 0 && trendingShows.length === 0) {
        bot.sendMessage(chatId, 'Oops! I couldn’t fetch trending movies or shows for 1337x.');
        return;
      }

      const keyboardOptions = [];
      if (trendingMovies.length) {
        keyboardOptions.push([{ text: '🎬 Trending Movies:', callback_data: 'noop' }]);
        keyboardOptions.push(...trendingMovies.map((movie) => [{ text: movie.title, callback_data: `movie_${movie.id}_1337x` }]));
      }
      if (trendingShows.length) {
        keyboardOptions.push([{ text: '📺 Trending TV Shows:', callback_data: 'noop' }]);
        keyboardOptions.push(...trendingShows.map((show) => [{ text: show.name, callback_data: `tv_${show.id}_1337x` }]));
      }
      keyboardOptions.push([{ text: '🔍 Search 1337x', callback_data: 'search_1337x' }]);

      bot.sendMessage(chatId, 'Select a trending movie or show to scrape from 1337x:', {
        reply_markup: { inline_keyboard: keyboardOptions },
      });
    }
    // Scrape wcofun.net
    else if (data === 'scrape_wcofun') {
      const trendingAnime = await getTrendingAnime();
      if (trendingAnime.length === 0) {
        bot.sendMessage(chatId, 'Oops! I couldn’t fetch trending anime for wcofun.net.');
        return;
      }

      const keyboardOptions = [
        [{ text: '📺 Trending Anime:', callback_data: 'noop' }],
        ...trendingAnime.map((anime) => [{ text: anime.name, callback_data: `tv_${anime.id}_wcofun` }]),
        [{ text: '🔍 Search wcofun.net', callback_data: 'search_wcofun' }],
      ];

      bot.sendMessage(chatId, 'Select a trending anime to scrape from wcofun.net:', {
        reply_markup: { inline_keyboard: keyboardOptions },
      });
    }
    // Search prompts
    else if (data === 'search_1337x' || data === 'search_wcofun') {
      bot.sendMessage(chatId, `Please type the name of a ${data === 'search_1337x' ? 'movie/show' : 'anime'} to search:`, {
        reply_markup: { force_reply: true },
      });
    }
    // Handle scraping selections
    else {
      const [type, id, source] = data.split('_');
      const media = await getMediaDetails(type, id);
      if (media) {
        userSelections[userId] = { type, id, source };
        if (source === '1337x') {
          await send1337xDetails(chatId, media, type);
        } else if (source === 'wcofun') {
          await sendWCOFunDetails(chatId, media, type);
        }
      } else {
        bot.sendMessage(chatId, `Sorry, I couldn’t fetch details for this ${type === 'movie' ? 'movie' : 'show'}.`);
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

  if (msg.reply_to_message && msg.reply_to_message.text.includes('Please type the name')) {
    try {
      if (!text || text.trim() === '') {
        bot.sendMessage(chatId, 'Please provide a valid search term!');
        return;
      }

      const is1337xSearch = msg.reply_to_message.text.includes('movie/show');
      const results = is1337xSearch ? await searchMedia(text) : await searchAnime(text);
      if (!results) {
        bot.sendMessage(chatId, `Sorry, I couldn’t find anything for "${text}". Check the spelling or try another name!`);
        return;
      }

      if (results.length === 1) {
        userSelections[userId] = { type: results[0].type, id: results[0].data.id, source: is1337xSearch ? '1337x' : 'wcofun' };
        if (is1337xSearch) {
          await send1337xDetails(chatId, results[0].data, results[0].type);
        } else {
          await sendWCOFunDetails(chatId, results[0].data, results[0].type);
        }
      } else {
        const keyboardOptions = results.map((result) => [
          {
            text: formatMediaPreview(result.data, result.type),
            callback_data: `${result.type}_${result.data.id}_${is1337xSearch ? '1337x' : 'wcofun'}`,
          },
        ]);
        bot.sendMessage(chatId, `Found multiple matches for "${text}". Select one:`, {
          reply_markup: { inline_keyboard: keyboardOptions },
        });
      }
    } catch (error) {
      console.error('Search handler error:', error);
      bot.sendMessage(chatId, 'Something went wrong while searching.');
    }
  }
});

// Fetch trending movies (for 1337x)
async function getTrendingMovies() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/day`, { params: { api_key: TMDB_API_KEY } });
    return response.data.results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending movies:', error.message);
    return [];
  }
}

// Fetch trending shows (for 1337x)
async function getTrendingShows() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/day`, { params: { api_key: TMDB_API_KEY } });
    return response.data.results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending shows:', error.message);
    return [];
  }
}

// Fetch trending anime (for wcofun.net)
async function getTrendingAnime() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/day`, { params: { api_key: TMDB_API_KEY } });
    return response.data.results.filter((show) => show.origin_country.includes('JP')).slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending anime:', error.message);
    return [];
  }
}

// Search TMDB for movies and shows (for 1337x)
async function searchMedia(query) {
  try {
    const results = [];
    const movieResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params: { api_key: TMDB_API_KEY, query } });
    if (movieResponse.data.results.length > 0) {
      results.push(...movieResponse.data.results.map((data) => ({ type: 'movie', data })));
    }
    const tvResponse = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params: { api_key: TMDB_API_KEY, query } });
    if (tvResponse.data.results.length > 0) {
      results.push(...tvResponse.data.results.map((data) => ({ type: 'tv', data })));
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
    const response = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params: { api_key: TMDB_API_KEY, query } });
    const results = response.data.results
      .filter((show) => show.origin_country.includes('JP'))
      .map((data) => ({ type: 'tv', data }));
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Error searching anime:', error.message);
    return null;
  }
}

// Fetch detailed media info from TMDB
async function getMediaDetails(type, id) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/${type}/${id}`, { params: { api_key: TMDB_API_KEY } });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${type} details for ID ${id}:`, error.message);
    return null;
  }
}

// Scrape 1337x for torrents
async function scrape1337x(query) {
  const searchUrl = `${BASE_URL_1337X}/search/${encodeURIComponent(query)}/1/`;
  try {
    const searchResponse = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    });
    const $ = cheerio.load(searchResponse.data);
    const results = [];

    $('table.table-list tbody tr').each((_, element) => {
      const name = $(element).find('td.name a:nth-child(2)').text().trim();
      const link = $(element).find('td.name a:nth-child(2)').attr('href');
      const seeds = parseInt($(element).find('td.seeds').text().trim()) || 0;
      const size = $(element).find('td.size').text().trim().split(' ')[0] + ' ' + ($(element).find('td.size').text().trim().split(' ')[1] || 'GB');

      if (name && link) {
        results.push({ name, link, seeds, size, quality: extractQuality(name) });
      }
    });

    if (results.length === 0) return null;
    results.sort((a, b) => b.seeds - a.seeds);
    const bestTorrent = results[0];

    const torrentPageUrl = `${BASE_URL_1337X}${bestTorrent.link}`;
    const torrentPageResponse = await axios.get(torrentPageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    });
    const $$ = cheerio.load(torrentPageResponse.data);
    const magnetLink = $$('a[href^="magnet:"]').first().attr('href');

    return magnetLink ? { ...bestTorrent, magnetLink } : bestTorrent;
  } catch (error) {
    console.error('1337x scraping error:', error.message);
    return null;
  }
}

// Scrape wcofun.net for anime links
async function scrapeWCOFun(query) {
  try {
    const response = await axios.get(BASE_URL_WCOFUN, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    });
    const $ = cheerio.load(response.data);
    const results = [];

    $('a').each((_, element) => {
      const title = $(element).text().trim();
      const link = $(element).attr('href');
      if (title && link && title.toLowerCase().includes(query.toLowerCase())) {
        results.push({ title, link: link.startsWith('http') ? link : `${BASE_URL_WCOFUN}${link}` });
      }
    });

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('wcofun.net scraping error:', error.message);
    return null;
  }
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

  let message =
    `<b>${type === 'movie' ? '🎬' : '📺'} ${title}</b>\n\n` +
    `📅 Release: ${releaseDate || 'N/A'}\n\n` +
    `⭐ Rating: ${media.vote_average || 'N/A'}/10\n\n` +
    `📝 Overview: ${media.overview || 'No description available.'}\n`;

  const torrent = await scrape1337x(title);
  if (torrent) {
    message += `\nQuality: ${torrent.quality}\n` + `Size: ${torrent.size}\n` + `<a href="${BASE_URL_1337X}${torrent.link}">View on 1337x</a>`;
    if (torrent.magnetLink) {
      message += `\n<a href="${torrent.magnetLink}">Download Magnet</a>`;
    }
  } else {
    message += `\nSorry, no torrents found for "${title}" on 1337x.`;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// Send wcofun.net details with streaming links
async function sendWCOFunDetails(chatId, media, type) {
  const title = media.name;
  const releaseDate = media.first_air_date;

  let message =
    `<b>📺 ${title}</b>\n\n` +
    `📅 Release: ${releaseDate || 'N/A'}\n\n` +
    `⭐ Rating: ${media.vote_average || 'N/A'}/10\n\n` +
    `📝 Overview: ${media.overview || 'No description available.'}\n`;

  const animeLink = await scrapeWCOFun(title);
  if (animeLink) {
    message += `\n<a href="${animeLink.link}">Watch on wcofun.net</a>`;
  } else {
    message += `\nSorry, no streaming link found for "${title}" on wcofun.net.`;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// Error handling for polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
