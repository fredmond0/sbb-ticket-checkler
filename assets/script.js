// Configuration / Live Pricing
let SBB_PRICES_LIVE = null;
let GEMINI_API_KEY = null;

const SBB_PRICES_DEFAULT = {
    GA_ADULT: 3995,
    GA_YOUTH: 3495,
    HALF_FARE: 190,
    BIKE_PASS: 240,
    DAY_BIKE_PASS: 14,
    HALF_FARE_PLUS: [
        { name: "Half-Fare PLUS 1000", cost: 800, credit: 1000 },
        { name: "Half-Fare PLUS 2000", cost: 1500, credit: 2000 },
        { name: "Half-Fare PLUS 3000", cost: 2100, credit: 3000 }
    ]
};

// Global State
let state = {
    travelData: [],
    charts: {}
};

// DOM Elements
const elements = {
    uploadInput: document.getElementById('pdf-upload'),
    loader: document.getElementById('loader'),
    loaderText: document.getElementById('loader-text'),
    errorMessage: document.getElementById('error-message'),
    verifySection: document.getElementById('verify-section'),
    analyzeSection: document.getElementById('analyze-section'),
    resultsSection: document.getElementById('results-section'),
    tableBody: document.getElementById('table-body'),
    analyzeBtn: document.getElementById('analyze-btn'),
    exportBtn: document.getElementById('export-btn'),
    dateRangeSelect: document.getElementById('date-range-select'),
    customDateRangeDiv: document.getElementById('custom-date-range'),
    startDateInput: document.getElementById('start-date'),
    endDateInput: document.getElementById('end-date'),
    mockBtn: document.getElementById('mock-data-btn'),
    uploadArea: document.querySelector('.upload-area'),
    mathDetails: document.getElementById('math-details-table') // The new accordion
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initiate live price fetch early
    fetchLivePrices();

    if (elements.uploadInput) elements.uploadInput.addEventListener('change', handleFileUpload);
    if (elements.analyzeBtn) elements.analyzeBtn.addEventListener('click', runAnalysis);
    if (elements.exportBtn) elements.exportBtn.addEventListener('click', exportToExcel);
    if (elements.dateRangeSelect) elements.dateRangeSelect.addEventListener('change', handleDateSelection);
    if (elements.mockBtn) elements.mockBtn.addEventListener('click', loadMockData);

    // Drag and drop support
    if (elements.uploadArea) {
        elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.uploadArea.classList.add('dragging');
        });
        elements.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            elements.uploadArea.classList.remove('dragging');
        });
        elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.uploadArea.classList.remove('dragging');
            if (e.dataTransfer.files.length > 0) {
                elements.uploadInput.files = e.dataTransfer.files;
                handleFileUpload({ target: elements.uploadInput });
            }
        });
    }
});

// --- API Bypassing Engine ---
async function getApiKey() {
    if (GEMINI_API_KEY) return GEMINI_API_KEY;
    try {
        const r = await fetch('/.netlify/functions/process-pdf', { method: 'POST', body: JSON.stringify({}) });
        const d = await r.json();
        if (d.key) GEMINI_API_KEY = d.key;
    } catch (e) {
        console.error("Failed to fetch API key proxy", e);
    }
    return GEMINI_API_KEY;
}

