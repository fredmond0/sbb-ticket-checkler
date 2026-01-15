
// Configuration
const SBB_PRICES = {
    GA_ADULT: 3995,
    GA_YOUTH: 3495, // Age 16-25
    HALF_FARE: 190,
    BIKE_PASS: 240,
    DAY_BIKE_PASS: 14, // Assumed cost for a day bike pass with half-fare
    DAY_BIKE_PASS_FULL: 28, // Full price bike pass (no half-fare)
    HALF_FARE_PLUS: [
        { name: "Half-Fare PLUS 1000", cost: 800, credit: 1000, url: "https://www.sbb.ch/en/travelcards-and-tickets/railpasses/half-fare-travelcard/half-fare-plus.html" },
        { name: "Half-Fare PLUS 2000", cost: 1500, credit: 2000, url: "https://www.sbb.ch/en/travelcards-and-tickets/railpasses/half-fare-travelcard/half-fare-plus.html" },
        { name: "Half-Fare PLUS 3000", cost: 2100, credit: 3000, url: "https://www.sbb.ch/en/travelcards-and-tickets/railpasses/half-fare-travelcard/half-fare-plus.html" }
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
    uploadArea: document.querySelector('.upload-area')
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // PDF.js worker setup
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }

    if (elements.uploadInput) elements.uploadInput.addEventListener('change', handleFileUpload);
    if (elements.analyzeBtn) elements.analyzeBtn.addEventListener('click', runAnalysis);
    if (elements.exportBtn) elements.exportBtn.addEventListener('click', exportToExcel);
    if (elements.dateRangeSelect) elements.dateRangeSelect.addEventListener('change', handleDateSelection);
    if (elements.mockBtn) elements.mockBtn.addEventListener('click', loadMockData);

    // Drag and drop support
    if (elements.uploadArea) {
        elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.uploadArea.style.borderColor = 'var(--sbb-red)';
            elements.uploadArea.style.backgroundColor = 'rgba(235, 0, 0, 0.05)';
        });

        elements.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            elements.uploadArea.style.borderColor = 'var(--gray-300)';
            elements.uploadArea.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
        });

        elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.uploadArea.style.borderColor = 'var(--gray-300)';
            elements.uploadArea.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';

            if (e.dataTransfer.files.length > 0) {
                elements.uploadInput.files = e.dataTransfer.files;
                handleFileUpload({ target: elements.uploadInput });
            }
        });
    }
});

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

// --- PDF & CSV Processing Flow ---

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    resetUI();
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = 'Analyzing your file...';

    const fileType = file.name.split('.').pop().toLowerCase();

    try {
        if (fileType === 'pdf') {
            await processPDF(file);
        } else if (fileType === 'csv') {
            await processCSV(file);
        } else {
            showError("Unsupported file type. Please upload a PDF or CSV.");
        }
    } catch (error) {
        console.error("Error processing file:", error);
        showError("Failed to process the file. Please try again.");
    } finally {
        elements.loader.classList.add('hidden');
    }
}

