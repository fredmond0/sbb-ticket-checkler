# SBB Travel Analyzer

A web application that analyzes Swiss SBB train ticket summaries to recommend the most cost-effective travel passes.

## Features

- PDF upload and text extraction
- AI-powered data parsing using Google Gemini
- Interactive data verification
- Cost analysis and recommendations
- Visual charts and dashboards
- Excel export functionality

## Security

This application uses Netlify serverless functions to keep API keys secure. The Gemini API key is stored as an environment variable and never exposed to the client-side code.

## Deployment on Netlify

### Prerequisites

1. A Google Cloud account with Gemini API access
2. A Netlify account

### Setup Steps

1. **Get your Gemini API key:**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key for the next step

2. **Deploy to Netlify:**
   - Push your code to a GitHub repository
   - Connect your repository to Netlify
   - In Netlify dashboard, go to Site settings > Environment variables
   - Add a new variable:
     - Key: `GEMINI_API_KEY`
     - Value: Your Gemini API key from step 1

3. **Install dependencies:**
   - In Netlify dashboard, go to Site settings > Build & deploy
   - Set build command to: `cd netlify/functions && npm install`
   - Set publish directory to: `.`

### Local Development

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Set up environment variables:
   ```bash
   netlify env:set GEMINI_API_KEY "your-api-key-here"
   ```

3. Run locally:
   ```bash
   netlify dev
   ```

## File Structure

```
├── index.html                 # Main application
├── netlify/
│   ├── functions/
│   │   ├── process-pdf.js     # Serverless function for API calls
│   │   └── package.json       # Function dependencies
├── netlify.toml              # Netlify configuration
└── README.md                 # This file
```

## How It Works

1. User uploads a PDF ticket summary
2. PDF is processed in pairs of pages to optimize API costs and avoid timeouts
3. Each pair of pages' text is extracted using PDF.js
4. Combined page text is sent to serverless function
5. Serverless function calls Gemini API with secure API key
6. AI processes both pages and returns structured data
7. All page data is combined into a single dataset
8. User can verify and edit the extracted data
9. Application analyzes costs and recommends optimal travel passes

## Privacy

- All processing happens in the browser or on secure serverless functions
- No data is stored permanently
- PDF content is only sent to Google's Gemini API for processing
- Your API key is never exposed to the client

## Troubleshooting

- **Function timeout errors:** The application now processes PDFs in pairs of pages to avoid timeout issues. Each pair is processed in under 10 seconds.
- **Large PDFs:** PDFs with more than 20 pages will show a warning. Consider splitting very large files to reduce API costs.
- **API costs:** Each pair of pages requires one API call. A 10-page PDF will use 5 API calls (50% cost reduction).
- **API key errors:** Ensure your `GEMINI_API_KEY` environment variable is set correctly in Netlify.
- **CORS errors:** The serverless function includes proper CORS headers for cross-origin requests. 