// app.js
/**
 * Main Application Module
 * Handles UI interactions, visualizations, and coordinates between modules
 */

import { dataLoader } from './data-loader.js';
import { gruModel } from './gru.js';

class StockPredictorApp {
    constructor() {
        this.isDataLoaded = false;
        this.isModelTrained = false;
        this.currentFile = null;
        this.priceChart = null;
        this.performanceChart = null;
        this.predictions = [];
        this.datasets = null;
        
        this.initEventListeners();
        this.updateUI();
        
        // Initialize TensorFlow.js backend
        tf.setBackend('webgl').then(() => {
            console.log('TensorFlow.js backend initialized');
        });
    }

    /**
     * Initialize event listeners for UI elements
     */
    initEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const dropArea = document.getElementById('dropArea');
        const loadDataBtn = document.getElementById('loadDataBtn');
        const viewDataBtn = document.getElementById('viewDataBtn');
        const trainBtn = document.getElementById('trainBtn');
        const stopTrainBtn = document.getElementById('stopTrainBtn');
        const predictBtn = document.getElementById('predictBtn');
        const downloadSampleBtn = document.getElementById('downloadSampleBtn');

        // File selection
        dropArea.addEventListener('click', () => {
            console.log('File upload area clicked');
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            console.log('File selected via input');
            this.currentFile = e.target.files[0];
            this.onFileSelected();
        });