// Directly hitting Gemini API bypasses Netlify's 10-second timeout completely!
async function callGeminiDirectly(payload) {
    const key = await getApiKey();
    if (!key) throw new Error("No API key available");
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    
    let retries = 3;
    while(retries > 0) {
        try {
            const r = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (r.status === 429 || r.status >= 500) {
                retries--;
                console.warn(`Hit rate limit or error (${r.status}). Waiting 6s...`);
                await new Promise(resolve => setTimeout(resolve, 6000));
                continue;
            }
            if (!r.ok) {
                const rt = await r.text();
                throw new Error("API Error: " + r.status + " " + rt);
            }
            
            const json = await r.json();
            if (!json.candidates || json.candidates.length === 0) throw new Error("No candidates returned");
            
            return json.candidates[0].content.parts[0].text;
        } catch(e) {
            retries--;
            if(retries === 0) throw e;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

async function fetchLivePrices() {
    if (SBB_PRICES_LIVE) return SBB_PRICES_LIVE;
    console.log("Fetching live prices via Gemini API Grounding...");
    try {
        const payload = {
            contents: [{
                role: "user",
                parts: [{ text: "Search and return the absolute current 2026 prices for Swiss SBB travel passes in CHF. I need: 1) Adult 2nd Class GA Travelcard (annual), 2) Youth 2nd Class GA Travelcard (annual, age 16-25), 3) Annual Half-Fare Travelcard, 4) Annual Bike Pass (Velopass). Return ONLY a minified JSON object with these exact keys: GA_ADULT, GA_YOUTH, HALF_FARE, BIKE_PASS. Ensure keys have integer values." }]
            }],
            tools: [{ googleSearch: {} }]
        };
        
        const rawText = await callGeminiDirectly(payload);
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const d = JSON.parse(cleanJson);
        
        if (d && d.GA_ADULT) {
            SBB_PRICES_LIVE = Object.assign({}, SBB_PRICES_DEFAULT, d); // Merge API with defaults explicitly
            console.log("Live Prices Loaded:", SBB_PRICES_LIVE);
            return SBB_PRICES_LIVE;
        }
    } catch (e) {
        console.warn("Could not fetch live prices, using defaults.", e);
    }
    SBB_PRICES_LIVE = SBB_PRICES_DEFAULT;
    return SBB_PRICES_LIVE;
}

function handleDateSelection() {
    if (elements.dateRangeSelect.value === 'custom') {
        elements.customDateRangeDiv.classList.remove('hidden');
        elements.customDateRangeDiv.classList.add('grid');
    } else {
        elements.customDateRangeDiv.classList.add('hidden');
        elements.customDateRangeDiv.classList.remove('grid');
    }
}

function resetUI() {
    state.travelData = [];
    elements.verifySection.classList.add('hidden');
    elements.analyzeSection.classList.add('hidden');
    elements.resultsSection.classList.add('hidden');
    elements.errorMessage.classList.add('hidden');
    elements.loader.classList.add('hidden');
    elements.tableBody.innerHTML = '';
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.remove('hidden');
    elements.loader.classList.add('hidden');
}

// --- Upload Flow ---
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    resetUI();
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = 'Processing document via AI...';

    const fileType = file.name.split('.').pop().toLowerCase();
    
    try {
        if (fileType === 'pdf') {
            await processPDF(file);
        } else if (fileType === 'csv') {
            await processCSV(file);
        } else {
            showError("Unsupported file type.");
        }
    } catch (error) {
        showError("Failed to process the file: " + error.message);
        elements.loader.classList.add('hidden');
    }
}

async function processCSV(file) {
    elements.loaderText.textContent = 'Reading CSV data...';
    // Simplified CSV processing (legacy code preserved semantics)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'string' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                const res = jsonData.map(row => {
                    let priceStr = row['Price'] || row['price'] || 0;
                    return {
                        travelDate: row['Travel date'] || new Date().toISOString(),
                        description: row['Route'] || 'Unknown Route',
                        ticketType: 'Point-to-point',
                        travelers: ["Me"],
                        price: typeof priceStr === 'number' ? priceStr : parseFloat(priceStr),
                        isRefunded: false
                    };
                }).filter(r => r.price > 0);
                
                processAndDisplayData(res);
                resolve();
            } catch(err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}

function processPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64Data = e.target.result.split(',')[1];
                const payload = {
                    contents: [{
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
                            { inlineData: { mimeType: "application/pdf", data: base64Data } }
                        ]
                    }]
                };

                const rawText = await callGeminiDirectly(payload);
                const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                const resultData = JSON.parse(cleanJson);
                
                processAndDisplayData(resultData);
                resolve();
            } catch (error) {
                console.error("PDF Extraction Error:", error);
                reject(error);
            }
        };
        reader.readAsDataURL(file);
    });
}

// --- Data & Table Display ---
function processAndDisplayData(data) {
    elements.loader.classList.add('hidden');
    if (!Array.isArray(data) || data.length === 0) {
        showError("No valid tickets were extracted.");
        return;
    }

    state.travelData = data.filter(d => !d.isRefunded && d.price > 0);
    renderTable(state.travelData);

    elements.verifySection.classList.remove('hidden');
    elements.analyzeSection.classList.remove('hidden');
    elements.verifySection.scrollIntoView({ behavior: 'smooth' });
}

