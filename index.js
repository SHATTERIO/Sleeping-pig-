const { Telegraf } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

// Bot configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7973795672:AAF3nDQtzUBHOJZ-rmnKUzDJ11Ar5lOgbRQ';
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'ecaa26b48cd983adcac1b1087aebee94';

// Anime sources
const POPULAR_SOURCES = {
  "WCOStream": "https://www.wcostream.tv/",
  "HiAnime": "https://hianime.to/home",
  "AnimePahe": "https://animepahe.ru/",
  "AnimeKai": "https://animekai.to/home"
};

const OTHER_SOURCES = {
  "AnimeHeaven": "https://animeheaven.me/",
  "AnimeOnsen": "https://www.animeonsen.xyz/",
  "AnimeNexus": "https://anime.nexus/",
  "AnimeGG": "https://www.animegg.org/",
  "AnimeZ": "https://animez.org/"
};

const bot = new Telegraf(TELEGRAM_TOKEN);

// Start command
bot.start((ctx) => {
  ctx.reply(
    "Hi! I'm your Anime Info Bot. Send me the name of an anime to get information about it.\n\n" +
    "Use the command /search followed by the anime name. Example:\n" +
    "/search Attack on Titan"
  );
});

// Search command
bot.command('search', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ');
  
  if (!query) {
    return ctx.reply("Please provide an anime name to search. Example: /search Attack on Titan");
  }

  try {
    // First search TMDB for the anime
    const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      return ctx.reply("No anime found with that name. Please try another search.");
    }
    
    const anime = searchResponse.data.results[0];
    
    // Get more details
    const detailsUrl = `https://api.themoviedb.org/3/tv/${anime.id}?api_key=${TMDB_API_KEY}`;
    const detailsResponse = await axios.get(detailsUrl);
    const details = detailsResponse.data;
    
    // Get external IDs (for poster image)
    const externalIdsUrl = `https://api.themoviedb.org/3/tv/${anime.id}/external_ids?api_key=${TMDB_API_KEY}`;
    const externalResponse = await axios.get(externalIdsUrl);
    const externalIds = externalResponse.data;
    
    // Prepare the response message
    const title = details.name || 'N/A';
    const year = details.first_air_date ? details.first_air_date.substring(0, 4) : 'N/A';
    const seasons = details.number_of_seasons || 'N/A';
    const episodes = details.number_of_episodes || 'N/A';
    const overview = details.overview || 'No description available.';
    
    // Calculate total length (assuming average episode length of 24 minutes)
    const totalLengthMin = typeof episodes === 'number' ? episodes * 24 : 'N/A';
    const totalLength = typeof totalLengthMin === 'number' ? `${totalLengthMin} minutes` : 'N/A';
    
    // Get poster image
    const posterPath = details.poster_path;
    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/original${posterPath}` : null;
    
    // Create message text
    const messageText = 
      `🎬 <b>${title}</b> (${year})\n\n` +
      `📺 Seasons: ${seasons}\n` +
      `📺 Episodes: ${episodes}\n` +
      `⏳ Total Length: ${totalLength}\n\n` +
      `📝 <i>${overview}</i>`;
    
    // Create keyboard with sources button
    const keyboard = [
      [{ text: "📺 Streaming Sources", callback_data: `sources_${anime.id}` }]
    ];
    
    // Send message with or without photo
    if (posterUrl) {
      await ctx.replyWithPhoto(
        { url: posterUrl },
        {
          caption: messageText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } else {
      await ctx.reply(
        messageText,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    }
    
  } catch (error) {
    console.error("Error searching anime:", error);
    ctx.reply("Sorry, I encountered an error while searching for that anime. Please try again later.");
  }
});

// Button handler
bot.action(/^sources_/, async (ctx) => {
  const animeId = ctx.match[0].split('_')[1];
  
  // Create buttons for popular sources
  const popularButtons = Object.entries(POPULAR_SOURCES).map(([name, url]) => ({
    text: name,
    url: url
  }));
  
  // Split buttons into rows of 2
  const keyboard = [];
  for (let i = 0; i < popularButtons.length; i += 2) {
    keyboard.push(popularButtons.slice(i, i + 2));
  }
  
  // Add "Other Sources" button
  keyboard.push([{ text: "Other Sources", callback_data: `othersources_${animeId}` }]);
  
  await ctx.editMessageReplyMarkup({
    inline_keyboard: keyboard
  });
  await ctx.answerCbQuery();
});

// Other sources handler
bot.action(/^othersources_/, async (ctx) => {
  const animeId = ctx.match[0].split('_')[1];
  
  // Create buttons for other sources
  const otherButtons = Object.entries(OTHER_SOURCES).map(([name, url]) => ({
    text: name,
    url: url
  }));
  
  // Split buttons into rows of 2
  const keyboard = [];
  for (let i = 0; i < otherButtons.length; i += 2) {
    keyboard.push(otherButtons.slice(i, i + 2));
  }
  
  // Add "Back to Popular" button
  keyboard.push([{ text: "◀️ Back to Popular", callback_data: `sources_${animeId}` }]);
  
  await ctx.editMessageReplyMarkup({
    inline_keyboard: keyboard
  });
  await ctx.answerCbQuery();
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot is running');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
