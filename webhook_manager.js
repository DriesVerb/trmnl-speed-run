const https = require('https');

// ==========================================
// CONFIGURATION: Add your target game leaderboards and TRMNL webhook keys here
// ==========================================
const MONITOR_TARGETS = [
  {
    game: 'sm64',
    category: '120_star',
    webhook_url: 'https://usetrmnl.com/api/v1/plugins/YOUR_FIRST_PLUGIN_UUID',
    api_key: 'YOUR_FIRST_API_KEY'
  },
  {
    game: 'sms',
    category: 'any_percent',
    webhook_url: 'https://usetrmnl.com/api/v1/plugins/YOUR_SECOND_PLUGIN_UUID',
    api_key: 'YOUR_SECOND_API_KEY'
  }
  // You can add as many games/categories as you want here
];

// Simple helper to fetch JSON from an HTTPS URL and follow redirects
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'TRMNL-Speedrun-Tracker/1.0'
      }
    };
    https.get(url, options, (res) => {
      // Handle redirects (Speedrun.com API uses redirects heavily)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsedUrl = new URL(url);
          redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
        }
        return fetchJSON(redirectUrl).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Server returned status code ${res.statusCode}`));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Convert seconds (e.g. 5854) to readable time format (e.g. 1h 37m 34s)
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs}h ${mins}m ${secs}s`;
}

// Compute days elapsed since record was set
function getDaysAgo(dateString) {
  const wrDate = new Date(dateString);
  const today = new Date();
  const diffTime = Math.abs(today - wrDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Truncate rules text to fit neatly inside the screen
function truncateRules(text, limit = 160) {
  if (!text) return 'No category rules specified.';
  let cleanText = text.replace(/[\[\]]/g, '').replace(/\(http\S+\)/g, '');
  if (cleanText.length <= limit) return cleanText;
  return cleanText.slice(0, limit) + '...';
}

function normalizeCategoryKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWeblinkSlug(weblink) {
  if (!weblink) return '';
  const match = String(weblink).match(/[?&]h=([^&#]+)/i);
  return match ? normalizeCategoryKey(decodeURIComponent(match[1])) : '';
}

// Resolve category name/slug or ID to Speedrun.com's required category ID
async function resolveCategoryId(game, categoryInput) {
  const categoriesUrl = `https://www.speedrun.com/api/v1/games/${encodeURIComponent(game)}/categories`;
  const res = await fetchJSON(categoriesUrl);
  const categories = Array.isArray(res.data) ? res.data.filter(c => c.type === 'per-game') : [];
  if (categories.length === 0) {
    throw new Error(`No full-game categories found for '${game}'.`);
  }

  const raw = String(categoryInput || '').trim();
  const lower = raw.toLowerCase();
  const norm = normalizeCategoryKey(raw);

  const match =
    categories.find(c => c.id.toLowerCase() === lower) ||
    categories.find(c => normalizeCategoryKey(c.name) === norm) ||
    categories.find(c => extractWeblinkSlug(c.weblink) === norm) ||
    categories.find(c => normalizeCategoryKey(c.name).includes(norm));

  if (!match) {
    throw new Error(`Category '${categoryInput}' not found for '${game}'.`);
  }
  return match.id;
}

// Fetch a single target and push it to TRMNL
async function processTarget(target) {
  const { game, category, webhook_url, api_key } = target;
  console.log(`Processing speedrun data for: ${game.toUpperCase()} (${category})`);

  try {
    const categoryId = await resolveCategoryId(game, category);
    const apiURL = `https://www.speedrun.com/api/v1/leaderboards/${encodeURIComponent(game)}/category/${encodeURIComponent(categoryId)}?embed=players,game.platforms,category&top=3`;
    const apiData = await fetchJSON(apiURL);
    const leaderboard = apiData.data;

    const gameName = leaderboard.game.data.names.international;
    const categoryName = leaderboard.category.data.name;
    const assets = leaderboard.game.data.assets || {};
    const coverImage = assets['cover-medium'] ? assets['cover-medium'].uri : null;
    const logoImage = assets['logo'] ? assets['logo'].uri : null;
    const iconImage = assets['icon'] ? assets['icon'].uri : null;
    const trophyImage = assets['trophy-1st'] ? assets['trophy-1st'].uri : null;
    const releasedYear = leaderboard.game.data.released || 'N/A';
    const rawRulesText = leaderboard.category.data.rules;
    const rulesSummary = truncateRules(rawRulesText, 160);

    // Resolve platform names
    let platformsList = 'N/A';
    if (leaderboard.game.data.platforms && leaderboard.game.data.platforms.data) {
      platformsList = leaderboard.game.data.platforms.data.map(p => p.name).slice(0, 3).join(', ');
    }

    const totalRuns = leaderboard.runs.length;

    // Resolve user IDs to usernames
    const playersMap = {};
    if (leaderboard.players && Array.isArray(leaderboard.players.data)) {
      leaderboard.players.data.forEach(p => {
        let name = p.names ? p.names.international : (p.name || 'Guest');
        if (name && name.toLowerCase() === 'not applicable') {
          name = 'Guest';
        }
        if (p.id) playersMap[p.id] = name;
      });
    }

    // Parse top 3 runs
    const topRuns = leaderboard.runs.slice(0, 3).map(r => {
      const playerRef = Array.isArray(r.run.players) ? r.run.players[0] : null;
      let runnerName = 'Guest';
      if (playerRef) {
        runnerName = playerRef.rel === 'user' ? (playersMap[playerRef.id] || 'Unknown') : (playerRef.name || 'Guest');
        if (runnerName && runnerName.toLowerCase() === 'not applicable') {
          runnerName = 'Guest';
        }
      }
      return {
        place: r.place,
        runner: runnerName || 'Unknown',
        time: formatDuration(r.run.times ? r.run.times.primary_t : 0),
        date: r.run.date || (r.run.submitted ? r.run.submitted.slice(0, 10) : 'N/A')
      };
    });

    const wrRun = topRuns[0];
    if (!wrRun) {
      throw new Error('No runs found for this leaderboard.');
    }
    const daysAgo = getDaysAgo(wrRun.date);

    // Build TRMNL Webhook Payload
    const trmnlPayload = {
      merge_variables: {
        game_name: gameName,
        category_name: categoryName,
        cover_image: coverImage,
        logo_image: logoImage,
        icon_image: iconImage,
        trophy_image: trophyImage,
        wr_time: wrRun.time,
        wr_holder: wrRun.runner,
        wr_days_ago: daysAgo,
        wr_date: wrRun.date,
        released_year: releasedYear,
        platforms: platformsList,
        total_runs: totalRuns,
        rules_summary: rulesSummary,
        top_runs: topRuns
      }
    };

    // Send payload to TRMNL Webhook
    await sendToTrmnl(webhook_url, api_key, trmnlPayload);
    console.log(`Success! Sent update for ${game.toUpperCase()}`);

  } catch (error) {
    console.error(`Error processing target ${game.toUpperCase()}: ${error.message}`);
  }
}

// Promise helper to send update payload to TRMNL Webhook endpoint
function sendToTrmnl(webhookUrl, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(webhookUrl);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`TRMNL returned HTTP status ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Process all targets sequentially
async function runAll() {
  console.log(`Starting TRMNL Speedrun update run at: ${new Date().toISOString()}`);
  for (const target of MONITOR_TARGETS) {
    await processTarget(target);
  }
  console.log('Update run complete.');
}

// Execute
runAll();
