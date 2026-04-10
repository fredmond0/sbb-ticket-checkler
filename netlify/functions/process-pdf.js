exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    // Since Netlify's 10-second timeout kills long-running Gemini document extraction calls,
    // we simply return the API key to the frontend so it can perform the fetch directly
    // and bypass the serverless timeout limits entirely.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ key: apiKey })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to access key', details: error.message })
    };
  }
};