async function processCSV(file) {
    elements.loaderText.textContent = 'Reading CSV data...';

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    showError("CSV file appears to be empty.");
                    resolve();
                    return;
                }

                const mappedData = jsonData.map(mapCsvRowToModel).filter(item => item !== null);

                if (mappedData.length === 0) {
                    showError("Could not understand the CSV format. Please check the columns.");
                    resolve();
                    return;
                }

                processAndDisplayData(mappedData);
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function mapCsvRowToModel(row) {
    // Expected CSV columns based on sample:
    // Tariff, Route, Via (optional), Price, Co-passenger(s), Travel date, Validity, Order date, ...

    // Basic validation - check for required fields existence (flexible matching)
    const getField = (obj, keyPart) => {
        const key = Object.keys(obj).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
        return key ? obj[key] : undefined;
    };

    const tariff = getField(row, 'Tariff');
    const route = getField(row, 'Route');
    const priceStr = getField(row, 'Price');
    const travelDateStr = getField(row, 'Travel date');
    const passengersStr = getField(row, 'Co-passenger') || "Me";

    if (!tariff || !priceStr || !travelDateStr) return null;

    // Type Mapping
    let ticketType = 'Other';
    const tLower = tariff.toLowerCase();

    if (tLower.includes('single ticket') || tLower.includes('point-to-point')) ticketType = 'Point-to-point';
    else if (tLower.includes('day pass') || tLower.includes('24h')) ticketType = 'Day Pass';
    else if (tLower.includes('half fare') || tLower.includes('ga') || tLower.includes('travelcard')) ticketType = 'Travelcard';
    else if (tLower.includes('velo') || tLower.includes('bike')) ticketType = 'Bike';
    else if (tLower.includes('international')) ticketType = 'International';
    else if (tLower.includes('zvv')) ticketType = 'ZVV Ticket'; // Specific ZVV bucket

    // Date Parsing (DD.MM.YYYY -> YYYY-MM-DD)
    const [day, month, year] = travelDateStr.split('.');
    const formattedDate = `${year}-${month}-${day}`;

    // Price Parsing (Handles strings like "3.60" or numbers)
    const price = typeof priceStr === 'number' ? priceStr : parseFloat(priceStr);

    return {
        travelDate: formattedDate,
        description: route,
        ticketType: ticketType,
        travelers: passengersStr.split(',').map(s => s.trim()), // Simple comma split
        price: price || 0,
        isRefunded: false // CSV doesn't seem to have a clear refunded flag in sample, assume false
    };
}

async function processPDF(file) {
    elements.loaderText.textContent = 'Reading your PDF...';
    const pdf = await parsePdf(file);
    const totalPages = pdf.numPages;

    if (totalPages > 20) {
        showError(`This PDF is large (${totalPages} pages). Processing might take a moment.`);
    }

    elements.loaderText.textContent = 'The AI conductor is checking your tickets...';
    let allData = [];

    // Process in chunks
    for (let i = 0; i < totalPages; i += 2) {
        const pageNumbers = [];
        let combinedText = '';

        for (let j = 0; j < 2 && (i + j) < totalPages; j++) {
            const pageNum = i + j + 1;
            pageNumbers.push(pageNum);
            const pageText = await extractTextFromPage(pdf, pageNum);
            combinedText += `=== PAGE ${pageNum} ===\n${pageText}\n`;
        }

        const pageData = await extractDataWithAI(combinedText, pageNumbers, totalPages);
        if (pageData && pageData.length > 0) {
            allData = allData.concat(pageData);
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (allData.length === 0) {
        showError("No ticket data found. Please check your file.");
        return;
    }

    processAndDisplayData(allData);
}

async function parsePdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await pdfjsLib.getDocument(arrayBuffer).promise;
}

async function extractTextFromPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    return textContent.items.map(item => item.str).join(' ') + '\n\n';
}

