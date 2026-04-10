const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured in Netlify' }) };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let payload = { contents: [] };

    // Optimized: Only use Search tools for prices, and limit retries to stay under 10s
    if (body.isPriceCheck) {
      payload.contents.push({
        role: "user",
        parts: [{ text: "Return current 2026 prices for: GA Adult, GA Youth (16-25), Half-Fare, and Bike Pass (Velopass). Annual prices in CHF. Returns ONLY JSON: {GA_ADULT, GA_YOUTH, HALF_FARE, BIKE_PASS}" }]
      });
      // We use 1.5-flash for speed here if 2.5 is hitting limits
    } else if (body.isInsightRequest) {
      payload.contents.push({
        role: "user",
        parts: [{ text: `Analyze these routes for ZVV Zone 110 patterns and give a personality summary: ${body.text}` }]
      });
    } else if (body.base64Pdf) {
      payload.contents.push({
        role: "user",
        parts: [
          { text: "Extract tickets as a JSON array: [ {travelDate, description, ticketType, price} ]. Categorize types: point-to-point, ZVV, Bike, Day Pass." },
          { inlineData: { mimeType: "application/pdf", data: body.base64Pdf } }
        ]
      });
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { statusCode: response.status, headers, body: errorText };
    }

    const result = await response.json();
    const responseText = result.candidates[0].content.parts[0].text;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: responseText })
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};