// data-loader.js
/**
 * Data Loader Module for S&P 500 Index
 * Handles CSV parsing, normalization, and dataset preparation
 */

class DataLoader {
    constructor() {
        this.data = null;
        this.featureColumns = [];
        this.targetColumn = 'Close'; // S&P 500 closing price
        this.sequenceLength = 60; // 60-day window
        this.forecastDays = 5; // Predict next 5 days
        this.trainTestSplit = 0.8;
        this.normalizationParams = {};
    }

    /**
     * Load and parse CSV file from file input
     * @param {File} file - CSV file object
     * @returns {Promise<Array>} - Parsed data array
     */
    async loadCSV(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const csvData = e.target.result;
                    this.parseCSV(csvData);
                    console.log(`Loaded ${this.data.length} rows with features: ${this.featureColumns.join(', ')}`);
                    resolve(this.data);
                } catch (error) {
                    console.error('CSV parsing error:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV data and extract features
     * @param {string} csvText - CSV content
     */
    parseCSV(csvText) {
        console.log('Parsing CSV data...');
        
        const lines = csvText.trim().split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) {
            throw new Error('CSV file is empty or has only headers');
        }

        // Handle headers - try comma separation first
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // If we only have one column, it's likely just prices
        if (headers.length === 1) {
            console.log('Single column detected - assuming price data only');
            this.featureColumns = ['Close'];
            
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const value = parseFloat(lines[i].trim().replace(/"/g, ''));
                if (!isNaN(value) && value > 0) {
                    rows.push({
                        'Close': value,
                        'Date': `Day ${i}` // Generate placeholder dates
                    });
                }
            }
            
            this.data = rows;
            return;
        }

        // Multi-column CSV - identify feature columns
        this.featureColumns = headers.filter(h => 
            h !== 'Date' && 
            h !== this.targetColumn && 
            h.toLowerCase().includes('price') || 
            h.toLowerCase().includes('close') ||
            h.toLowerCase().includes('value')
        );
        
        // If no feature columns found, use all numeric columns except Date
        if (this.featureColumns.length === 0) {
            this.featureColumns = headers.filter(h => h !== 'Date');
        }
        
        console.log('Feature columns identified:', this.featureColumns);

        // Parse data rows
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};
            
            headers.forEach((header, index) => {
                if (index < values.length) {
                    const val = values[index];
                    const numVal = parseFloat(val);
                    // Use numeric value if valid, otherwise use the string
                    row[header] = !isNaN(numVal) ? numVal : val;
                }
            });
            
            // Make sure we have the target column
            if (!row.hasOwnProperty(this.targetColumn) && this.featureColumns.length > 0) {
                row[this.targetColumn] = row[this.featureColumns[0]];
            }
            
            rows.push(row);
        }
        
        this.data = rows;
        console.log(`Parsed ${rows.length} data rows`);
    }

    /**
     * Generate sample CSV data for S&P 500
     * @returns {string} - Sample CSV content
     */
    generateSampleCSV() {
        // Generate realistic S&P 500 data (last 1000 trading days)
        let startPrice = 4000;
        let volatility = 0.015;
        let drift = 0.0001;
        
        let csvContent = "Date,Open,High,Low,Close,Volume\n";
        
        let currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - 1000);
        
        for (let i = 0; i < 1000; i++) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const open = startPrice;
            
