// app.js
/**
 * Main application controller
 * Handles UI, data loading, and visualization
 */

import { GRUModel } from './gru.js';

class SP500Predictor {
    constructor() {
        this.model = new GRUModel();
        this.data = null;
        this.normalizedReturns = null;
        this.sequences = null;
        this.trainData = null;
        this.valData = null;
        this.testData = null;
        this.predictions = null;
        this.currentPredictions = null;
        
        // UI elements
        this.ui = {
            fileInput: document.getElementById('fileInput'),
            uploadContainer: document.getElementById('uploadContainer'),
            trainBtn: document.getElementById('trainBtn'),
            generateBtn: document.getElementById('generateBtn'),
            predictBtn: document.getElementById('predictBtn'),
            seqLength: document.getElementById('seqLength'),
            trainRatio: document.getElementById('trainRatio'),
            gruUnits: document.getElementById('gruUnits'),
            epochs: document.getElementById('epochs'),
            progressContainer: document.getElementById('progressContainer'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            status: document.getElementById('status'),
            error: document.getElementById('error'),
            trainLoss: document.getElementById('trainLoss'),
            valLoss: document.getElementById('valLoss'),
            trainSamples: document.getElementById('trainSamples'),
            valSamples: document.getElementById('valSamples'),
            archSeqLength: document.getElementById('archSeqLength'),
            archGruUnits: document.getElementById('archGruUnits'),
            predictionCards: document.getElementById('predictionCards'),
            lossPlot: document.getElementById('lossPlot'),
            predictionPlot: document.getElementById('predictionPlot')
        };
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.bindEvents();
        this.updateArchitectureDisplay();
        this.showStatus('Ready to load or generate data', 'info');
    }

    /**
     * Bind event listeners to UI elements
     */
    bindEvents() {
        // File upload
        this.ui.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.ui.uploadContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.ui.uploadContainer.style.borderColor = '#ff2e63';
        });
        this.ui.uploadContainer.addEventListener('dragleave', () => {
            this.ui.uploadContainer.style.borderColor = '#333333';
        });
        this.ui.uploadContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            this.ui.uploadContainer.style.borderColor = '#333333';
            if (e.dataTransfer.files.length) {
                this.ui.fileInput.files = e.dataTransfer.files;
                this.handleFileUpload(e);
            }
        });

        // Buttons
        this.ui.trainBtn.addEventListener('click', () => this.trainModel());
        this.ui.generateBtn.addEventListener('click', () => this.generateData());
        this.ui.predictBtn.addEventListener('click', () => this.predictNextDays());

        // Parameter changes
        this.ui.seqLength.addEventListener('change', () => this.updateArchitectureDisplay());
        this.ui.gruUnits.addEventListener('change', () => this.updateArchitectureDisplay());
    }

    /**
     * Update architecture display based on parameters
     */
    updateArchitectureDisplay() {
        this.ui.archSeqLength.textContent = this.ui.seqLength.value;
        this.ui.archGruUnits.textContent = this.ui.gruUnits.value;
    }

    /**
     * Handle CSV file upload
     */
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showStatus('Loading CSV file...', 'info');
        this.clearError();

        try {
            const text = await file.text();
            this.parseCSVData(text);
            this.ui.predictBtn.disabled = false;
        } catch (error) {
            this.showError(`Error loading file: ${error.message}`);
            console.error(error);
        }
    }

    /**
     * Parse CSV data (expects Date,Close columns)
     */
    parseCSVData(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Find date and close price columns
        const dateIndex = headers.findIndex(h => 
            h.toLowerCase().includes('date'));
        const closeIndex = headers.findIndex(h => 
            h.toLowerCase().includes('close') || h.toLowerCase().includes('price'));
        
        if (dateIndex === -1 || closeIndex === -1) {
            throw new Error('CSV must contain Date and Close columns');
        }

        const dates = [];
        const prices = [];
        
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',').map(c => c.trim());
            if (cells.length >= Math.max(dateIndex, closeIndex) + 1) {
                dates.push(cells[dateIndex]);
                prices.push(parseFloat(cells[closeIndex]));
            }
        }

        // Calculate returns
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const ret = (prices[i] - prices[i-1]) / prices[i-1];
            returns.push(ret);
        }

        this.data = {
            dates: dates.slice(1), // Remove first date since no return
            prices: prices.slice(1),
            returns: returns
        };

        this.showStatus(`Loaded ${returns.length} days of return data`, 'success');
        this.updateDataStats();
    }

    /**
     * Generate synthetic S&P 500 data
     */
    generateData() {
        this.showStatus('Generating synthetic S&P 500 data...', 'info');
        
        // Generate 3 years of data (~750 trading days)
        this.data = this.model.generateSyntheticData(750);
        
        this.ui.predictBtn.disabled = false;
        this.showStatus(`Generated ${this.data.returns.length} days of synthetic return data`, 'success');
        this.updateDataStats();
        
        // Plot the generated data
        this.plotGeneratedData();
    }

    /**
     * Plot generated synthetic data
     */
    plotGeneratedData() {
        const trace1 = {
            x: this.data.dates.filter((_, i) => i % 10 === 0), // Sample every 10th date
            y: this.data.returns.filter((_, i) => i % 10 === 0).map(r => r * 100), // Convert to percentage
            type: 'scatter',
            mode: 'lines',
            name: 'Daily Returns (%)',
            line: { color: '#ff2e63', width: 2 }
        };

        const layout = {
            title: 'Synthetic S&P 500 Daily Returns',
            plot_bgcolor: '#1a1a1a',
            paper_bgcolor: '#1a1a1a',
            font: { color: '#ffffff' },
            xaxis: { 
                title: 'Date',
                gridcolor: '#333333',
                zerolinecolor: '#333333'
            },
            yaxis: { 
                title: 'Return (%)',
                gridcolor: '#333333',
                zerolinecolor: '#333333'
            },
            showlegend: true,
            legend: { 
                x: 0.01, 
                xanchor: 'left',
                y: 0.99,
                yanchor: 'top',
                bgcolor: 'rgba(0,0,0,0.5)'
            }
        };

        Plotly.newPlot(this.ui.predictionPlot, [trace1], layout);
    }

    /**
     * Update data statistics display
     */
    updateDataStats() {
        if (!this.data || !this.data.returns.length) return;

        const returns = this.data.returns;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const std = Math.sqrt(returns.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / returns.length);
        
        this.ui.trainSamples.textContent = Math.floor(returns.length * 0.7).toLocaleString();
        this.ui.valSamples.textContent = Math.floor(returns.length * 0.15).toLocaleString();
    }

    /**
     * Prepare data for training
     */
    prepareData() {
        if (!this.data || !this.data.returns.length) {
            throw new Error('No data loaded. Please upload or generate data first.');
        }

        const sequenceLength = parseInt(this.ui.seqLength.value);
        const trainRatio = parseFloat(this.ui.trainRatio.value);
        
        // Normalize returns
        const returnsTensor = tf.tensor1d(this.data.returns);
        this.normalizedReturns = this.model.normalizeData(returnsTensor);
        const normalizedArray = this.normalizedReturns.arraySync();
        
        returnsTensor.dispose();

        // Create sequences
        this.sequences = this.model.createSequences(normalizedArray, sequenceLength);
        
        // Split data
        const totalSamples = this.sequences.xs.shape[0];
        const trainEnd = Math.floor(totalSamples * trainRatio);
        const valEnd = Math.floor(totalSamples * (trainRatio + (1 - trainRatio) / 2));
        
        // Training data
        const xTrain = this.sequences.xs.slice([0, 0, 0], [trainEnd, sequenceLength, 1]);
        const yTrain = this.sequences.ys.slice([0, 0], [trainEnd, 1]);
        
        // Validation data
        const xVal = this.sequences.xs.slice([trainEnd, 0, 0], [valEnd - trainEnd, sequenceLength, 1]);
        const yVal = this.sequences.ys.slice([trainEnd, 0], [valEnd - trainEnd, 1]);
        
        // Test data (last part)
        const xTest = this.sequences.xs.slice([valEnd, 
