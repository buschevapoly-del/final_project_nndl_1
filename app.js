class StockPredictionApp {
    constructor() {
        this.gruModel = new GRUModel();
        this.currentData = null;
        this.isTraining = false;
        this.modelTrained = false;
        this.initEventListeners();
        this.initCharts();
        this.updateStatus('Ready to load data', 'info');
    }
    
    initEventListeners() {
        // File upload
        document.getElementById('csvFile').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });
        
        // Train button
        document.getElementById('trainBtn').addEventListener('click', () => {
            this.trainModel();
        });
        
        // Predict button
        document.getElementById('predictBtn').addEventListener('click', () => {
            this.predictNextDays();
        });
        
        // Reset button
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetApplication();
        });
        
        // Input validation
        ['lookbackInput', 'epochsInput', 'batchSizeInput'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                const min = parseInt(e.target.min);
                const max = parseInt(e.target.max);
                
                if (value < min) e.target.value = min;
                if (value > max) e.target.value = max;
            });
        });
    }
    
    initCharts() {
        // Loss chart
        this.lossChart = Plotly.newPlot('lossChart', [{
            x: [],
            y: [],
            type: 'line',
            name: 'Training Loss',
            line: { color: '#ff4d8d', width: 3 }
        }, {
            x: [],
            y: [],
            type: 'line',
            name: 'Validation Loss',
            line: { color: '#9d4edd', width: 3 }
        }], {
            title: 'Training Progress (RMSE)',
            xaxis: { title: 'Epoch', gridcolor: '#333' },
            yaxis: { title: 'Loss', gridcolor: '#333' },
            plot_bgcolor: '#1a1a1a',
            paper_bgcolor: '#1a1a1a',
            font: { color: '#fff' },
            legend: { 
                bgcolor: 'rgba(0,0,0,0.5)',
                font: { color: '#fff' }
            },
            margin: { t: 40, r: 40, b: 60, l: 60 }
        });
        
        // Prediction chart
        this.predictionChart = null;
    }
    
    async handleFileUpload(file) {
        if (!file) return;
        
        this.updateStatus(`Loading file: ${file.name}`, 'info');
        this.updateProgress(0);
        
        try {
            const text = await this.readFileAsText(file);
            const data = await this.parseCSV(text);
            
            if (!this.validateCSVData(data)) {
                this.updateStatus('Invalid CSV format. Expected Yahoo Finance columns.', 'error');
                return;
            }
            
            this.currentData = this.processRawData(data);
            this.updateStatus(`Loaded ${data.length} records successfully`, 'success');
            this.updateStatus('Click "Train Model" to begin training', 'info');
            document.getElementById('trainBtn').disabled = false;
            
            // Update stats
            document.getElementById('trainSamples').textContent = '-';
            document.getElementById('valSamples').textContent = '-';
            
        } catch (error) {
            this.updateStatus(`Error loading file: ${error.message}`, 'error');
            console.error(error);
        }
    }
    
    readFileAsText(file) {
        return new Promise
