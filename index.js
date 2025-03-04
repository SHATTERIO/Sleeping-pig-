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
let userSelections = {};

// Handle /start command with main menu (remains unchanged)
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

// Helper function to scrape wcofun.net episodes
async function scrapeWCOFunEpisodes(title) {
  const cacheKey = 'wcofun_episodes_' + title.toLowerCase().replace(/\s+/g, '_');
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 300000) return cached.data;

  try {
    // Search for the anime page on wcofun.net
    const searchUrl = `${BASE_URL_WCOFUN}/search?keyword=${encodeURIComponent(title)}`;
    const searchResponse = await axios.get(searchUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' }, 
      timeout: 5000 
    });
    const $ = cheerio.load(searchResponse.data);
    
    // Find the first matching anime link
    const animeLink = $('a.video-block').filter((_, el) => 
      $(el).text().toLowerCase().includes(title.toLowerCase())
    ).first().attr('href');

    if (!animeLink) {
      console.log(`No anime page found for: ${title}`);
      return [];
    }

    // Visit the anime page to scrape episodes
    const fullAnimeUrl = animeLink.startsWith('http') ? animeLink : `${BASE_URL_WCOFUN}${animeLink}`;
    const animeResponse = await axios.get(fullAnimeUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' }, 
      timeout: 5000 
    });
    const $$ = cheerio.load(animeResponse.data);

    // Extract episodes
    const episodes = $$('.video-block').map((_, el) => {
      const episodeLink = $$(el).attr('href');
      const episodeTitle = $$(el).text().trim();
      
      // Ensure full URL
      const fullEpisodeLink = episodeLink.startsWith('http') 
        ? episodeLink 
        : `${BASE_URL_WCOFUN}${episodeLink}`;
      
      return {
        title: episodeTitle,
        link: fullEpisodeLink
      };
    }).get();

    // Cache the results
    cache[cacheKey] = { 
      data: episodes, 
      timestamp: Date.now() 
    };

    return episodes;
  } catch (error) {
    console.error(`Error scraping episodes for ${title}:`, error.message);
    return [];
  }
}

// Modify callback query handler to support episode navigation
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // Acknowledge callback immediately
  bot.answerCallbackQuery(callbackQuery.id);

  try {
    // Existing code from original handler...

    // New episode navigation handling
    else if (data.startsWith('episodes_')) {
      const [_, title] = data.split('_');
      const episodes = await scrapeWCOFunEpisodes(title);

      if (episodes.length === 0) {
        bot.sendMessage(chatId, `Unable to retrieve episodes for "${title}"`);
        return;
      }

      // Group episodes by season if possible
      const episodesBySeason = {};
      episodes.forEach(episode => {
        // Basic season extraction from episode title
        const seasonMatch = episode.title.match(/season\s*(\d+)/i);
        const seasonKey = seasonMatch ? `Season ${seasonMatch[1]}` : 'Season 1';
        
        if (!episodesBySeason[seasonKey]) {
          episodesBySeason[seasonKey] = [];
        }
        episodesBySeason[seasonKey].push(episode);
      });

      const seasonKeys = Object.keys(episodesBySeason);
      
      // If multiple seasons, show season selection
      if (seasonKeys.length > 1) {
        const seasonButtons = seasonKeys.map(season => [
          { 
            text: season, 
            callback_data: `season_${title}_${season.replace(' ', '_')}` 
          }
        ]);
        seasonButtons.push([{ text: 'Back to Info', callback_data: `info_${title}_wcofun` }]);

        bot.sendMessage(chatId, 'Select a season:', { 
          reply_markup: { inline_keyboard: seasonButtons } 
        });
      } 
      // If only one season or can't determine seasons, show all episodes
      else {
        const firstSeason = seasonKeys[0];
        const episodeButtons = episodesBySeason[firstSeason].map((ep, i) => [
          { 
            text: `Episode ${i + 1}`, 
            url: ep.link 
          }
        ]);
        episodeButtons.push([{ text: 'Back to Info', callback_data: `info_${title}_wcofun` }]);

        bot.sendMessage(chatId, 'Episodes:', { 
          reply_markup: { inline_keyboard: episodeButtons } 
        });
      }
    }
    // Handle season selection
    else if (data.startsWith('season_')) {
      const [_, title, seasonKey] = data.split('_');
      const episodes = await scrapeWCOFunEpisodes(title);
      
      const season = seasonKey.replace('_', ' ');
      const seasonEpisodes = episodes.filter(ep => 
        ep.title.toLowerCase().includes(season.toLowerCase())
      );

      const episodeButtons = seasonEpisodes.map((ep, i) => [
        { 
          text: `Episode ${i + 1}`, 
          url: ep.link 
        }
      ]);
      episodeButtons.push([{ text: 'Back to Seasons', callback_data: `episodes_${title}` }]);

      bot.sendMessage(chatId, `${season} Episodes:`, { 
        reply_markup: { inline_keyboard: episodeButtons } 
      });
    }
  } catch (error) {
    console.error('Callback error:', error);
    bot.sendMessage(chatId, 'An error occurred while processing your request.');
  }
});

// Modify sendWCOFunDetails to conditionally add episode button
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

  // Only add episodes button if episodes can be scraped
  const episodes = await scrapeWCOFunEpisodes(title);
  const keyboard = episodes.length > 0 
    ? [[{ text: 'View Episodes', callback_data: `episodes_${title}` }]] 
    : [];

  bot.sendMessage(chatId, message, { 
    parse_mode: 'HTML', 
    reply_markup: { inline_keyboard: keyboard } 
  });
}

// Rest of the code remains the same as in the original implementation...

// Error handling for polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
