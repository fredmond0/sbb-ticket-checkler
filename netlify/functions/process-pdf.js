const fetch = require('node-fetch');

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
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const body = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    let payload = { contents: [] };

    // 1. DYNAMIC PRICE CHECK
    if (body.isPriceCheck) {
      payload.contents.push({
        role: "user",
        parts: [{ text: "Search and return the absolute current 2026 prices for Swiss SBB travel passes in CHF. I need: 1) Adult 2nd Class GA Travelcard (annual), 2) Youth 2nd Class GA Travelcard (annual, age 16-25), 3) Annual Half-Fare Travelcard, 4) Annual Bike Pass (Velopass). Return ONLY a minified JSON object with these exact keys: GA_ADULT, GA_YOUTH, HALF_FARE, BIKE_PASS. Ensure keys have integer values." }]
      });
      // Enable grounding
      payload.tools = [{ googleSearch: {} }];
    } 
    // 2. AI INSIGHTS
    else if (body.isInsightRequest) {
      payload.contents.push({
        role: "user",
        parts: [{ text: `
        You are a smart travel optimization assistant for Switzerland.
        
        INPUT DATA:
        ${body.text}
        
        YOUR MISSION:
        1. **ZVV Zone Analysis**: Identify trips that look like they are in **ZVV Zone 110 (Zurich City)**. 
           - Look for: 'Zurich HB', 'Oerlikon', 'Wiedikon', 'Stadelhofen', 'Hardbrücke', 'Wollishofen'.
           - Suggest if they should consider monthlies or annuals based on frequency.
        
        2. **Fun Summary**: Give a short, fun personality description of the traveler (e.g. "The Mountain Goat", "The City Slicker").
        3. **Savings Tip**: Give ONE specific recommendation outside of Half-Fare/GA. Example: "You went to Geneva 3 times; consider a Saver Day Pass next time."

        FORMAT:
        Use Markdown. Use bolding > for emphasis. Be concise.
        `}]
      });
    } 
    // 3. PDF EXTRACTION
    else if (body.base64Pdf) {
      payload.contents.push({
        role: "user",
        parts: [
          { text: `
          You are an expert data extraction assistant for SBB (Swiss Federal Railways) ticket documents.
          We have provided a PDF document containing order history.
          Extract the distinct travel products/tickets into a strict JSON array.
          IGNORE refunds, and IGNORE total lines.

          OUTPUT FORMAT:
          A single JSON array of objects. Each object must have:
          - "travelDate": (string) "YYYY-MM-DD". If unknown use "N/A".
          - "description": (string) A concise description of the route or product.
          - "ticketType": (string) Try to categorize accurately. Options: "Point-to-point", "ZVV Ticket", "Travelcard", "Bike", "Day Pass", "International", "Other".
          - "travelers": (array of strings) Names of travelers found.
          - "price": (number) The cost in CHF. Must be a positive number.
          - "isRefunded": (boolean) always false, since you should ignore refunds.

          CRITICAL RULES:
          1. Only output raw JSON, no markdown blocks. 
          2. Convert dates like "15.01.2024" to "2024-01-15".
          `},
          {
            inlineData: {
              mimeType: "application/pdf",
              data: body.base64Pdf
            }
          }
        ]
      });
    } else {
       return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required body fields.' }) };
    }

    let response;
    let retries = 3;
    while (retries > 0) {
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.status === 429 || response.status >= 500) {
          retries--;
          // Backoff substantially due to 5 RPM limit on gemini-2.5-flash
          await new Promise(resolve => setTimeout(resolve, 6000));
          continue;
        }
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!response.ok) {
      const rt = await response.text();
      console.error("Gemini Failure:", rt);
      throw new Error(`AI API request failed with status ${response.status}`);
    }

    const result = await response.json();
    if (result.candidates && result.candidates.length > 0) {
      const responseText = result.candidates[0].content.parts[0].text;

      if (body.isInsightRequest) {
        return { statusCode: 200, headers, body: JSON.stringify({ data: responseText }) };
      } 
      
      // Attempt JSON Cleanup for Price Checks and PDFs
      let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsedData;
      try {
         parsedData = JSON.parse(cleanJson);
      } catch(je) {
         console.error("Failed to parse the Gemini output as JSON", cleanJson);
         return { statusCode: 500, headers, body: JSON.stringify({ error: "LLM did not return strict JSON", raw: cleanJson }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: parsedData })
      };
    } else {
      throw new Error("AI model returned no valid data.");
    }

  } catch (error) {
    console.error('Error processing:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process data',
        details: error.message
      })
    };
  }
};