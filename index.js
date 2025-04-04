const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// API Keys and Configuration
const TELEGRAM_TOKEN = '7741465512:AAFyg3go2dnTSA323kDvJPPcgDrrcIT3KKc';
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL_1337X = 'https://1337x.to';
const BACKUP_CHANNEL_ID = '-1002253889296'; // Your backup channel ID
const CACHE_FILE = 'cache.json';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Load or initialize cache and user selections
let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE)) : {};
let userSelections = {}; // Store last selected show per user

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

// Handle /start command with trending list
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const [trendingMovies, trendingShows] = await Promise.all([getTrendingMovies(), getTrendingShows()]);
    if (trendingMovies.length === 0 && trendingShows.length === 0) {
      bot.sendMessage(chatId, 'Oops! I couldn’t fetch trending movies or shows right now. Try again later.');
      return;
    }

    const keyboardOptions = [];
    if (trendingMovies.length) {
      keyboardOptions.push([{ text: '🎬 Trending Movies:', callback_data: 'noop' }]);
      keyboardOptions.push(...trendingMovies.map(movie => [{ text: movie.title, callback_data: `movie_${movie.id}` }]));
    }
    if (trendingShows.length) {
      keyboardOptions.push([{ text: '📺 Trending TV Shows:', callback_data: 'noop' }]);
      keyboardOptions.push(...trendingShows.map(show => [{ text: show.name, callback_data: `tv_${show.id}` }]));
    }
    keyboardOptions.push([{ text: '🔍 Search for More', callback_data: 'search' }]);

    bot.sendMessage(chatId, 'Here are some trending movies and series available to scrape:', {
      reply_markup: { inline_keyboard: keyboardOptions }
    });
  } catch (error) {
    console.error('Error in /start command:', error);
    bot.sendMessage(chatId, 'Something went wrong while fetching trending content.');
  }
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

    if (data === 'search') {
      bot.sendMessage(chatId, 'Please type the name of a movie or show to search:', {
        reply_markup: { force_reply: true }
      });
    } else if (data === 'cancel') {
      bot.sendMessage(chatId, 'Action canceled.');
    } else {
      const [type, id] = data.split('_');
      const media = await getMediaDetails(type, id);
      if (media) {
        userSelections[userId] = { type, id }; // Store user's selection
        await sendMediaDetails(chatId, media, type);
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

// Handle manual search replies and torrent downloads
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (text && text.startsWith('/')) return;

  if (msg.reply_to_message && msg.reply_to_message.text === 'Please type the name of a movie or show to search:') {
    try {
      if (!text || text.trim() === '') {
        bot.sendMessage(chatId, 'Please provide a valid search term!');
        return;
      }

      const results = await searchMedia(text);
      if (!results) {
        bot.sendMessage(chatId, `Sorry, I couldn’t find anything for "${text}". Check the spelling or try another name!`);
        return;
      }

      if (results.length === 1) {
        userSelections[userId] = { type: results[0].type, id: results[0].data.id }; // Store selection
        await sendMediaDetails(chatId, results[0].data, results[0].type);
      } else {
        const keyboardOptions = results.map((result) => ([{
          text: formatMediaPreview(result.data, result.type),
          callback_data: `${result.type}_${result.data.id}`
        }]));
        bot.sendMessage(chatId, `Found multiple matches for "${text}". Select one:`, {
          reply_markup: { inline_keyboard: keyboardOptions }
        });
      }
    } catch (error) {
      console.error('Search handler error:', error);
      bot.sendMessage(chatId, 'Something went wrong while searching.');
    }
  }

  if (msg.reply_to_message && msg.reply_to_message.text === 'Please paste the torrent magnet link:') {
    try {
      const torrentLink = text.trim();
      if (!torrentLink.startsWith('magnet:')) {
        bot.sendMessage(chatId, 'Invalid magnet link. Please provide a valid magnet link.');
        return;
      }

      const showTitle = extractTitleFromLink(torrentLink);
      const cached = checkCache(showTitle);
      if (cached) {
        bot.sendMessage(chatId, `This show is cached! Here’s the link: https://t.me/c${BACKUP_CHANNEL_ID}/${cached.messageId}`);
        return;
      }

      bot.sendMessage(chatId, 'Downloading torrent... This might take a while.');
      await downloadAndUploadTorrent(chatId, torrentLink, showTitle);
    } catch (error) {
      console.error('Torrent handling error:', error);
      bot.sendMessage(chatId, 'Failed to process the torrent.');
    }
  }
});

// Handle /copy command
bot.onText(/\/copy/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Please paste the torrent magnet link:', { reply_markup: { force_reply: true } });
});

// Handle /mag command
bot.onText(/\/mag/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!userSelections[userId]) {
    bot.sendMessage(chatId, 'Please select a show first using /start or search.');
    return;
  }

  const { type, id } = userSelections[userId];
  const media = await getMediaDetails(type, id);
  if (!media) {
    bot.sendMessage(chatId, 'Couldn’t fetch details for your last selected show.');
    return;
  }

  const title = type === 'movie' ? media.title : media.name;
  const torrent = await scrape1337x(title);
  if (torrent && torrent.magnetLink) {
    bot.sendMessage(chatId, torrent.magnetLink); // Plain text magnet link
  } else {
    bot.sendMessage(chatId, `No magnet link found for "${title}".`);
  }
});

