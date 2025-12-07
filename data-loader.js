// data-loader.js
/**
 * Data loader for S&P 500 returns prediction
 * Handles CSV parsing, data preprocessing, and splitting
 */

class DataLoader {
    constructor() {
        this.data = null;
        this.processedData = null;
        this.stats = {
            mean: 0,
            std: 1,
            min: 0,
            max: 0
        };
    }

    /**
     * Load data from CSV file or synthetic generation
     * @param {File|string} source - CSV file or 'synthetic'
     * @returns {Promise<Object>} Loaded data
     */
    async loadData(source) {
        if (source === 'synthetic') {
            return this.generateSyntheticData();
        } else if (source instanceof File) {
            return this.loadCSV(source);
        } else {
            throw new Error('Invalid data source');
        }
    }

    /**
     * Generate synthetic S&P 500 returns data
     * Simulates realistic market behavior with trends and volatility
     * @param {number} days - Number of trading days to generate (default: 750 = ~3 years)
     * @returns {Object} Generated data
     */
    generateSyntheticData(days = 750) {
        console.log(`Generating ${days} days of synthetic S&P 500 data...`);
        
        const dates = [];
        const prices = [4000]; // Starting price
        const returns = [];
        
        const startDate = new Date('2020-01-01');
        
        // Realistic market parameters
        const baseDrift = 0.0003; // Average daily return (7.5% annualized)
        const baseVolatility = 0.011; // Daily volatility (17.5% annualized)
        
        // Market regimes - simulate different market conditions
        const regimes = [
            { duration: 150, drift: 0.0005, volatility: 0.008 },  // Bull market
            { duration: 100, drift: -0.0002, volatility: 0.015 }, // Correction
            { duration: 200, drift: 0.0004, volatility: 0.010 },  // Recovery
            { duration: 120, drift: 0.0006, volatility: 0.009 },  // Strong bull
            { duration: 80, drift: -0.0003, volatility: 0.018 },  // Volatility spike
            { duration: 100, drift: 0.0003, volatility: 0.012 }   // Normal
        ];
        
        let day = 0;
        let regimeIndex = 0;
        let regimeDays = 0;
        
        while (day < days) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + day);
            
            // Format date as YYYY-MM-DD
            const dateStr = currentDate.toISOString().split('T')[0];
            dates.push(dateStr);
            
            if (day > 0) {
                // Get current market regime
                const regime = regimes[regimeIndex % regimes.length];
                
                // Add seasonal component (lower volatility in summer, higher in fall)
                const month = currentDate.getMonth();
                const seasonalFactor = 1 + 0.1 * Math.sin(2 * Math.PI * month / 12);
                
                // Add day-of-week effect (Mondays more volatile)
                const dayOfWeek = currentDate.getDay();
                const dayEffect = dayOfWeek === 1 ? 1.2 : 1.0;
                
                // Calculate parameters with regime, seasonality, and day effects
                const drift = regime.drift * seasonalFactor;
                const volatility = regime.volatility * seasonalFactor * dayEffect;
                
                // Generate random return with fat tails (more extreme events than normal distribution)
                let randomComponent;
                if (Math.random() < 0.05) {
                    // 5% chance of extreme event (fat tails)
                    randomComponent = (Math.random() - 0.5) * volatility * 3;
                } else {
                    randomComponent = (Math.random() - 0.5) * volatility;
                }
                
                // Add autocorrelation (momentum effect)
                const momentum = day > 1 ? returns[returns.length - 1] * 0.1 : 0;
                
                const dailyReturn = drift + momentum + randomComponent;
                returns.push(dailyReturn);
                
                // Calculate price with occasional gaps (overnight moves)
                const previousPrice = prices[prices.length - 1];
                const priceChange = previousPrice * dailyReturn;
                prices.push(previousPrice + priceChange);
                
                // Add occasional price jumps
                if (Math.random() < 0.02) { // 2% chance of price jump
                    const jump = previousPrice * (Math.random() - 0.5) * 0.02;
                    prices[prices.length - 1] += jump;
                    returns[returns.length - 1] += jump / previousPrice;
                }
            }
            
            day++;
            regimeDays++;
            
