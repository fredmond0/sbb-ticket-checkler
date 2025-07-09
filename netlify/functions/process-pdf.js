const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const { text, pageNumbers, totalPages, isInsightRequest } = JSON.parse(event.body);
    
    if (!text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No text provided' })
      };
    }

    let prompt;
    if (isInsightRequest) {
      prompt = text; // For insight requests, the text is already the prompt
    } else {
      const pageRange = pageNumbers.length === 1 ? `page ${pageNumbers[0]}` : `pages ${pageNumbers[0]}-${pageNumbers[pageNumbers.length-1]}`;
      
      prompt = `
        You are an expert data extraction tool for Swiss SBB train ticket summaries.
        Analyze the following text from ${pageRange} of ${totalPages} and convert it into a structured JSON array.
        Each object in the array represents one purchase.

        The JSON objects must have the following properties:
        - "travelDate": (string) The travel date in "YYYY-MM-DD" format.
        - "description": (string) The route or a short description.
        - "ticketType": (string) A standardized category from: "Point-to-point", "ZVV Ticket", "Travelcard", "Bike", "Day Pass", "International", "Other".
        - "travelers": (array of strings) A list of traveler names, converted to Title Case (e.g., "Frederick Patton Mondale").
        - "price": (number) The price in CHF.
        - "isRefunded": (boolean) True if "Refunded" is associated with the item, otherwise false.

        RULES:
        1. Convert all traveler names to Title Case to ensure consistency.
        2. For "Special Price Half Fare Travelcard" or "GA Travelcard", use ticketType "Travelcard".
        3. For any bike passes or tickets, use ticketType "Bike".
        4. Parse dates from DD.MM.YYYY to YYYY-MM-DD.
        5. Ignore the final "Total" line.
        6. Return ONLY the JSON array.
        7. If these pages contain no ticket data, return an empty array [].

        Text to analyze:
        ---
        ${text}
        ---
      `;
    }

    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }]
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`AI API request failed with status ${response.status}`);
    }

    const result = await response.json();
    
    if (result.candidates && result.candidates.length > 0) {
      const responseText = result.candidates[0].content.parts[0].text;
      
      if (isInsightRequest) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            data: responseText
          })
        };
      } else {
        const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanedJson);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            data: parsedData,
            pageNumbers,
            totalPages
          })
        };
      }
    } else {
      throw new Error("AI model returned no valid data.");
    }

  } catch (error) {
    console.error('Error processing PDF:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to process PDF data',
        details: error.message 
      })
    };
  }
}; 