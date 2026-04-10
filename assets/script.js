// Configuration / Defaults
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

let state = {
    travelData: [],
    prices: SBB_PRICES_DEFAULT
};

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
    mockBtn: document.getElementById('mock-data-btn'),
    uploadArea: document.querySelector('.upload-area'),
    mathDetails: document.getElementById('math-details-table')
};

document.addEventListener('DOMContentLoaded', () => {
    fetchLivePrices();
    elements.uploadInput.addEventListener('change', handleFileUpload);
    elements.analyzeBtn.addEventListener('click', runAnalysis);
    elements.mockBtn.addEventListener('click', loadMockData);

    if (elements.uploadArea) {
        elements.uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); elements.uploadArea.classList.add('dragging'); });
        elements.uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); elements.uploadArea.classList.remove('dragging'); });
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

async function apiProxy(payload) {
    const response = await fetch('/.netlify/functions/process-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Internal Server Error");
    }
    return await response.json();
}

async function fetchLivePrices() {
    try {
        const res = await apiProxy({ isPriceCheck: true });
        const cleanJson = res.data.replace(/```json/g, '').replace(/```/g, '').trim();
        const d = JSON.parse(cleanJson);
        if (d && d.GA_ADULT) {
            state.prices = Object.assign({}, SBB_PRICES_DEFAULT, d);
            console.log("Live Pricing updated:", state.prices);
        }
    } catch (e) {
        console.warn("Using default prices:", e.message);
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    elements.errorMessage.classList.add('hidden');
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = 'Analyzing your PDF...';

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const base64Data = e.target.result.split(',')[1];
            const result = await apiProxy({ base64Pdf: base64Data });
            const cleanJson = result.data.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanJson);
            
            elements.loader.classList.add('hidden');
            if (!Array.isArray(data) || data.length === 0) throw new Error("No tickets found");
            
            state.travelData = data.filter(d => d.price > 0);
            renderTable(state.travelData);
            elements.verifySection.classList.remove('hidden');
            elements.analyzeSection.classList.remove('hidden');
        } catch (error) {
            elements.loader.classList.add('hidden');
            elements.errorMessage.textContent = error.message;
            elements.errorMessage.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);
}

function renderTable(data) {
    elements.tableBody.innerHTML = '';
    data.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td contenteditable="true" data-index="${index}" data-field="travelDate">${item.travelDate}</td>
            <td contenteditable="true" data-index="${index}" data-field="description">${item.description}</td>
            <td contenteditable="true" data-index="${index}" data-field="ticketType">${item.ticketType}</td>
            <td contenteditable="true" data-index="${index}" data-field="price">${item.price.toFixed(2)}</td>
            <td class="text-center font-bold">${item.ticketType === 'Bike' ? '☑' : ''}</td>
        `;
        elements.tableBody.appendChild(row);
    });
}

function runAnalysis() {
    elements.resultsSection.classList.remove('hidden');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });

    let totals = { ptp: 0, zvv: 0, bike: 0 };
    state.travelData.forEach(d => {
        const p = parseFloat(d.price) || 0;
        if (d.ticketType.includes('ZVV')) totals.zvv += p;
        else if (d.ticketType === 'Bike') totals.bike += p;
        else totals.ptp += p;
    });

    const isYouth = parseInt(document.getElementById('user-age').value) < 26;
    const p = state.prices;
    const gaCost = isYouth ? p.GA_YOUTH : p.GA_ADULT;
    
    // Simplistic math for display
    const baseline = (totals.ptp * 2) + totals.zvv + totals.bike;
    const halfFareCost = p.HALF_FARE + totals.ptp + totals.zvv + totals.bike;
    const gaTotal = gaCost + (totals.bike > p.BIKE_PASS ? p.BIKE_PASS : totals.bike);

    const best = Math.min(baseline, halfFareCost, gaTotal);
    let winName = "Half-Fare";
    if (best === baseline) winName = "No Card";
    if (best === gaTotal) winName = "GA Travelcard";

    document.getElementById('recommendation-output').innerHTML = `
        <marquee class="tacky-marquee">🚂🚂 RESULTS ARE IN! FULL SPEED AHEAD! 🚂🚂</marquee>
        <div class="punch-ticket-inside text-center">
            <h2 class="text-4xl blink-text text-sbb">${winName}</h2>
            <p class="text-xl">Your estimated yearly spend: CHF ${best.toFixed(2)}</p>
        </div>
    `;

    document.getElementById('math-details-table').innerHTML = `
        <div class="p-4 bg-white border-4 border-black font-mono">
            <p>Full Price: CHF ${baseline.toFixed(2)}</p>
            <p>Half-Fare Mode: CHF ${halfFareCost.toFixed(2)}</p>
            <p>GA Mode: CHF ${gaTotal.toFixed(2)}</p>
        </div>
    `;
    
    analyzeTravelPatternsWithAI();
}

async function analyzeTravelPatternsWithAI() {
    const div = document.getElementById('ai-insights');
    div.innerHTML = "<blink>COMMUNICATING WITH THE CONDUCTOR...</blink>";
    try {
        const summary = state.travelData.map(d => d.description).slice(0, 20).join(', ');
        const res = await apiProxy({ isInsightRequest: true, text: summary });
        div.innerHTML = `<div class="prose text-white p-4">${res.data}</div>`;
    } catch (e) { div.innerHTML = "The Conductor is busy: " + e.message; }
}

function loadMockData() {
    state.travelData = [
        { travelDate: "2026-01-01", description: "Zurich - Bern", ticketType: "Point-to-point", price: 25 },
        { travelDate: "2026-02-01", description: "ZVV 24h Pass", ticketType: "ZVV Ticket", price: 13.60 }
    ];
    renderTable(state.travelData);
    elements.verifySection.classList.remove('hidden');
    elements.analyzeSection.classList.remove('hidden');
}