async function extractDataWithAI(text, pageNumbers, totalPages) {
    try {
        const response = await fetch('/.netlify/functions/process-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, pageNumbers, totalPages })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        return result.data;
    } catch (error) {
        console.error('API Error:', error);
        // Retrying logic could go here
        return [];
    }
}

// --- Data Logic ---

function processAndDisplayData(data) {
    state.travelData = data;
    renderTable(state.travelData);

    elements.verifySection.classList.remove('hidden');
    elements.verifySection.classList.add('animate-fade-in');

    elements.analyzeSection.classList.remove('hidden');
    elements.analyzeSection.classList.add('animate-fade-in');

    // Scroll to verify section
    elements.verifySection.scrollIntoView({ behavior: 'smooth' });
}

function renderTable(data) {
    elements.tableBody.innerHTML = '';
    data.forEach((item, index) => {
        const row = document.createElement('tr');

        let bikeCheckboxHtml = '';
        if (item.ticketType === 'Point-to-point' && item.price > 15) {
            bikeCheckboxHtml = `<input type="checkbox" class="bike-checkbox" data-index="${index}">`;
        }

        row.innerHTML = `
            <td contenteditable="true" data-index="${index}" data-field="travelDate">${item.travelDate}</td>
            <td contenteditable="true" data-index="${index}" data-field="description">${item.description}</td>
            <td contenteditable="true" data-index="${index}" data-field="ticketType">${item.ticketType}</td>
            <td contenteditable="true" data-index="${index}" data-field="travelers">${Array.isArray(item.travelers) ? item.travelers.join(', ') : item.travelers}</td>
            <td contenteditable="true" data-index="${index}" data-field="price">${typeof item.price === 'number' ? item.price.toFixed(2) : item.price}</td>
            <td contenteditable="true" data-index="${index}" data-field="isRefunded">${item.isRefunded}</td>
            <td class="text-center">${bikeCheckboxHtml}</td>
        `;
        elements.tableBody.appendChild(row);
    });

    elements.tableBody.addEventListener('input', updateTravelDataFromTable);
}

function updateTravelDataFromTable(event) {
    const target = event.target;
    // Walk up to find the cell with data attributes if we clicked on a child
    const cell = target.closest('[data-index]');
    if (!cell) return;

    const index = cell.dataset.index;
    const field = cell.dataset.field;
    let value = cell.textContent;

    if (field === 'price') value = parseFloat(value) || 0;
    if (field === 'isRefunded') value = value.toLowerCase() === 'true';
    if (field === 'travelers') value = value.split(',').map(name => name.trim());

    state.travelData[index][field] = value;
}

// --- Analysis Logic ---

function runAnalysis() {
    let startDate, endDate;
    const rangeValue = elements.dateRangeSelect.value;
    const today = new Date();

    if (rangeValue === 'custom') {
        startDate = new Date(elements.startDateInput.value);
        endDate = new Date(elements.endDateInput.value);
    } else {
        endDate = new Date();
        startDate = new Date();
        // Assuming rangeValue is months
        startDate.setMonth(today.getMonth() - parseInt(rangeValue));
    }

    if (isNaN(startDate) || isNaN(endDate)) {
        showError("Please select a valid date range.");
        return;
    }

    const filteredData = state.travelData.filter(item => {
        const itemDate = new Date(item.travelDate);
        return itemDate >= startDate && itemDate <= endDate && !item.isRefunded;
    });

    if (filteredData.length === 0) {
        showError("No trips found in the selected date range.");
        return;
    }

    // Days in range implies the scaling factor to get to a year
    const daysInRange = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
    const scalingFactor = 365 / daysInRange;

    // Calculate Costs and Recommendations
    const analysisResult = calculateTravelCosts(filteredData, scalingFactor);

    displayResults(analysisResult, filteredData);
    generateCharts(filteredData, analysisResult);

    // AI Insights - fire and forget
    generateAIInsights(filteredData);
}

function calculateTravelCosts(data, scalingFactor) {
    const userAge = parseInt(document.getElementById('user-age').value) || 30;

    // Checkboxes for manual bike separation
    let manualBikeCost = 0;
    const processedData = data.map((item, index) => {
        const checkbox = document.querySelector(`.bike-checkbox[data-index="${index}"]`);
        if (checkbox && checkbox.checked) {
            manualBikeCost += SBB_PRICES.DAY_BIKE_PASS;
            return { ...item, price: Math.max(0, item.price - SBB_PRICES.DAY_BIKE_PASS) };
        }
        return item;
    });

    const bikeTickets = processedData.filter(item => item.ticketType === 'Bike');
    const otherTickets = processedData.filter(item => item.ticketType !== 'Bike');

    const bikeSpendingPeriod = bikeTickets.reduce((sum, i) => sum + i.price, 0) + manualBikeCost;
    const projectedBikeCost = bikeSpendingPeriod * scalingFactor;

    // Baseline: Assume current prices are Half-Fare if they aren't explicit travelcards
    // This logic is simplified; a robust version needs to know if the user *already* had a half-fare card.
    // We assume the extracted price is what was paid.
    // If we want "No Card" cost, we might need to double it if they used Half-Fare.
    // For now, let's assume "Point-to-point" usually implies Half-Fare usage for Swiss residents.

    let baselineTicketCost = 0;
    let halfFareTicketCost = 0;

    otherTickets.forEach(item => {
        if (item.ticketType === 'Travelcard') return; // Exclude existing GA/Half-Fare purchases from projections

        // This is a heuristic. Ideally, we'd know if the original price included a discount.
        // We will assume "Point-to-point" prices are Half-Fare prices 
        // and "No Card" price would be double that.
        halfFareTicketCost += item.price;
        baselineTicketCost += (item.price * 2);
    });

    const projectedBaselineTickets = baselineTicketCost * scalingFactor;
    const projectedHalfFareTickets = halfFareTicketCost * scalingFactor;

    const options = [
        {
            name: "No Card", // Pay full price for everything
            total: projectedBaselineTickets + projectedBikeCost,
            breakdown: { card: 0, tickets: projectedBaselineTickets, bike: projectedBikeCost }
        },
        {
            name: "Half-Fare Card",
            total: SBB_PRICES.HALF_FARE + projectedHalfFareTickets + projectedBikeCost,
            breakdown: { card: SBB_PRICES.HALF_FARE, tickets: projectedHalfFareTickets, bike: projectedBikeCost }
        },
        {
            name: "GA Travelcard",
            total: (userAge < 26 ? SBB_PRICES.GA_YOUTH : SBB_PRICES.GA_ADULT) + projectedBikeCost, // GA covers tickets, not bikes
            breakdown: { card: (userAge < 26 ? SBB_PRICES.GA_YOUTH : SBB_PRICES.GA_ADULT), tickets: 0, bike: projectedBikeCost }
        }
    ];

    // Find best
    options.sort((a, b) => a.total - b.total);

    return {
        bestOption: options[0],
        allOptions: options,
        bikeRecommendation: projectedBikeCost > SBB_PRICES.BIKE_PASS
    };
}

function displayResults(result, data) {
    elements.resultsSection.classList.remove('hidden');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });

    const savings = result.allOptions.find(o => o.name === "No Card").total - result.bestOption.total;

    const outputHtml = `
        <div class="mb-4">
            <h3 class="text-2xl font-bold text-gray-800">Recommendation: <span class="text-red-600">${result.bestOption.name}</span></h3>
            <p class="text-lg text-gray-600 mt-2">
                Based on your travel history, the <strong>${result.bestOption.name}</strong> is the most cost-effective choice.
                You could save approximately <strong>CHF ${savings.toFixed(2)}</strong> per year compared to paying full price.
            </p>
        </div>
        
        ${result.bikeRecommendation ? `
        <div class="mt-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <h4 class="font-bold text-blue-800">Cyclist Alert! 🚲</h4>
            <p class="text-blue-700">You are spending enough on bike tickets to justify a <a href="${SBB_LINKS.BIKE_PASS}" target="_blank" class="underline">Velopass</a> (CHF 240/year).</p>
        </div>` : ''}
    `;

    document.getElementById('recommendation-output').innerHTML = outputHtml;

    // Update KPI Cards
    document.getElementById('total-trips').textContent = data.length;
    document.getElementById('total-spent').textContent = `CHF ${data.reduce((s, i) => s + i.price, 0).toFixed(2)}`;
    document.getElementById('unique-travelers').textContent = new Set(data.flatMap(d => d.travelers)).size;
    document.getElementById('avg-trip-cost').textContent = `CHF ${(data.reduce((s, i) => s + i.price, 0) / data.length || 0).toFixed(2)}`;
}