// Fetch trending movies
async function getTrendingMovies() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/day`, { params: { api_key: TMDB_API_KEY } });
    return response.data.results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending movies:', error.message);
    return [];
  }
}

// Fetch trending shows
async function getTrendingShows() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/day`, { params: { api_key: TMDB_API_KEY } });
    return response.data.results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending shows:', error.message);
    return [];
  }
}

// Search TMDB for movies and shows
async function searchMedia(query) {
  try {
    const results = [];
    const movieResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params: { api_key: TMDB_API_KEY, query } });
    if (movieResponse.data.results.length > 0) {
      results.push(...movieResponse.data.results.map(data => ({ type: 'movie', data })));
    }
    const tvResponse = await axios.get(`${TMDB_BASE_URL}/search/tv`, { params: { api_key: TMDB_API_KEY, query } });
    if (tvResponse.data.results.length > 0) {
      results.push(...tvResponse.data.results.map(data => ({ type: 'tv', data })));
    }
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Error searching media:', error.message);
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

// Scrape 1337x for torrents (returns best available torrent with magnet link)
async function scrape1337x(query) {
  const searchUrl = `${BASE_URL_1337X}/search/${encodeURIComponent(query)}/1/`;
  try {
    const searchResponse = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
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
      timeout: 10000
    });
    const $$ = cheerio.load(torrentPageResponse.data);
    const magnetLink = $$('a[href^="magnet:"]').first().attr('href');

    return magnetLink ? { ...bestTorrent, magnetLink } : bestTorrent;
  } catch (error) {
    console.error('Scraping error:', error.message);
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

// Send media details with clickable 1337x links using HTML
async function sendMediaDetails(chatId, media, type) {
  const title = type === 'movie' ? media.title : media.name;
  const releaseDate = type === 'movie' ? media.release_date : media.first_air_date;

  let message = `<b>${type === 'movie' ? '🎬' : '📺'} ${title}</b>\n\n` +
                `📅 Release: ${releaseDate || 'N/A'}\n\n` +
                `⭐ Rating: ${media.vote_average || 'N/A'}/10\n\n` +
                `📝 Overview: ${media.overview || 'No description available.'}\n`;

  const torrent = await scrape1337x(title);
  if (torrent) {
    message += `\nQuality: ${torrent.quality}\n` +
               `Size: ${torrent.size}\n` +
               `<a href="${BASE_URL_1337X}${torrent.link}">View on 1337x</a>`;
    if (torrent.magnetLink) {
      message += `\n<a href="${torrent.magnetLink}">Download Magnet</a>\n` +
                 `Use /mag to get the magnet link in plain text or /copy to download!`;
    }
  } else {
    message += `\nSorry, no torrents found for "${title}".`;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// Extract title from magnet link
function extractTitleFromLink(link) {
  const match = link.match(/dn=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : 'Unknown';
}

// Download and upload torrent
async function downloadAndUploadTorrent(chatId, torrentLink, showTitle) {
  try {
    const WebTorrent = (await import('webtorrent')).default;
    const torrentClient = new WebTorrent();

    return new Promise((resolve, reject) => {
      torrentClient.add(torrentLink, (torrent) => {
        const file = torrent.files.find(f => f.name.match(/\.(mp4|mkv|avi)$/i));
        if (!file) {
          bot.sendMessage(chatId, 'No suitable video file found in the torrent.');
          reject(new Error('No video file'));
          return;
        }

        const filePath = `/tmp/${showTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${file.name}`;
        const writeStream = fs.createWriteStream(filePath);
        file.createReadStream().pipe(writeStream);

        torrent.on('done', async () => {
          const stats = fs.statSync(filePath);
          if (stats.size > 50 * 1024 * 1024) { // 50MB limit
            bot.sendMessage(chatId, 'File exceeds 50MB and cannot be uploaded.');
            fs.unlinkSync(filePath);
            reject(new Error('File too large'));
            return;
          }

          try {
            const mainUpload = await bot.sendDocument(chatId, filePath, { caption: showTitle });
            const backupUpload = await bot.sendDocument(BACKUP_CHANNEL_ID, filePath, { caption: showTitle });

            cache[showTitle] = { messageId: backupUpload.message_id };
            saveCache();

            bot.sendMessage(chatId, 'Upload complete! Check the channels.');
            resolve();
          } catch (uploadError) {
            bot.sendMessage(chatId, 'Failed to upload the file.');
            reject(uploadError);
          } finally {
            fs.unlinkSync(filePath);
          }
        });

        torrent.on('error', (err) => {
          bot.sendMessage(chatId, 'Torrent download failed.');
          reject(err);
        });
      });
    });
  } catch (error) {
    throw new Error(`WebTorrent error: ${error.message}`);
  }
}

// Cache handling
function checkCache(showTitle) {
  return cache[showTitle] || null;
}

// Error handling for polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
