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
      const pageRange = pageNumbers.length === 1 ? `page ${pageNumbers[0]}` : `pages ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`;

      prompt = `
        You are an expert data extraction assistant for SBB (Swiss Federal Railways) ticket documents.
        Your task is to analyze the text provided from a PDF order summary and extract distinct travel products/tickets into a JSON array.

        INFO:
        - The text comes from ${pageRange} of ${totalPages}.
        - The source text may contain headers, footers, and "Total" lines which should be IGNORED.
        - Refunded items might be marked with "Refunded" or negative prices.

        OUTPUT FORMAT:
        A single JSON array of objects. Each object must have:
        - "travelDate": (string) "YYYY-MM-DD". If a range is given, use the start date. Use "N/A" if not applicable (e.g., for a pass valid for a year, use the purchase or start date).
        - "description": (string) A concise description of the route (e.g., "Zurich HB - Bern") or product (e.g., "Half Fare Travelcard").
        - "ticketType": (string) One of: "Point-to-point", "ZVV Ticket", "Travelcard", "Bike", "Day Pass", "International", "Other".
          - "Travelcard": Includes Half-Fare, GA, Seven25.
          - "Point-to-point": Standard A to B tickets.
          - "Day Pass": Saver Day Pass, Municipality Day Pass.
        - "travelers": (array of strings) Names of travelers found, formatted as "Firstname Lastname".
        - "price": (number) The cost in CHF. Must be a positive number.
        - "isRefunded": (boolean) true if the item indicates a refund/cancellation.

        CRITICAL RULES:
        1. Ignore line items that are just totals or subtotals.
        2. Convert dates like "15.01.2024" to "2024-01-15".
        3. If no relevant ticket data is found on these pages, return an empty array: []
        4. Do not include markdown formatting (like \`\`\`json) in the response, just the raw JSON.

        TEXT TO PROCESS:
        ----------------
        ${text}
        ----------------
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