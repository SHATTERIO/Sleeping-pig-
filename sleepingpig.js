const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// API Keys (replace with your actual keys)
const TELEGRAM_TOKEN = '7741465512:AAGzBMSPa5McuO12TgLkxH-HWfbFRTbkAWM';
const TMDB_API_KEY = 'ecaa26b48cd983adcac1b1087aebee94';

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// TMDB API Base URL
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Function to fetch top 5 trending movies
async function getTrendingMovies() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/day`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data.results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
}

// Function to fetch top 5 trending TV shows
async function getTrendingShows() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/day`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data.results.slice(0, 5);
  } catch (error) {
    console.error('Error fetching trending shows:', error);
    return [];
  }
}

// Function to search for a movie or show by name (return all matches)
async function searchMedia(query) {
  try {
    const results = [];
    const movieResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: { api_key: TMDB_API_KEY, query },
    });
    if (movieResponse.data.results.length > 0) {
      results.push(...movieResponse.data.results.map(data => ({ type: 'movie', data })));
    }
    const tvResponse = await axios.get(`${TMDB_BASE_URL}/search/tv`, {
      params: { api_key: TMDB_API_KEY, query },
    });
    if (tvResponse.data.results.length > 0) {
      results.push(...tvResponse.data.results.map(data => ({ type: 'tv', data })));
    }
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Error searching media:', error);
    return null;
  }
}

// Function to fetch details for a movie or show by ID
async function getMediaDetails(type, id) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/${type}/${id}`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${type} details:`, error);
    return null;
  }
}

// Function to fetch episode details for a series (TV or anime)
async function getEpisodes(tvId, seasonNumber = 1) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data.episodes;
  } catch (error) {
    console.error('Error fetching episodes:', error);
    return [];
  }
}

// Function to generate 1337x search URL
async function getDownloadableContent(type, id, title, seasonNumber = null, episodeNumber = null) {
  try {
    let query = type === 'movie' 
      ? title 
      : `${title} S${String(seasonNumber || 1).padStart(2, '0')}E${String(episodeNumber || 1).padStart(2, '0')}`;
    const searchUrl = `https://1337x.to/search/${encodeURIComponent(query)}/1/`;

    if (type === 'movie') {
      return [{ name: `${title} (Full Movie)`, url: searchUrl }];
    } else if (type === 'tv') {
      const episodes = await getEpisodes(id, seasonNumber || 1);
      if (episodes.length === 0) return [];
      return episodes.map(ep => ({
        name: `S${String(seasonNumber || 1).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')} - ${ep.name}`,
        url: `https://1337x.to/search/${encodeURIComponent(`${title} S${seasonNumber || 1}E${ep.episode_number}`)}/1/`
      }));
    }
    return [];
  } catch (error) {
    console.error('Error generating 1337x URL:', error);
    return [];
  }
}

// Function to format media details with 1337x links
async function formatMediaDetails(media, type) {
  const title = type === 'movie' ? media.title : media.name;
  const releaseDate = type === 'movie' ? media.release_date : media.first_air_date;
  let message = `${type === 'movie' ? '🎬' : '📺'} *${title}* (${type === 'movie' ? 'Movie' : 'TV Show'})\n` +
                `📅 Release Date: ${releaseDate || 'N/A'}\n` +
                `⭐ Rating: ${media.vote_average || 'N/A'} / 10\n` +
                `📝 Overview: ${media.overview || 'No description available.'}\n\n`;

  const content = await getDownloadableContent(type, media.id, title);
  if (content.length > 0) {
    message += '*Available on 1337x:*\n';
    content.forEach(item => {
      message += `[${item.name}](${item.url})\n`;
    });
  } else {
    message += 'No 1337x search links available.\n';
  }

  return message;
}

// Function to format a short preview for selection
function formatMediaPreview(media, type) {
  const title = type === 'movie' ? media.title : media.name;
  const releaseDate = type === 'movie' ? media.release_date : media.first_air_date;
  return `${type === 'movie' ? '🎬' : '📺'} ${title} (${releaseDate ? releaseDate.slice(0, 4) : 'N/A'})`;
}

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const [trendingMovies, trendingShows] = await Promise.all([getTrendingMovies(), getTrendingShows()]);

  if (trendingMovies.length === 0 && trendingShows.length === 0) {
    bot.sendMessage(chatId, 'Sorry, I couldn’t fetch trending media right now.');
    return;
  }

  let message = 'Here are the top 5 trending movies and shows today:\n\n';
  const keyboardOptions = [];

  message += '*Movies:*\n';
  trendingMovies.forEach((movie, index) => {
    message += `${index + 1}. ${movie.title}\n`;
    keyboardOptions.push({ text: `🎬 ${movie.title}`, callback_data: `movie_${movie.id}` });
  });

  message += '\n*TV Shows:*\n';
  trendingShows.forEach((show, index) => {
    message += `${index + 1}. ${show.name}\n`;
    keyboardOptions.push({ text: `📺 ${show.name}`, callback_data: `tv_${show.id}` });
  });

  keyboardOptions.push({ text: '🔍 Search for a Movie or Show', callback_data: 'search' });

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboardOptions.map(option => [option]) },
  });
});

// Handle callback queries (movie/show selection or search)
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === 'search') {
    bot.sendMessage(chatId, 'Please type the name of a movie or show to search:', {
      reply_markup: { force_reply: true },
    });
  } else {
    const [type, id] = data.split('_');
    const media = await getMediaDetails(type, id);
    if (media) {
      const mediaDetails = await formatMediaDetails(media, type);
      bot.sendMessage(chatId, mediaDetails, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, `Sorry, I couldn’t fetch details for this ${type === 'movie' ? 'movie' : 'show'}.`);
    }
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// Handle replies to the search prompt
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) return;

  if (msg.reply_to_message && msg.reply_to_message.text === 'Please type the name of a movie or show to search:') {
    const results = await searchMedia(text);
    if (!results) {
      bot.sendMessage(chatId, `Sorry, I couldn’t find a movie or show called "${text}". Try another name!`);
      return;
    }

    if (results.length === 1) {
      const mediaDetails = await formatMediaDetails(results[0].data, results[0].type);
      bot.sendMessage(chatId, mediaDetails, { parse_mode: 'Markdown' });
    } else {
      let message = `Found multiple matches for "${text}". Please select one:\n\n`;
      const keyboardOptions = results.map((result, index) => ({
        text: formatMediaPreview(result.data, result.type),
        callback_data: `${result.type}_${result.data.id}`,
      }));

      message += results
        .map((result, index) => `${index + 1}. ${formatMediaPreview(result.data, result.type)}`)
        .join('\n');

      bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboardOptions.map(option => [option]) },
      });
    }
  }
});

// Log when the bot starts
console.log('Bot is running...');