        // Drag and drop
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.style.borderColor = '#f43f5e';
            dropArea.style.background = 'rgba(244, 63, 94, 0.05)';
        });

        dropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.style.borderColor = '#be123c';
            dropArea.style.background = '';
        });

        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.style.borderColor = '#be123c';
            dropArea.style.background = '';
            
            console.log('File dropped');
            
            if (e.dataTransfer.files.length) {
                this.currentFile = e.dataTransfer.files[0];
                fileInput.files = e.dataTransfer.files;
                this.onFileSelected();
            }
        });

        // Button clicks
        loadDataBtn.addEventListener('click', () => {
            console.log('Load data button clicked');
            this.loadAndPrepareData();
        });
        
        viewDataBtn.addEventListener('click', () => {
            console.log('View data button clicked');
            this.showDataStats();
        });
        
        trainBtn.addEventListener('click', () => {
            console.log('Train button clicked');
            this.trainModel();
        });
        
        stopTrainBtn.addEventListener('click', () => {
            console.log('Stop training button clicked');
            this.stopTraining();
        });
        
        predictBtn.addEventListener('click', () => {
            console.log('Predict button clicked');
            this.makePredictions();
        });
        
        downloadSampleBtn.addEventListener('click', () => {
            console.log('Download sample button clicked');
            this.downloadSampleData();
        });
    }

    /**
     * Handle file selection
     */
    onFileSelected() {
        if (this.currentFile) {
            console.log('File selected:', this.currentFile.name, 'Size:', this.currentFile.size, 'bytes');
            
            const fileType = this.currentFile.name.toLowerCase();
            if (!fileType.endsWith('.csv')) {
                this.showStatus('error', 'Please upload a CSV file');
                return;
            }
            
            this.showStatus('info', `File selected: ${this.currentFile.name} (${Math.round(this.currentFile.size / 1024)} KB)`);
            
            // Enable load data button
            const loadDataBtn = document.getElementById('loadDataBtn');
            loadDataBtn.disabled = false;
            loadDataBtn.innerHTML = '<i class="fas fa-file-import"></i> Load & Prepare Data';
            
            this.updateUI();
        }
    }

    /**
     * Download sample CSV data
     */
    downloadSampleData() {
        try {
            dataLoader.downloadSampleCSV();
            this.showStatus('success', 'Sample CSV file downloaded successfully. Upload it to start.');
        } catch (error) {
            console.error('Error downloading sample:', error);
            this.showStatus('error', 'Failed to download sample file: ' + error.message);
        }
    }

    /**
     * Load and prepare data from uploaded file
     */
    async loadAndPrepareData() {
        if (!this.currentFile) {
            this.showStatus('error', 'Please select a CSV file first');
            return;
        }

        const loadDataBtn = document.getElementById('loadDataBtn');
        loadDataBtn.disabled = true;
        loadDataBtn.innerHTML = '<div class="loading"></div> Loading...';

        const progressContainer = document.getElementById('dataProgressContainer');
        const progressFill = document.getElementById('dataProgressFill');
        const progressText = document.getElementById('dataProgressText');
        const statusText = document.getElementById('dataStatusText');

        progressContainer.style.display = 'block';
        progressFill.style.width = '10%';
        progressText.textContent = '10%';
        statusText.textContent = 'Reading file...';

        try {
            // Step 1: Load CSV
            this.showStatus('info', 'Reading CSV file...');
            await dataLoader.loadCSV(this.currentFile);
            
            progressFill.style.width = '30%';
            progressText.textContent = '30%';
            statusText.textContent = 'Parsing data...';

            // Step 2: Preprocess data
            this.showStatus('info', 'Preprocessing data...');
            this.datasets = dataLoader.preprocessData();
            
            progressFill.style.width = '60%';
            progressText.textContent = '60%';
            statusText.textContent = 'Creating sequences...';

            // Step 3: Show stats
            const stats = dataLoader.getStats();
            if (stats) {
                console.log('Data statistics:', stats);
                
                progressFill.style.width = '80%';
                progressText.textContent = '80%';
                statusText.textContent = 'Finalizing...';
                
                // Update UI
                this.isDataLoaded = true;
                
                // Enable train button
                const trainBtn = document.getElementById('trainBtn');
                trainBtn.disabled = false;
                
                // Enable view data button
                const viewDataBtn = document.getElementById('viewDataBtn');
                viewDataBtn.disabled = false;
                
                progressFill.style.width = '100%';
                progressText.textContent = '100%';
                statusText.textContent = 'Complete!';
                
                this.showStatus('success', 
                    `Data loaded successfully! ${stats.totalDays} days, ` +
                    `Price range: $${stats.minPrice} - $${stats.maxPrice}`
                );
                
                // Update UI state
                this.updateUI();
                
                // Show initial visualization
                setTimeout(() => {
                    this.createInitialVisualization();
                }, 500);
                
            } else {
                throw new Error('Failed to get data statistics');
            }

        } catch (error) {
            console.error('Error loading data:', error);
            this.showStatus('error', `Failed to load data: ${error.message}`);
            
            loadDataBtn.disabled = false;
            loadDataBtn.innerHTML = '<i class="fas fa-file-import"></i> Load & Prepare Data';
            progressContainer.style.display = 'none';
            
            // Reset state
            this.isDataLoaded = false;
            this.updateUI();
        }
    }

    /**
     * Show data statistics
     */
    showDataStats() {
        if (!dataLoader.data || dataLoader.data.length === 0) {
            this.showStatus('error', 'No data loaded. Please load data first.');
            return;
        }

        const stats = dataLoader.getStats();
        if (!stats) {
            this.showStatus('error', 'Could not calculate statistics');
            return;
        }

        // Create stats dialog
        const statsHtml = `
            <div style="background: rgba(30,30,30,0.95); padding: 20px; border-radius: 10px; border: 2px solid #f43f5e; max-width: 500px;">
                <h3 style="color: #f43f5e; margin-bottom: 15px;"><i class="fas fa-chart-bar"></i> Data Statistics</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        <div style="color: #fda4af; font-size: 0.9rem;">Total Days</div>
                        <div style="color: white; font-size: 1.5rem; font-weight: bold;">${stats.totalDays}</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        <div style="color: #fda4af; font-size: 0.9rem;">Min Price</div>
                        <div style="color: white; font-size: 1.5rem; font-weight: bold;">$${stats.minPrice}</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        <div style="color: #fda4af; font-size: 0.9rem;">Max Price</div>
                        <div style="color: white; font-size: 1.5rem; font-weight: bold;">$${stats.maxPrice}</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        <div style="color: #fda4af; font-size: 0.9rem;">Last Price</div>
                        <div style="color: white; font-size: 1.5rem; font-weight: bold;">$${stats.lastPrice}</div>
                    </div>
                    ${stats.meanReturn ? `
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        <div style="color: #fda4af; font-size: 0.9rem;">Avg Return</div>
                        <div style="color: white; font-size: 1.5rem; font-weight: bold;">${stats.meanReturn}%</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        <div style="color: #fda4af; font-size: 0.9rem;">Volatility</div>
                        <div style="color: white; font-size: 1.5rem; font-weight: bold;">${stats.volatility}%</div>
                    </div>
                    ` : ''}
                </div>
                <div style="margin-top: 15px; color: #fda4af; font-size: 0.9rem;">
                    <i class="fas fa-info-circle"></i> Features: ${stats.features.join(', ') || 'Close price only'}
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button onclick="this.parentElement.parentElement.remove()" 
                            style="background: #f43f5e; color: white; border: none; padding: 8px 20px; border-radius: 5px; cursor: pointer;">
                        Close
                    </button>
                </div>
            </div>
        `;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        overlay.innerHTML = statsHtml;
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });

        document.body.appendChild(overlay);
    }

    /**
     * Train the GRU model
     */
    async trainModel() {
        if (!this.datasets) {
            this.showStatus('error', 'No data loaded. Please load data first.');
            return;
        }

        const trainBtn = document.getElementById('trainBtn');
        const stopTrainBtn = document.getElementById('stopTrainBtn');
        const predictBtn = document.getElementById('predictBtn');
        
        trainBtn.disabled = true;
        trainBtn.innerHTML = '<div class="loading"></div> Training...';
        stopTrainBtn.disabled = false;
        predictBtn.disabled = true;

        const progressContainer = document.getElementById('trainProgressContainer');
        const progressFill = document.getElementById('trainProgressFill');
        const progressText = document.getElementById('trainProgressText');
        const statusText = document.getElementById('trainStatusText');

        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        statusText.textContent = 'Building model...';

        try {
            // Build model
            gruModel.buildModel();
            
            progressFill.style.width = '10%';
            progressText.textContent = '10%';
            statusText.textContent = 'Starting training...';

            // Train model
            const startTime = Date.now();
            
            await gruModel.train(
                this.datasets.X_train,
                this.datasets.y_train,
                this.datasets.X_test,
                this.datasets.y_test,
                {
                    onEpochEnd: (epoch, logs) => {
                        const progress = Math.min(10 + (epoch / 100) * 90, 100);
                        progressFill.style.width = `${progress}%`;
                        progressText.textContent = `${Math.round(progress)}%`;
                        statusText.textContent = `Epoch ${epoch + 1}/100 - Loss: ${logs.loss.toFixed(6)}`;
                        
                        // Update metrics in real-time
                        document.getElementById('trainLoss').textContent = logs.loss.toFixed(4);
                        document.getElementById('valLoss').textContent = logs.val_loss.toFixed(4);
                        document.getElementById('trainAcc').textContent = (1 - logs.mae).toFixed(4);
                        document.getElementById('valAcc').textContent = (1 - logs.val_mae).toFixed(4);
                    },
                    onTrainEnd: () => {
                        const trainingTime = ((Date.now() - startTime) / 1000).toFixed(1);
                        this.showStatus('success', `Training completed in ${trainingTime} seconds`);
                        
                        this.isModelTrained = true;
                        predictBtn.disabled = false;
                        trainBtn.disabled = true;
                        trainBtn.innerHTML = '<i class="fas fa-check-circle"></i> Training Complete';
                        stopTrainBtn.disabled = true;
                        
                        // Create performance chart
                        this.createPerformanceChart();
                    }
                }
            );

        } catch (error) {
            console.error('Error training model:', error);
            this.showStatus('error', `Training failed: ${error.message}`);
            
            trainBtn.disabled = false;
            trainBtn.innerHTML = '<i class="fas fa-play-circle"></i> Train Model';
            stopTrainBtn.disabled = true;
            predictBtn.disabled = true;
            progressContainer.style.display = 'none';
            
            this.isModelTrained = false;
        }
    }

    /**
     * Stop training
     */
    stopTraining() {
        gruModel.stopTraining();
        this.showStatus('info', 'Training stopped');
        
        const trainBtn = document.getElementById('trainBtn');
        const stopTrainBtn = document.getElementById('stopTrainBtn');
        
        trainBtn.disabled = false;
        trainBtn.innerHTML = '<i class="fas fa-play-circle"></i> Train Model';
        stopTrainBtn.disabled = true;
    }

    /**
     * Make predictions for next 5 days
     */
    async makePredictions() {
        if (!this.isModelTrained) {
            this.showStatus('error', 'Model not trained. Please train the model first.');
            return;
        }

        if (!dataLoader.data || dataLoader.data.length === 0) {
            this.showStatus('error', 'No data available for prediction');
            return;
        }

        const predictBtn = document.getElementById('predictBtn');
        predictBtn.disabled = true;
        predictBtn.innerHTML = '<div class="loading"></div> Predicting...';

        try {
            // Get latest window
            const latestWindow = dataLoader.getLatestWindow();
            
            // Make prediction
            const normalizedPredictions = gruModel.forecast(latestWindow);
            
            // Denormalize predictions
            const denormalized = dataLoader.denormalizeArray(normalizedPredictions, 'target');
            
            // Get last actual price
            const lastPrice = dataLoader.data[dataLoader.data.length - 1][dataLoader.targetColumn];
            
            // Update prediction cards
            this.updatePredictionCards(denormalized, lastPrice);
            
            // Store predictions
            this.predictions = denormalized;
            
            // Update price chart with predictions
            this.updatePriceChartWithPredictions(denormalized);
            
            predictBtn.disabled = false;
            predictBtn.innerHTML = '<i class="fas fa-crystal-ball"></i> Make Predictions';
            
            this.showStatus('success', 'Predictions generated for next 5 days');
            
        } catch (error) {
            console.error('Error making predictions:', error);
            this.showStatus('error', `Prediction failed: ${error.message}`);
            
            predictBtn.disabled = false;
            predictBtn.innerHTML = '<i class="fas fa-crystal-ball"></i> Make Predictions';
        }
    }

    /**
     * Update prediction cards in UI
     */
    updatePredictionCards(predictions, lastPrice) {
        const cards = document.querySelectorAll('.prediction-card');
        
        predictions.forEach((prediction, index) => {
            if (cards[index]) {
                const priceChange = ((prediction - lastPrice) / lastPrice * 100);
                
                cards[index].querySelector('.prediction-value').textContent = `$${prediction.toFixed(2)}`;
                
                const directionElement = cards[index].querySelector('.prediction-direction');
                directionElement.textContent = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
                directionElement.className = `prediction-direction ${priceChange >= 0 ? 'direction-up' : 'direction-down'}`;
            }
        });
    }

    /**
     * Create initial visualization of data
     */
    createInitialVisualization() {
        if (!dataLoader.data || dataLoader.data.length === 0) {
            return;
        }

        const prices = dataLoader.data.map(row => row[dataLoader.targetColumn]);
        const labels = dataLoader.data.map((row, i) => `Day ${i + 1}`);

        // Destroy existing chart if any
        if (this.priceChart) {
            this.priceChart.destroy();
        }

        const ctx = document.getElementById('priceChart').getContext('2d');
        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'S&P 500 Price',
                    data: prices,
                    borderColor: '#f43f5e',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#fda4af'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#fda4af',
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: 'rgba(253, 164, 175, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#fda4af',
                            callback: function(value) {
                                return '$' + value.toFixed(0);
                            }
                        },
                        grid: {
                            color: 'rgba(253, 164, 175, 0.1)'
                        }
                    }
                }
            }
        });
    }

    /**
     * Update price chart with predictions
     */
    updatePriceChartWithPredictions(predictions) {
        if (!this.priceChart || !dataLoader.data) {
            return;
        }

        const lastIndex = dataLoader.data.length - 1;
        const predictionLabels = [];
        const predictionData = [];

        // Add the last actual point for continuity
        predictionLabels.push(`Day ${lastIndex + 1}`);
        predictionData.push(dataLoader.data[lastIndex][dataLoader.targetColumn]);

        // Add predictions
        predictions.forEach((pred, i) => {
            predictionLabels.push(`Day ${lastIndex + 2 + i} (Pred)`);
            predictionData.push(pred);
        });

        // Add prediction dataset
        this.priceChart.data.datasets.push({
            label: '5-Day Forecast',
            data: predictionData,
            borderColor: '#48bb78',
            backgroundColor: 'rgba(72, 187, 120, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.1,
            pointRadius: 4
        });

        // Update labels
        this.priceChart.data.labels = [
            ...this.priceChart.data.labels.slice(-50), // Last 50 actual points
            ...predictionLabels.slice(1) // All predictions except the first (which is last actual)
        ];

        this.priceChart.update();
    }

    /**
     * Create performance chart
     */
    createPerformanceChart() {
        const history = gruModel.trainingHistory;
        
        if (history.epochs.length === 0) {
            return;
        }

        // Destroy existing chart if any
        if (this.performanceChart) {
            this.performanceChart.destroy();
        }

        const ctx = document.getElementById('performanceChart').getContext('2d');
        this.performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.epochs,
                datasets: [
                    {
                        label: 'Training Loss',
                        data: history.loss,
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: 'Validation Loss',
                        data: history.valLoss,
                        borderColor: '#4299e1',
                        backgroundColor: 'rgba(66, 153, 225, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#fda4af'
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Epoch',
                            color: '#fda4af'
                        },
                        ticks: {
                            color: '#fda4af'
                        },
                        grid: {
                            color: 'rgba(253, 164, 175, 0.1)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Loss (MSE)',
                            color: '#fda4af'
                        },
                        ticks: {
                            color: '#fda4af'
                        },
                        grid: {
                            color: 'rgba(253, 164, 175, 0.1)'
                        },
                        type: 'logarithmic'
                    }
                }
            }
        });
    }

    /**
     * Show status message
     */
    showStatus(type, message) {
        const statusElement = document.getElementById(type === 'data' ? 'dataStatus' : 'trainStatus');
        
        statusElement.textContent = message;
        statusElement.className = `status-message status-${type}`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }

    /**
     * Update UI state
     */
    updateUI() {
        // Update button states
        const loadDataBtn = document.getElementById('loadDataBtn');
        const viewDataBtn = document.getElementById('viewDataBtn');
        const trainBtn = document.getElementById('trainBtn');
        const predictBtn = document.getElementById('predictBtn');
        const stopTrainBtn = document.getElementById('stopTrainBtn');

        // Update based on current state
        if (this.currentFile) {
            loadDataBtn.disabled = false;
        }

        if (this.isDataLoaded) {
            viewDataBtn.disabled = false;
            trainBtn.disabled = false;
        }

        if (this.isModelTrained) {
            predictBtn.disabled = false;
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.priceChart) {
            this.priceChart.destroy();
        }
        if (this.performanceChart) {
            this.performanceChart.destroy();
        }
        if (this.datasets) {
            this.datasets.X_train.dispose();
            this.datasets.y_train.dispose();
            this.datasets.X_test.dispose();
            this.datasets.y_test.dispose();
        }
        gruModel.dispose();
        dataLoader.dispose();
        
        console.log('Application resources cleaned up');
    }
}

// Initialize application when page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new StockPredictorApp();
    console.log('S&P 500 Stock Predictor initialized');
});

// Make app available globally for debugging
window.app = app;