            // Generate price movement
            const dailyReturn = (Math.random() - 0.5) * 2 * volatility + drift;
            const close = open * (1 + dailyReturn);
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);
            const volume = Math.floor(Math.random() * 1000000) + 500000;
            
            csvContent += `${dateStr},${open.toFixed(2)},${high.toFixed(2)},${low.toFixed(2)},${close.toFixed(2)},${volume}\n`;
            
            startPrice = close;
            currentDate.setDate(currentDate.getDate() + 1);
            
            // Skip weekends
            if (currentDate.getDay() === 0) currentDate.setDate(currentDate.getDate() + 1);
            if (currentDate.getDay() === 6) currentDate.setDate(currentDate.getDate() + 2);
        }
        
        return csvContent;
    }

    /**
     * Download sample CSV file
     */
    downloadSampleCSV() {
        const csvContent = this.generateSampleCSV();
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sp500_sample_data.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Sample CSV downloaded');
    }

    /**
     * Preprocess data for model training
     * @returns {Object} - Processed datasets
     */
    preprocessData() {
        if (!this.data || this.data.length === 0) {
            throw new Error('No data loaded');
        }

        console.log(`Preprocessing ${this.data.length} data points...`);

        // Extract features and target
        const features = this.featureColumns.map(col => 
            this.data.map(row => row[col])
        );
        
        const target = this.data.map(row => row[this.targetColumn]);

        console.log(`Features shape: ${features.length} x ${features[0].length}`);
        console.log(`Target shape: ${target.length}`);

        // Normalize data
        const normalizedFeatures = this.normalizeFeatures(features);
        const normalizedTarget = this.normalizeArray(target, 'target');

        // Create sequences for multi-day prediction
        return this.createMultiDaySequences(normalizedFeatures, normalizedTarget);
    }

    /**
     * Normalize feature arrays
     * @param {Array} features - Array of feature arrays
     * @returns {Array} - Normalized features
     */
    normalizeFeatures(features) {
        return features.map((featureArray, index) => 
            this.normalizeArray(featureArray, `feature_${index}`)
        );
    }

    /**
     * Normalize an array and store parameters
     * @param {Array} array - Array to normalize
     * @param {string} name - Name for parameter storage
     * @returns {Array} - Normalized array
     */
    normalizeArray(array, name) {
        const min = Math.min(...array);
        const max = Math.max(...array);
        
        // Store normalization parameters
        this.normalizationParams[name] = { min, max, range: max - min || 1 };
        
        return array.map(val => (val - min) / (max - min || 1));
    }

    /**
     * Denormalize an array
     * @param {Array} normalizedArray - Normalized array
     * @param {string} name - Parameter name
     * @returns {Array} - Denormalized array
     */
    denormalizeArray(normalizedArray, name) {
        const params = this.normalizationParams[name];
        if (!params) {
            throw new Error(`Normalization parameters not found for ${name}`);
        }
        
        return normalizedArray.map(val => val * params.range + params.min);
    }

    /**
     * Create sequences for multi-day prediction
     * @param {Array} normalizedFeatures - Normalized features
     * @param {Array} normalizedTarget - Normalized target
     * @returns {Object} - Training and testing datasets
     */
    createMultiDaySequences(normalizedFeatures, normalizedTarget) {
        const sequences = [];
        const targets = [];
        
        const totalSamples = normalizedTarget.length - this.sequenceLength - this.forecastDays + 1;
        
        console.log(`Creating sequences: ${totalSamples} samples`);
        
        for (let i = 0; i < totalSamples; i++) {
            const sequence = [];
            for (let j = 0; j < this.sequenceLength; j++) {
                const timeStep = [];
                normalizedFeatures.forEach(feature => {
                    timeStep.push(feature[i + j]);
                });
                sequence.push(timeStep);
            }
            sequences.push(sequence);
            
            // Get next forecastDays target values
            const nextValues = normalizedTarget.slice(
                i + this.sequenceLength, 
                i + this.sequenceLength + this.forecastDays
            );
            targets.push(nextValues);
        }

        // Split into train/test
        const splitIndex = Math.floor(sequences.length * this.trainTestSplit);
        
        const X_train = sequences.slice(0, splitIndex);
        const y_train = targets.slice(0, splitIndex);
        const X_test = sequences.slice(splitIndex);
        const y_test = targets.slice(splitIndex);

        console.log(`Train set: ${X_train.length} samples`);
        console.log(`Test set: ${X_test.length} samples`);

        return {
            X_train: tf.tensor3d(X_train),
            y_train: tf.tensor2d(y_train),
            X_test: tf.tensor3d(X_test),
            y_test: tf.tensor2d(y_test),
            featureNames: this.featureColumns,
            sequenceLength: this.sequenceLength,
            forecastDays: this.forecastDays
        };
    }

    /**
     * Get the latest window for prediction
     * @returns {tf.Tensor} - Latest window tensor
     */
    getLatestWindow() {
        if (!this.data || this.data.length === 0) {
            throw new Error('No data loaded');
        }

        // Get last sequenceLength days of features
        const latestFeatures = this.featureColumns.map(col => 
            this.data.slice(-this.sequenceLength).map(row => row[col])
        );

        // Normalize using stored parameters
        const normalizedFeatures = latestFeatures.map((featureArray, index) => {
            const params = this.normalizationParams[`feature_${index}`];
            return featureArray.map(val => (val - params.min) / params.range);
        });

        // Create time steps
        const sequence = [];
        for (let i = 0; i < this.sequenceLength; i++) {
            const timeStep = normalizedFeatures.map(feature => feature[i]);
            sequence.push(timeStep);
        }

        return tf.tensor3d([sequence]);
    }

    /**
     * Get data statistics
     * @returns {Object} - Data statistics
     */
    getStats() {
        if (!this.data || this.data.length === 0) {
            return null;
        }

        const targetValues = this.data.map(row => row[this.targetColumn]);
        const returns = [];
        
        for (let i = 1; i < targetValues.length; i++) {
            returns.push((targetValues[i] - targetValues[i-1]) / targetValues[i-1]);
        }

        return {
            totalDays: this.data.length,
            minPrice: Math.min(...targetValues).toFixed(2),
            maxPrice: Math.max(...targetValues).toFixed(2),
            meanPrice: (targetValues.reduce((a, b) => a + b, 0) / targetValues.length).toFixed(2),
            meanReturn: (returns.reduce((a, b) => a + b, 0) / returns.length * 100).toFixed(3),
            volatility: (Math.sqrt(returns.reduce((sq, n) => sq + n * n, 0) / returns.length) * 100).toFixed(3),
            featureCount: this.featureColumns.length,
            features: this.featureColumns
        };
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.data) {
            this.data = null;
        }
        this.featureColumns = [];
        this.normalizationParams = {};
    }
}

// Export singleton instance
export const dataLoader = new DataLoader();
