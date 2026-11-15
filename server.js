const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Liquid } = require('liquidjs');

const app = express();
const PORT = process.env.PORT || 3000;

// The Polling Request URL configured in the TRMNL developer portal settings
const POLLING_URL = 'https://www.speedrun.com/api/v1/games/{{game}}/records?top=3&scope=full-game&embed=players,game.platforms,category&max=200';

// Helper to fetch JSON from an HTTPS URL
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'TRMNL-Local-Preview/1.0'
      }
    };
    https.get(url, options, (res) => {
      // Handle redirects
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

// Initialize Liquid template engine
const engine = new Liquid();

app.get('/', async (req, res) => {
  try {
    const game = (req.query.game || 'sm64').trim();
    const category = (req.query.category || '120_Star').trim();
    const resolvedUrl = POLLING_URL.replace('{{game}}', encodeURIComponent(game));
    console.log(`Polling data from: ${resolvedUrl} (category=${category})`);
    const apiData = await fetchJSON(resolvedUrl);

    // Read transform.js and run the transform function in a sandbox context
    const transformPath = path.join(__dirname, 'transform.js');
    const transformCode = fs.readFileSync(transformPath, 'utf8');
    
    const sandboxContext = {
      console,
      setTimeout,
      clearTimeout,
      Buffer,
      Date,
      Math
    };
    vm.createContext(sandboxContext);
    vm.runInContext(transformCode, sandboxContext);

    if (typeof sandboxContext.transform !== 'function') {
      throw new Error("Function 'transform(input)' was not found in transform.js");
    }

    // Process raw API data through transform.js with TRMNL custom_fields_values context
    console.log("Applying transform() function from transform.js...");
    const transformInput = {
      ...apiData,
      trmnl: {
        plugin_settings: {
          custom_fields_values: { game, category }
        }
      }
    };
    const transformedData = sandboxContext.transform(transformInput);

    // Read template.liquid and render it
    console.log("Rendering template.liquid with transformed data...");
    const templatePath = path.join(__dirname, 'template.liquid');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const renderedBody = await engine.parseAndRender(templateContent, transformedData);

    // Wrap the rendered body in the standard TRMNL layout for local viewing
    const htmlResponse = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TRMNL Local Preview - Speedrun Tracker</title>
  <!-- Load the official TRMNL plugin CSS -->
  <link rel="stylesheet" href="https://trmnl.com/css/latest/plugins.css">
  <!-- Optional TRMNL script -->
  <script src="https://trmnl.com/js/latest/plugins.js"></script>
</head>
<body class="environment trmnl">
  <div class="screen">
    <div class="view view--full">
      <div class="layout">
        ${renderedBody}
      </div>
    </div>
  </div>
</body>
</html>
    `;

    res.send(htmlResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <div style="font-family: sans-serif; padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
        <h3>Error rendering TRMNL preview</h3>
        <pre>${error.stack || error.message}</pre>
      </div>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`[TRMNL Dev Server] Running at http://localhost:${PORT}`);
});