// --- Visualization ---
function generateCharts(data, analysisResult) {
    // Destroy existing charts if they exist
    Object.values(state.charts).forEach(chart => chart && chart.destroy());

    // 1. Spending by Type
    const typeCtx = document.getElementById('type-chart');
    if (typeCtx) {
        // Group by type
        const typeData = data.reduce((acc, item) => {
            acc[item.ticketType] = (acc[item.ticketType] || 0) + item.price;
            return acc;
        }, {});

        state.charts.type = new Chart(typeCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(typeData),
                datasets: [{
                    data: Object.values(typeData),
                    backgroundColor: ['#EB0000', '#2D327D', '#F2C94C', '#27AE60', '#EB5757', '#BB6BD9']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 2. Cost Comparison Bar Chart
    const compCtx = document.getElementById('comparison-chart');
    if (compCtx) {
        state.charts.comparison = new Chart(compCtx, {
            type: 'bar',
            data: {
                labels: analysisResult.allOptions.map(o => o.name),
                datasets: [
                    {
                        label: 'Card Cost',
                        data: analysisResult.allOptions.map(o => o.breakdown.card),
                        backgroundColor: '#EB0000'
                    },
                    {
                        label: 'Tickets',
                        data: analysisResult.allOptions.map(o => o.breakdown.tickets),
                        backgroundColor: '#2D327D'
                    },
                    {
                        label: 'Bikes',
                        data: analysisResult.allOptions.map(o => o.breakdown.bike),
                        backgroundColor: '#F2C94C'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true }
                }
            }
        });
    }
}

async function generateAIInsights(data) {
    try {
        const insightsDiv = document.getElementById('ai-insights');
        if (!insightsDiv) return;

        insightsDiv.innerHTML = '<div class="text-gray-500 italic">Analyzing patterns...</div>';

        // Simplify data for prompt
        const summary = {
            count: data.length,
            total: data.reduce((s, i) => s + i.price, 0),
            routes: data.map(d => d.description).slice(0, 20) // Limit to first 20 to save tokens
        };

        const response = await fetch('/.netlify/functions/process-pdf', {
            method: 'POST',
            body: JSON.stringify({
                text: JSON.stringify(summary),
                isInsightRequest: true
            })
        });

        if (response.ok) {
            const res = await response.json();
            insightsDiv.innerHTML = `<p class="leading-relaxed">${res.data}</p>`;
        }
    } catch (e) {
        console.warn("AI Insight failed", e);
    }
}

function exportToExcel() {
    if (state.travelData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(state.travelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Travel Data");
    XLSX.writeFile(wb, "SBB_Travel_History.xlsx");
}

// --- Mock Data ---
function loadMockData() {
    const mockData = [
        { travelDate: "2024-01-15", description: "Zürich HB - Bern", ticketType: "Point-to-point", travelers: ["Me"], price: 26.50, isRefunded: false },
        { travelDate: "2024-01-15", description: "Bern - Zürich HB", ticketType: "Point-to-point", travelers: ["Me"], price: 26.50, isRefunded: false },
        { travelDate: "2024-02-10", description: "Zürich HB - Luzern", ticketType: "Point-to-point", travelers: ["Me", "Friend"], price: 30.00, isRefunded: false },
        { travelDate: "2024-03-05", description: "ZVV Day Pass", ticketType: "Day Pass", travelers: ["Me"], price: 13.60, isRefunded: false },
        { travelDate: "2024-04-20", description: "Velo Ticket Day", ticketType: "Bike", travelers: ["Me"], price: 14.00, isRefunded: false },
        { travelDate: "2024-05-12", description: "Zürich - Paris", ticketType: "International", travelers: ["Me"], price: 120.00, isRefunded: false },
    ];

    // Simulate loading delay
    resetUI();
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = "Loading sample data...";

    setTimeout(() => {
        elements.loader.classList.add('hidden');
        processAndDisplayData(mockData);
    }, 1500);
}
