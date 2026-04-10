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
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured in Netlify dashboard' }) };
    }

    // Using native global fetch (available in Node 18+) for zero-dependency reliability
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let payload = { contents: [] };

    if (body.isPriceCheck) {
      payload.contents.push({
        role: "user",
        parts: [{ text: "Return current 2026 annual prices for: GA Adult (2nd), GA Youth (2nd, 16-25), Half-Fare, and Bike Pass (Velopass). Returns ONLY JSON: {GA_ADULT, GA_YOUTH, HALF_FARE, BIKE_PASS}" }]
      });
    } else if (body.isInsightRequest) {
      payload.contents.push({
        role: "user",
        parts: [{ text: `Analyze these SBB routes for ZVV patterns and traveler persona: ${body.text}` }]
      });
    } else if (body.base64Pdf) {
      payload.contents.push({
        role: "user",
        parts: [
          { text: "Extract tickets as strict JSON: [ {travelDate, description, ticketType, price} ]." },
          { inlineData: { mimeType: "application/pdf", data: body.base64Pdf } }
        ]
      });
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
        return { statusCode: response.status, headers, body: JSON.stringify(result) };
    }

    const responseText = result.candidates[0].content.parts[0].text;
    return { statusCode: 200, headers, body: JSON.stringify({ data: responseText }) };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};