function renderTable(data) {
    elements.tableBody.innerHTML = '';
    data.forEach((item, index) => {
        const row = document.createElement('tr');
        let bikeCheckboxHtml = item.ticketType === 'Bike' ? '☑' : `<input type="checkbox" class="bike-checkbox" data-index="${index}">`;
        
        row.innerHTML = `
            <td contenteditable="true" data-index="${index}" data-field="travelDate">${item.travelDate}</td>
            <td contenteditable="true" data-index="${index}" data-field="description">${item.description}</td>
            <td contenteditable="true" data-index="${index}" data-field="ticketType">${item.ticketType}</td>
            <td contenteditable="true" data-index="${index}" data-field="price">${item.price.toFixed(2)}</td>
            <td class="text-center">${bikeCheckboxHtml}</td>
        `;
        elements.tableBody.appendChild(row);
    });
    elements.tableBody.addEventListener('input', (e) => {
        const cell = e.target.closest('[data-index]');
        if (!cell) return;
        let v = cell.textContent;
        if(cell.dataset.field === 'price') v = parseFloat(v) || 0;
        state.travelData[cell.dataset.index][cell.dataset.field] = v;
    });
}

// --- Analysis Engine ---
async function runAnalysis() {
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = "Crunching the economics matrix...";
    const prices = await fetchLivePrices(); // Ensure prices are ready
    elements.loader.classList.add('hidden');

    const startDate = new Date(); // simplified filter
    startDate.setFullYear(startDate.getFullYear() - 1);
    
    // Transparent Math Variables
    let totals = {
        pointToPointCount: 0, pointToPointCost: 0,
        zvvCount: 0, zvvCost: 0,
        bikeCount: 0, bikeCost: 0
    };

    state.travelData.forEach(d => {
        if(d.ticketType.includes('ZVV')) {
            totals.zvvCost += d.price; totals.zvvCount++;
        } else if (d.ticketType === 'Bike') {
            totals.bikeCost += d.price; totals.bikeCount++;
        } else if (d.ticketType === 'Travelcard') {
            // Ignore past travelcards from history logic
        } else {
            // Assume Point to Point
            totals.pointToPointCost += d.price;
            totals.pointToPointCount++;
        }
    });

    const isYouth = parseInt(document.getElementById('user-age').value) < 26;
    const gaCost = isYouth ? prices.GA_YOUTH : prices.GA_ADULT;
    
    // SCENARIO 1: NO Card. 
    // We assume extracted point-to-point tickets were bought With Half Fare, so full price is 2x. ZVV is generally fixed (unless daypass).
    const noCardTickets = (totals.pointToPointCost * 2) + totals.zvvCost;
    const noCardTotal = noCardTickets;

    // SCENARIO 2: Half Fare. 
    const halfFareTickets = totals.pointToPointCost + totals.zvvCost; // ZVV usually unaffected heavily or already applied
    const halfFareTotal = prices.HALF_FARE + halfFareTickets;

    // SCENARIO 3: GA
    // ZVV and Point-to-Point are FREE.
    const gaTickets = 0;
    const gaTotal = gaCost;

    // Bike Logic
    const bikeAssumption = totals.bikeCost > prices.BIKE_PASS ? prices.BIKE_PASS : totals.bikeCost;

    let options = [
        { name: "Full Price (No Card)", total: noCardTotal + bikeAssumption, base: noCardTotal },
        { name: "Half-Fare Travelcard", total: halfFareTotal + bikeAssumption, base: halfFareTotal },
        { name: "GA Travelcard", total: gaTotal + bikeAssumption, base: gaTotal }
    ];

    // Half Fare PLUS
    prices.HALF_FARE_PLUS.forEach(plus => {
        let ticketOverage = Math.max(0, halfFareTickets - plus.credit);
        options.push({
            name: plus.name,
            total: prices.HALF_FARE + plus.cost + ticketOverage + bikeAssumption,
            base: prices.HALF_FARE + plus.cost + ticketOverage
        });
    });

    options.sort((a,b) => a.total - b.total);
    displayResults(options[0], options, totals, prices, bikeAssumption);
    analyzeTravelPatternsWithAI(state.travelData); // Background insights
}