            // Switch regime if duration elapsed
            if (regimeDays >= regimes[regimeIndex % regimes.length].duration) {
                regimeIndex++;
                regimeDays = 0;
            }
        }
        
        // Remove first element (starting price, no return)
        dates.shift();
        prices.shift();
        
        this.data = {
            dates: dates,
            prices: prices,
            returns: returns,
            source: 'synthetic'
        };
        
        this.calculateStatistics();
        console.log('Synthetic data generated successfully');
        return this.data;
    }

    /**
     * Load and parse CSV file
     * @param {File} file - CSV file object
     * @returns {Promise<Object>} Parsed data
     */
    async loadCSV(file) {
        console.log(`Loading CSV file: ${file.name}`);
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const csvText = event.target.result;
                    this.parseCSV(csvText);
                    this.calculateStatistics();
                    console.log('CSV data loaded successfully');
                    resolve(this.data);
                } catch (error) {
                    reject(new Error(`Failed to parse CSV: ${error.message}`));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV text into structured data
     * Supports multiple CSV formats
     * @param {string} csvText - Raw CSV content
     */
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV file is empty or has only headers');
        }
        
        // Detect delimiter
        const firstLine = lines[0];
        const delimiter = this.detectDelimiter(firstLine);
        
        // Parse headers
        const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
        
        // Find required columns
        const dateCol = this.findColumn(headers, ['date', 'time', 'timestamp']);
        const priceCol = this.findColumn(headers, ['close', 'adj close', 'price', 'last']);
        
        if (dateCol === -1 || priceCol === -1) {
            throw new Error('CSV must contain Date and Close/Price columns');
        }
        
        // Parse data rows
        const dates = [];
        const prices = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines
            
            const cells = this.parseCSVLine(line, delimiter);
            
            if (cells.length > Math.max(dateCol, priceCol)) {
                const dateStr = cells[dateCol].trim();
                const priceStr = cells[priceCol].trim();
                
                // Parse date
                const date = this.parseDate(dateStr);
                if (!date) {
                    console.warn(`Skipping invalid date at line ${i + 1}: ${dateStr}`);
                    continue;
                }
                
                // Parse price
                const price = parseFloat(priceStr.replace(/[^0-9.-]/g, ''));
                if (isNaN(price) || price <= 0) {
                    console.warn(`Skipping invalid price at line ${i + 1}: ${priceStr}`);
                    continue;
                }
                
                dates.push(date.toISOString().split('T')[0]);
                prices.push(price);
            }
        }
        
        if (dates.length < 2) {
            throw new Error('Insufficient data points (need at least 2 for returns calculation)');
        }
        
        // Calculate returns
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const ret = (prices[i] - prices[i-1]) / prices[i-1];
            returns.push(ret);
        }
        
        this.data = {
            dates: dates.slice(1), // Remove first date (no return)
            prices: prices.slice(1),
            returns: returns,
            source: 'csv'
        };
    }

    /**
     * Detect CSV delimiter
     * @param {string} line - First line of CSV
     * @returns {string} Detected delimiter
     */
    detectDelimiter(line) {
        const delimiters = [',', ';', '\t', '|'];
        let bestDelimiter = ',';
        let maxCount = 0;
        
        for (const delimiter of delimiters) {
            const count = (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                bestDelimiter = delimiter;
            }
        }
        
        return bestDelimiter;
    }

    /**
     * Parse CSV line considering quoted fields
     * @param {string} line - CSV line
     * @param {string} delimiter - Column delimiter
     * @returns {Array<string>} Parsed cells
     */
    parseCSVLine(line, delimiter) {
        const cells = [];
        let currentCell = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    currentCell += '"';
                    i++; // Skip next quote
                } else {
                    // Start or end of quoted field
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of cell
                cells.push(currentCell);
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        
        // Add last cell
        cells.push(currentCell);
        
        return cells;
    }

    /**
     * Find column index by possible header names
     * @param {Array<string>} headers - Column headers
     * @param {Array<string>} possibleNames - Possible column names
     * @returns {number} Column index or -1 if not found
     */
    findColumn(headers, possibleNames) {
        for (const name of possibleNames) {
            const index = headers.findIndex(h => h.includes(name));
            if (index !== -1) return index;
        }
        return -1;
    }

    /**
     * Parse date string in various formats
     * @param {string} dateStr - Date string
     * @returns {Date|null} Parsed date or null
     */
    parseDate(dateStr) {
        // Try different date formats
        const formats = [
            'YYYY-MM-DD',
            'MM/DD/YYYY',
            'DD/MM/YYYY',
            'YYYY/MM/DD',
            'MM-DD-YYYY',
            'DD-MM-YYYY'
        ];
        
        for (const format of formats) {
            const date = this.parseDateWithFormat(dateStr, format);
            if (date && !isNaN(date.getTime())) {
                return date;
            }
        }
        
        // Try JavaScript Date parsing as fallback
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) ? date : null;
    }

    /**
     * Parse date with specific format
     * @param {string} dateStr - Date string
     * @param {string} format - Date format
     * @returns {Date|null} Parsed date
     */
    parseDateWithFormat(dateStr, format) {
        const formatParts = format.split(/[-\/]/);
        const dateParts = dateStr.split(/[-\/]/);
        
        if (formatParts.length !== dateParts.length) {
            return null;
        }
        
        let year, month, day;
        
        for (let i = 0; i < formatParts.length; i++) {
            const part = dateParts[i];
            const formatPart = formatParts[i];
            
            if (formatPart.includes('YYYY')) {
                year = parseInt(part, 10);
                if (year < 100) {
                    year += 2000; // Handle 2-digit years
                }
            } else if (formatPart.includes('MM')) {
                month = parseInt(part, 10) - 1; // JavaScript months are 0-indexed
            } else if (formatPart.includes('DD')) {
                day = parseInt(part, 10);
            }
        }
        
        if (year !== undefined && month !== undefined && day !== undefined) {
            return new Date(year, month, day);
        }
        
        return null;
    }

    /**
     * Calculate basic statistics on returns
     */
    calculateStatistics() {
        if (!this.data || this.data.returns.length === 0) return;
        
        const returns = this.data.returns;
        
        // Calculate mean
        const sum = returns.reduce((a, b) => a + b, 0);
        this.stats.mean = sum / returns.length;
        
        // Calculate standard deviation
        const squaredDiffs = returns.map(r => Math.pow(r - this.stats.mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
        this.stats.std = Math.sqrt(variance);
        
        // Calculate min and max
        this.stats.min = Math.min(...returns);
        this.stats.max = Math.max(...returns);
        
        // Additional statistics
        this.stats.annualizedReturn = Math.pow(1 + this.stats.mean, 252) - 1;
        this.stats.annualizedVol = this.stats.std * Math.sqrt(252);
        this.stats.sharpeRatio = this.stats.mean / this.stats.std * Math.sqrt(252);
        
        // Count positive vs negative days
        this.stats.positiveDays = returns.filter(r => r > 0).length;
        this.stats.negativeDays = returns.filter(r => r < 0).length;
        this.stats.neutralDays = returns.filter(r => r === 0).length;
    }

    /**
     * Prepare sequences for GRU training
     * @param {number} sequenceLength - Length of input sequences
     * @param {number} trainRatio - Ratio of data for training
     * @returns {Object} Prepared training, validation, and test data
     */
    prepareSequences(sequenceLength, trainRatio = 0.8) {
        if (!this.data || this.data.returns.length === 0) {
            throw new Error('No data loaded');
        }
        
        if (sequenceLength >= this.data.returns.length) {
            throw new Error(`Sequence length (${sequenceLength}) must be less than total samples (${this.data.returns.length})`);
        }
        
        // Normalize returns
        const normalizedReturns = this.normalizeReturns(this.data.returns);
        
        // Create sequences
        const xs = [];
        const ys = [];
        
        for (let i = 0; i < normalizedReturns.length - sequenceLength; i++) {
            const sequence = normalizedReturns.slice(i, i + sequenceLength);
            const target = normalizedReturns[i + sequenceLength];
            
            xs.push(sequence);
            ys.push(target);
        }
        
        const totalSamples = xs.length;
        const trainEnd = Math.floor(totalSamples * trainRatio);
        const valEnd = Math.floor(totalSamples * (trainRatio + (1 - trainRatio) / 2));
        
        // Split data
        const trainData = {
            xs: xs.slice(0, trainEnd),
            ys: ys.slice(0, trainEnd)
        };
        
        const valData = {
            xs: xs.slice(trainEnd, valEnd),
            ys: ys.slice(trainEnd, valEnd)
        };
        
        const testData = {
            xs: xs.slice(valEnd),
            ys: ys.slice(valEnd),
            // Keep original returns for denormalization
            originalReturns: this.data.returns.slice(valEnd + sequenceLength)
        };
        
        // Also keep the last sequence for future predictions
        const lastSequence = normalizedReturns.slice(-sequenceLength);
        
        this.processedData = {
            train: trainData,
            val: valData,
            test: testData,
            lastSequence: lastSequence,
            sequenceLength: sequenceLength,
            normalizedReturns: normalizedReturns
        };
        
        console.log(`Prepared ${totalSamples} sequences: ${trainData.xs.length} train, ${valData.xs.length} val, ${testData.xs.length} test`);
        
        return this.processedData;
    }

    /**
     * Normalize returns using z-score normalization
     * @param {Array<number>} returns - Array of returns
     * @returns {Array<number>} Normalized returns
     */
    normalizeReturns(returns) {
        // Use pre-calculated statistics
        const mean = this.stats.mean;
        const std = this.stats.std;
        
        // Avoid division by zero
        const safeStd = std === 0 ? 1 : std;
        
        return returns.map(r => (r - mean) / safeStd);
    }

    /**
     * Denormalize returns
     * @param {Array<number>} normalized - Normalized returns
     * @returns {Array<number>} Original scale returns
     */
    denormalizeReturns(normalized) {
        const mean = this.stats.mean;
        const std = this.stats.std;
        const safeStd = std === 0 ? 1 : std;
        
        return normalized.map(r => r * safeStd + mean);
    }

    /**
     * Convert data to tensors for TensorFlow.js
     * @param {Object} data - Prepared sequence data
     * @returns {Object} Tensor data
     */
    convertToTensors(data) {
        // Training data
        const xTrain = tf.tensor3d(
            data.train.xs.map(seq => seq.map(val => [val])),
            [data.train.xs.length, data.train.xs[0].length, 1]
        );
        
        const yTrain = tf.tensor2d(
            data.train.ys.map(val => [val]),
            [data.train.ys.length, 1]
        );
        
        // Validation data
        const xVal = tf.tensor3d(
            data.val.xs.map(seq => seq.map(val => [val])),
            [data.val.xs.length, data.val.xs[0].length, 1]
        );
        
        const yVal = tf.tensor2d(
            data.val.ys.map(val => [val]),
            [data.val.ys.length, 1]
        );
        
        // Test data
        const xTest = tf.tensor3d(
            data.test.xs.map(seq => seq.map(val => [val])),
            [data.test.xs.length, data.test.xs[0].length, 1]
        );
        
        return {
            xTrain, yTrain,
            xVal, yVal,
            xTest,
            testReturns: data.test.originalReturns
        };
    }

    /**
     * Get data statistics for display
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            totalDays: this.data ? this.data.returns.length : 0,
            dateRange: this.data ? 
                `${this.data.dates[0]} to ${this.data.dates[this.data.dates.length - 1]}` : 
                'No data'
        };
    }

    /**
     * Get last sequence for prediction
     * @returns {Array<number>} Last sequence
     */
    getLastSequence() {
        return this.processedData ? this.processedData.lastSequence : null;
    }

    /**
     * Get sequence length
     * @returns {number} Sequence length
     */
    getSequenceLength() {
        return this.processedData ? this.processedData.sequenceLength : null;
    }

    /**
     * Clean up data and tensors
     */
    dispose() {
        this.data = null;
        this.processedData = null;
        this.stats = {
            mean: 0,
            std: 1,
            min: 0,
            max: 0
        };
        
        // Clean up any TensorFlow.js memory
        tf.disposeVariables();
    }
}

// Export the class for use in other modules
export { DataLoader };
