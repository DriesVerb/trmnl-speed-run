/**
 * TRMNL Sandbox Transformer JS
 * Copy-paste this function into the "Transform" tab of the TRMNL developer portal.
 * Set the Polling URL to:
 * https://www.speedrun.com/api/v1/games/{{game}}/records?top=3&scope=full-game&embed=players,game.platforms,category&max=200
 * (Also backwards-compatible with /api/v1/leaderboards/{game}/category/{categoryId}?embed=players,game.platforms,category&top=3)
 */
function transform(input) {
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

  function selectLeaderboard(rawInput, requestedCategory) {
    if (!rawInput) {
      return { error: "Empty response payload from Speedrun.com." };
    }
    if ((typeof rawInput.status === 'number' && rawInput.status >= 400) || (!rawInput.data && rawInput.message)) {
      return { error: rawInput.message || `Speedrun.com API returned status ${rawInput.status}.` };
    }

    const root = rawInput.data !== undefined ? rawInput.data : rawInput;

    // Shape A: /api/v1/games/{game}/records returns an array of leaderboards
    if (Array.isArray(root)) {
      const valid = root.filter(lb => lb && lb.game && lb.game.data);
      if (valid.length === 0) {
        return { error: "No leaderboards found for this game on Speedrun.com." };
      }

      const rawReq = String(requestedCategory || '').trim();
      if (!rawReq) {
        const firstWithRuns = valid.find(lb => Array.isArray(lb.runs) && lb.runs.length > 0);
        return { leaderboard: firstWithRuns || valid[0] };
      }

      const reqLower = rawReq.toLowerCase();
      const normReq = normalizeCategoryKey(rawReq);

      let matched = valid.find(lb => (lb.category && lb.category.data && lb.category.data.id || '').toLowerCase() === reqLower);
      if (!matched) {
        matched = valid.find(lb => normalizeCategoryKey(lb.category && lb.category.data && lb.category.data.name) === normReq);
      }
      if (!matched) {
        matched = valid.find(lb => extractWeblinkSlug(lb.category && lb.category.data && lb.category.data.weblink) === normReq);
      }
      if (!matched) {
        matched = valid.find(lb => {
          const name = normalizeCategoryKey(lb.category && lb.category.data && lb.category.data.name);
          return name && (name.includes(normReq) || normReq.includes(name));
        });
      }

      if (!matched) {
        const available = valid
          .map(lb => lb.category && lb.category.data && lb.category.data.name)
          .filter(Boolean)
          .slice(0, 8)
          .join(', ');
        return { error: `Category '${rawReq}' not found. Available: ${available}` };
      }

      return { leaderboard: matched };
    }

    // Shape B: /api/v1/leaderboards/{game}/category/{categoryId} returns a single leaderboard
    if (root && root.game && root.game.data) {
      return { leaderboard: root };
    }

    return { error: "Could not locate leaderboard game data in the response payload." };
  }

  const requestedCategory =
    (input && input.trmnl && input.trmnl.plugin_settings && input.trmnl.plugin_settings.custom_fields_values && input.trmnl.plugin_settings.custom_fields_values.category) ||
    (input && input.category) ||
    '';

  const selection = selectLeaderboard(input, requestedCategory);
  if (selection.error) {
    return { error: selection.error, data: { error: selection.error } };
  }

  const leaderboard = selection.leaderboard;
  const gameData = leaderboard.game.data;
  const categoryData = (leaderboard.category && leaderboard.category.data) ? leaderboard.category.data : {};

  const gameName = (gameData.names && gameData.names.international) ? gameData.names.international : 'Unknown Game';
  const categoryName = categoryData.name || 'Unknown Category';
  const assets = gameData.assets || {};
  const coverImage = assets['cover-medium'] ? assets['cover-medium'].uri : null;
  const logoImage = assets['logo'] ? assets['logo'].uri : null;
  const iconImage = assets['icon'] ? assets['icon'].uri : null;
  const trophyImage = assets['trophy-1st'] ? assets['trophy-1st'].uri : null;
  const releasedYear = gameData.released || 'N/A';

  // Truncate Rules
  let rulesSummary = 'No category rules specified.';
  if (categoryData.rules) {
    rulesSummary = categoryData.rules
      .replace(/[\[\]]/g, '')
      .replace(/\(http\S+\)/g, '');
    if (rulesSummary.length > 160) {
      rulesSummary = rulesSummary.slice(0, 160) + '...';
    }
  }

  // Resolve platform names map
  const platformMap = {};
  if (gameData.platforms && Array.isArray(gameData.platforms.data)) {
    gameData.platforms.data.forEach(p => {
      platformMap[p.id] = p.name;
    });
  }

  const runs = Array.isArray(leaderboard.runs) ? leaderboard.runs : [];
  const totalRuns = runs.length;

  // Resolve user IDs to usernames
  const playersMap = {};
  if (leaderboard.players && Array.isArray(leaderboard.players.data)) {
    leaderboard.players.data.forEach(p => {
      let name = (p.names && p.names.international) ? p.names.international : (p.name || 'Guest');
      if (name && name.toLowerCase() === 'not applicable') {
        name = 'Guest';
      }
      if (p.id) {
        playersMap[p.id] = name;
      }
    });
  }

  // Time formatter helper
  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? hrs + 'h ' : ''}${mins}m ${secs}s`;
  }

  // Relative date/time helper (X minutes/days ago)
  function getRelativeTimeAgo(dateString) {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'recently';
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
  }

  // Parse top 3 runs
  const topRuns = runs.slice(0, 3).map(r => {
    const runObj = r.run || {};
    const playerRef = Array.isArray(runObj.players) ? runObj.players[0] : null;
    let runnerName = 'Guest';
    if (playerRef) {
      runnerName = playerRef.rel === 'user' ? (playersMap[playerRef.id] || 'Unknown') : (playerRef.name || 'Guest');
      if (runnerName && runnerName.toLowerCase() === 'not applicable') {
        runnerName = 'Guest';
      }
    }
    const runTimestamp = runObj.status
      ? (runObj.status['verify-date'] || runObj.submitted || runObj.date)
      : (runObj.submitted || runObj.date);
    return {
      place: r.place,
      runner: runnerName || 'Unknown',
      time: formatDuration(runObj.times ? runObj.times.primary_t : null),
      date: getRelativeTimeAgo(runTimestamp)
    };
  });

  const wrRun = topRuns[0];

  // Resolve exact system for WR
  let runSystem = 'Unknown';
  if (wrRun && runs[0] && runs[0].run && runs[0].run.system) {
    const sys = runs[0].run.system;
    const platformName = platformMap[sys.platform] || 'Console';
    const isEmu = sys.emulated ? ' (EMU)' : '';
    runSystem = `${platformName}${isEmu}`;
  }

  const payload = {
    game_name: gameName,
    category_name: categoryName,
    cover_image: coverImage,
    logo_image: logoImage,
    icon_image: iconImage,
    trophy_image: trophyImage,
    wr_time: wrRun ? wrRun.time : 'N/A',
    wr_holder: wrRun ? wrRun.runner : 'No runs yet',
    wr_date: wrRun ? wrRun.date : 'N/A',
    released_year: releasedYear,
    system: runSystem,
    total_runs: totalRuns,
    rules_summary: rulesSummary,
    top_runs: topRuns
  };

  // Return payload at root and also nested under "data" key.
  return {
    ...payload,
    data: payload
  };
}
