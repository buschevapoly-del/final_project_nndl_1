// data-loader.js
/**
 * Data loader for S&P 500 returns prediction
 * Handles CSV parsing, data preprocessing, and splitting
 * Updated to handle single-column my_data.csv with S&P 500 prices
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
     * Load data from CSV file, URL, or synthetic generation
     * @param {File|string} source - CSV file, URL, or 'synthetic'
     * @returns {Promise<Object>} Loaded data
     */
    async loadData(source) {
        if (source === 'synthetic') {
            return this.generateSyntheticData();
        } else if (source === 'default') {
            return this.loadDefaultData();
        } else if (source instanceof File) {
            return this.loadCSV(source);
        } else if (typeof source === 'string' && source.startsWith('http')) {
            return this.loadFromURL(source);
        } else {
            throw new Error('Invalid data source');
        }
    }

    /**
     * Load default my_data.csv from GitHub repository
     * This assumes my_data.csv is in the same directory
     */
    async loadDefaultData() {
        try {
            console.log('Loading default my_data.csv from repository...');
            const response = await fetch('my_data.csv');
            
            if (!response.ok) {
                throw new Error(`Failed to load my_data.csv: ${response.status} ${response.statusText}`);
            }
            
            const csvText = await response.text();
            return this.parseSingleColumnCSV(csvText);
            
        } catch (error) {
            console.error('Error loading default data:', error);
            throw new Error(`Could not load my_data.csv. Please ensure the file exists in your repository. Error: ${error.message}`);
        }
    }

    /**
     * Load data from URL
     * @param {string} url - URL to CSV file
     */
    async loadFromURL(url) {
        try {
            console.log(`Loading data from URL: ${url}`);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to load from URL: ${response.status} ${response.statusText}`);
            }
            
            const csvText = await response.text();
            return this.parseSingleColumnCSV(csvText);
            
        } catch (error) {
            console.error('Error loading from URL:', error);
            throw error;
        }
    }

    /**
     * Parse single-column CSV with S&P 500 prices
     * Assumes one price per line, optionally with dates
     * @param {string} csvText - Raw CSV content
     */
    parseSingleColumnCSV(csvText) {
        const lines = csvText.trim().split('\n');
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }

        const prices = [];
        const dates = [];
        
        // Try to detect format: check if first line looks like a header or date
        const firstLine = lines[0].trim();
        
        // Check if first line contains non-numeric characters (likely a header)
        if (isNaN(parseFloat(firstLine))) {
            // Skip header line
            lines.shift();
        }
        
        // Parse all lines
        let lineNumber = 0;
        for (const line of lines) {
            lineNumber++;
            const trimmedLine = line.trim();
            
            if (!trimmedLine) {
                continue; // Skip empty lines
            }
            
            // Split by comma to handle potential date,price format
            const parts = trimmedLine.split(',');
            
            let priceStr;
            if (parts.length === 1) {
                // Single column: just price
                priceStr = parts[0];
            } else if (parts.length >= 2) {
                // Multiple columns: assume first is date, last is price
                priceStr = parts[parts.length - 1];
                
                // Try to extract date from first column
                const dateStr = parts[0].trim();
                if (dateStr && !isNaN(Date.parse(dateStr))) {
                    const date = new Date(dateStr);
                    dates.push(date.toISOString().split('T')[0]);
                }
            } else {
                continue; // Skip malformed lines
            }
            
            // Parse price
            const price = parseFloat(priceStr);
            if (isNaN(price) || price <= 0) {
                console.warn(`Skipping invalid price at line ${lineNumber}: ${priceStr}`);
                continue;
            }
            
            prices.push(price);
        }
        
        if (prices.length < 10) {
            throw new Error(`Insufficient data points: only ${prices.length} valid prices found (need at least 10)`);
        }
        
        // Generate dates if not provided
        if (dates.length === 0) {
            const startDate = new Date('2020-01-01');
            for (let i = 0; i < prices.length; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                dates.push(date.toISOString().split('T')[0]);
            }
        }
        
        // Calculate returns from prices
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
        
        this.calculateStatistics();
        console.log(`Loaded ${prices.length} prices, ${returns.length} returns`);
        return this.data;
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
                if (Math.random() <