function displayResults(best, allOptions, totals, prices, bikeAssumption) {
    elements.resultsSection.classList.remove('hidden');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });

    let html = `
        <marquee scrollamount="12" class="tacky-marquee">🚂🚂 ALL ABOARD THE SAVINGS EXPRESS! RECOMMENDATION GENERATED! 🚂🚂</marquee>
        <div class="mb-4 text-center punch-ticket-inside">
            <h3 class="text-3xl font-bold uppercase blink-text text-sbb">WINNER: ${best.name}</h3>
            <p class="text-xl mt-4">Estimated Yearly Cost: CHF ${best.total.toFixed(2)}</p>
        </div>
    `;
    document.getElementById('recommendation-output').innerHTML = html;

    // Render "Math" Grid
    const mathHtml = `
        <table class="tacky-table w-full text-left mt-4">
            <thead class="bg-gray-900 text-white">
                <tr>
                    <th class="p-2">Pass Type</th>
                    <th class="p-2">Card Cost</th>
                    <th class="p-2">Tickets Paid</th>
                    <th class="p-2">Bike Impact</th>
                    <th class="p-2 text-yellow-300">TOTAL Cost</th>
                </tr>
            </thead>
            <tbody>
                ${allOptions.map(o => `
                <tr class="border-b border-gray-700 hover:bg-gray-100">
                    <td class="p-2 font-bold">${o.name}</td>
                    <td class="p-2">CHF ${o.name.includes('GA') ? (o.name.includes('Youth') ? prices.GA_YOUTH : prices.GA_ADULT) : (o.name.includes('Half') ? prices.HALF_FARE + (o.name.includes('PLUS') ? parseInt(o.name.split(' ')[2]||0)/1.25 : 0) : 0)}</td>
                    <td class="p-2">CHF ${o.base - (o.name.includes('GA')?o.base : prices.HALF_FARE)}</td>
                    <td class="p-2">+ CHF ${bikeAssumption}</td>
                    <td class="p-2 font-black text-red-600">CHF ${o.total.toFixed(2)}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="mt-4 p-4 bg-yellow-100 border border-yellow-400 font-mono text-sm">
            <b>Nerds Only Math:</b> You purchased ${totals.pointToPointCount} regular tickets (CHF ${totals.pointToPointCost}) and ${totals.zvvCount} regional tickets (CHF ${totals.zvvCost}). We assume recorded ticket prices represent half-fare values. For PLUS cards, we apply the paid credit against the remaining ticket sums.
        </div>
    `;
    elements.mathDetails.innerHTML = mathHtml;

    // Update Dashboard Tiles
    document.getElementById('total-trips').textContent = state.travelData.length;
    document.getElementById('total-spent').textContent = `CHF ${state.travelData.reduce((s,i)=>s+i.price,0).toFixed(2)}`;
}

async function analyzeTravelPatternsWithAI(data) {
    const insightsDiv = document.getElementById('ai-insights');
    if (!insightsDiv) return;
    
    insightsDiv.innerHTML = '<blink>Consulting the AI Conductor...</blink>';
    try {
        const textSum = data.map(d=>d.description).slice(0,40).join(", ");
        const payload = {
            contents: [{
                role: "user",
                parts: [{ text: `
                    You are a smart travel optimization assistant for Switzerland.
                    INPUT DATA: ${textSum}
                    YOUR MISSION: Identify ZVV Zone 110 trips, write a fun short persona summary about their travel style, and offer one clever savings tip. Use Markdown.
                `}]
            }]
        };
        const rawText = await callGeminiDirectly(payload);
        
        if(typeof marked !== 'undefined') {
             insightsDiv.innerHTML = `<div class="prose max-w-none text-white">${marked.parse(rawText)}</div>`;
        } else {
             insightsDiv.innerText = rawText;
        }
    } catch(e) { 
        insightsDiv.innerText = "The AI Conductor is taking a break: " + e.message;
    }
}

function exportToExcel() {
    if(typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(state.travelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Travel");
        XLSX.writeFile(wb, "SBB_Chaos_Export.xlsx");
    }
}

function loadMockData() {
    const mockData = [
        { travelDate: "2026-01-15", description: "Zürich HB - Bern", ticketType: "Point-to-point", travelers: ["Me"], price: 26.50, isRefunded: false },
        { travelDate: "2026-02-10", description: "Zürich HB - Luzern", ticketType: "Point-to-point", travelers: ["Me"], price: 30.00, isRefunded: false },
        { travelDate: "2026-03-05", description: "ZVV Day Pass", ticketType: "ZVV Ticket", travelers: ["Me"], price: 13.60, isRefunded: false },
        { travelDate: "2026-04-20", description: "Velo Ticket Day", ticketType: "Bike", travelers: ["Me"], price: 14.00, isRefunded: false }
    ];
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = "Loading sample data...";
    setTimeout(() => {
        processAndDisplayData(mockData);
    }, 500);
}
