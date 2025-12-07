class GRUModel {
    constructor() {
        this.model = null;
        this.scaler = null;
        this.featureMeans = null;
        this.featureStds = null;
        this.lookback = 60;
        this.sequenceData = null;
        this.sequenceLabels = null;
        this.trainingHistory = {
            loss: [],
            valLoss: []
        };
        this.testResults = null;
    }
    
    // Create features from raw data (mimics Python feature engineering)
    createFeatures(rawData) {
        console.log('Creating features from raw data...');
        
        // Ensure required columns exist
        const requiredCols = ['SPX', 'VIX', 'SPY', 'TNX', 'DXY', 'SPY_Volume'];
        for (const col of requiredCols) {
            if (!rawData[col]) {
                throw new Error(`Missing required column: ${col}`);
            }
        }
        
        const dates = rawData.Date || rawData.index;
        const df = {
            index: dates,
            SPX: rawData.SPX,
            VIX: rawData.VIX,
            SPY: rawData.SPY,
            TNX: rawData.TNX,
            DXY: rawData.DXY,
            SPY_Vol: rawData.SPY_Volume
        };
        
        // Calculate log returns
        const calculateReturns = (prices) => {
            const returns = new Array(prices.length).fill(0);
            for (let i = 1; i < prices.length; i++) {
                returns[i] = Math.log(prices[i] / prices[i-1]);
            }
            return returns;
        };
        
        df.SPX_ret = calculateReturns(df.SPX);
        df.VIX_ret = calculateReturns(df.VIX);
        df.SPY_ret = calculateReturns(df.SPY);
        df.TNX_ret = calculateReturns(df.TNX);
        df.DXY_ret = calculateReturns(df.DXY);
        
        // 5-day forward return for SPX (target)
        df.SPX_ret_5d_fwd = new Array(df.SPX.length).fill(0);
        for (let i = 0; i < df.SPX.length - 5; i++) {
            df.SPX_ret_5d_fwd[i] = Math.log(df.SPX[i+5] / df.SPX[i]);
        }
        
        // Rolling volatility
        const rollingStd = (returns, window) => {
            const stds = new Array(returns.length).fill(0);
            for (let i = window; i < returns.length; i++) {
                const slice = returns.slice(i - window + 1, i + 1);
                const mean = slice.reduce((a, b) => a + b, 0) / window;
                const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window;
                stds[i] = Math.sqrt(variance);
            }
            return stds;
        };
        
        df.SPX_vol_21 = rollingStd(df.SPX_ret, 21);
        df.SPX_vol_63 = rollingStd(df.SPX_ret, 63);
        
        // Simple Moving Averages
        const sma = (prices, window) => {
            const averages = new Array(prices.length).fill(0);
            for (let i = window - 1; i < prices.length; i++) {
                const slice = prices.slice(i - window + 1, i + 1);
                averages[i] = slice.reduce((a, b) => a + b, 0) / window;
            }
            return averages;
        };
        
        df.SPX_SMA_10 = sma(df.SPX, 10);
        df.SPX_SMA_50 = sma(df.SPX, 50);
        
        // Momentum (10-day)
        df.SPX_mom_10 = new Array(df.SPX.length).fill(0);
        for (let i = 10; i < df.SPX.length; i++) {
            df.SPX_mom_10[i] = df.SPX[i] / df.SPX[i-10] - 1;
        }
        
        // RSI calculation
        const computeRSI = (prices, window = 14) => {
            const rsi = new Array(prices.length).fill(50);
            for (let i = window; i < prices.length; i++) {
                let gains = 0;
                let losses = 0;
                
                for (let j = i - window + 1; j <= i; j++) {
                    const change = prices[j] - prices[j-1];
                    if (change > 0) {
                        gains += change;
                    } else {
                        losses -= change;
                    }
                }
                
                const avgGain = gains / window;
                const avgLoss = losses / window;
                
                if (avgLoss === 0) {
                    rsi[i] = 100;
                } else {
                    const rs = avgGain / avgLoss;
                    rsi[i] = 100 - (100 / (1 + rs));
                }
            }
            return rsi;
        };
        
        df.SPX_RSI_14 = computeRSI(df.SPX, 14);
        
        // Feature columns (same as Python version)
        const featureCols = [
            'SPX_ret', 'VIX_ret', 'SPY_ret', 'TNX_ret', 'DXY_ret',
            'SPY_Vol',
            'SPX_vol_21', 'SPX_vol_63',
            'SPX_SMA_10', 'SPX_SMA_50',
            'SPX_mom_10', 'SPX_RSI_14'
        ];
        
        const targetCol = 'SPX_ret_5d_fwd';
        
        // Create raw feature matrix X and target vector y
        const X_raw = [];
        const y_raw = [];
        
        // Find start index where all features are available
        let startIdx = 0;
        for (let i = 0; i < df.index.length; i++) {
            const hasAllFeatures = featureCols.every(col => 
                df[col][i] !== undefined && df[col][i] !== null && !isNaN(df[col][i])
            );
            const hasTarget = df[targetCol][i] !== undefined && !isNaN(df[targetCol][i]);
            
            if (hasAllFeatures && hasTarget) {
                startIdx = i;
                break;
            }
        }
        
        // Build X_raw and y_raw
        for (let i = startIdx; i < df.index.length; i++) {
            const row = featureCols.map(col => df[col][i]);
            X_raw.push(row);
            y_raw.push(df[targetCol][i]);
        }
        
        // Standardize features
        const X_scaled = this.standardizeFeatures(X_raw);
        
        return {
            X: X_scaled,
            y: y_raw,
            dates: df.index.slice(startIdx),
            originalData: df,
            featureNames: featureCols
        };
    }
    
    // Standardize features (z-score normalization)
    standardizeFeatures(X) {
        if (X.length === 0) return X;
        
        const numFeatures = X[0].length;
        this.featureMeans = new Array(numFeatures).fill(0);
        this.featureStds = new Array(numFeatures).fill(0);
        
        // Calculate means
        for (let i = 0; i < X.length; i++) {
            for (let j = 0; j < numFeatures; j++) {
                this.featureMeans[j] += X[i][j];
            }
        }
        this.featureMeans = this.featureMeans.map(mean => mean / X.length);
        
        // Calculate standard deviations
        for (let i = 0; i < X.length; i++) {
            for (let j = 0; j < numFeatures; j++) {
                this.featureStds[j] += Math.pow(X[i][j] - this.featureMeans[j], 2);
            }
        }
        this.featureStds = this.featureStds.map(std => Math.sqrt(std / X.length));
        
        // Avoid division by zero
        this.featureStds = this.featureStds.map(std => std === 0 ? 1 : std);
        
        // Apply standardization
        const X_scaled = X.map(row => 
            row.map((val, idx) => (val - this.featureMeans[idx]) / this.featureStds[idx])
        );
        
        return X_scaled;
    }
    
    // Create sequences for time series prediction
    createSequences(X, y, lookback) {
        const X_seq = [];
        const y_seq = [];
        
        for (let i = 0; i < X.length - lookback; i++) {
            X_seq.push(X.slice(i, i + lookback));
            y_seq.push(y[i + lookback]);  // Target is at the end of the sequence
        }
        
        return {
            X: X_seq,
            y: y_seq
        };
    }
    
    // Build GRU model architecture
    buildModel(inputShape) {
        this.model = tf.sequential();
        
        // First GRU layer
        this.model.add(tf.layers.gru({
            units: 128,
            returnSequences: true,
            inputShape: inputShape
        }));
        
        this.model.add(tf.layers.dropout({rate: 0.2}));
        
        // Second GRU layer
        this.model.add(tf.layers.gru({
            units: 64,
            returnSequences: false
        }));
        
        this.model.add(tf.layers.dropout({rate: 0.2}));
        
        // Dense layers
        this.model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        // Output layer (single value for regression)
        this.model.add(tf.layers.dense({
            units: 1
        }));
        
        // Compile model
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        const totalParams = this.model.countParams();
        console.log(`Model built with ${totalParams} parameters`);
        
        return totalParams;
    }
    
    // Train model with train/validation split
    async train(X_train, y_train, X_val, y_val, epochs = 50, batchSize = 32, callbacks = {}) {
        if (!this.model) {
            throw new Error('Model must be built before training');
        }
        
        // Reset training history
        this.trainingHistory = {
            loss: [],
            valLoss: [],
            epochTimes: []
        };
        
        const trainTensorX = tf.tensor3d(X_train);
        const trainTensorY = tf.tensor2d(y_train, [y_train.length, 1]);
        const valTensorX = tf.tensor3d(X_val);
        const valTensorY = tf.tensor2d(y_val, [y_val.length, 1]);
        
        try {
            const history = await this.model.fit(trainTensorX, trainTensorY, {
                epochs: epochs,
                batchSize: batchSize,
                validationData: [valTensorX, valTensorY],
                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
                        this.trainingHistory.loss.push(logs.loss);
                        this.trainingHistory.valLoss.push(logs.val_loss);
                        
                        if (callbacks.onEpochEnd) {
                            callbacks.onEpochEnd(epoch, logs);
                        }
                    },
                    onTrainEnd: () => {
                        if (callbacks.onTrainEnd) {
                            callbacks.onTrainEnd();
                        }
                    }
                },
                shuffle: false  // Important for time series data
            });
            
            return history;
        } finally {
            // Clean up tensors
            trainTensorX.dispose();
            trainTensorY.dispose();
            valTensorX.dispose();
            valTensorY.dispose();
        }
    }
    
    // Make predictions
    predict(X) {
        if (!this.model) {
            throw new Error('Model must be trained before prediction');
        }
        
        const tensorX = tf.tensor3d(X);
        const predictions = this.model.predict(tensorX);
        const result = predictions.dataSync();
        
        tensorX.dispose();
        predictions.dispose();
        
        return Array.from(result);
    }
    
    // Calculate RMSE
    calculateRMSE(yTrue, yPred) {
        if (yTrue.length !== yPred.length) {
            throw new Error('True and predicted arrays must have same length');
        }
        
        let sumSquaredError = 0;
        for (let i = 0; i < yTrue.length; i++) {
            sumSquaredError += Math.pow(yTrue[i] - yPred[i], 2);
        }
        
        return Math.sqrt(sumSquaredError / yTrue.length);
    }
    
    // Prepare data for training (splits into train/val/test)
    prepareData(featureData, lookback, trainRatio = 0.7, valRatio = 0.15) {
        this.lookback = lookback;
        
        const sequences = this.createSequences(featureData.X, featureData.y, lookback);
        this.sequenceData = sequences.X;
        this.sequenceLabels = sequences.y;
        
        const n = sequences.X.length;
        const trainEnd = Math.floor(n * trainRatio);
        const valEnd = trainEnd + Math.floor(n * valRatio);
        
        const X_train = sequences.X.slice(0, trainEnd);
        const y_train = sequences.y.slice(0, trainEnd);
        const X_val = sequences.X.slice(trainEnd, valEnd);
        const y_val = sequences.y.slice(trainEnd, valEnd);
        const X_test = sequences.X.slice(valEnd);
        const y_test = sequences.y.slice(valEnd);
        
        return {
            X_train, y_train,
            X_val, y_val,
            X_test, y_test,
            dates: featureData.dates.slice(lookback),
            featureData
        };
    }
    
    // Make prediction for next 5 days using most recent data
    predictNext5Days(featureData) {
        if (!this.model) {
            throw new Error('Model must be trained before prediction');
        }
        
        const recentData = featureData.X.slice(-this.lookback);
        const prediction = this.predict([recentData])[0];
        
        return {
            predictedReturn: prediction,
            confidence: this.calculatePredictionConfidence(prediction),
            recentDataLength: recentData.length
        };
    }
    
    // Calculate prediction confidence based on model's training performance
    calculatePredictionConfidence(prediction) {
        if (!this.trainingHistory.loss.length) {
            return 0.5;  // Default if no training history
        }
        
        const avgValLoss = this.trainingHistory.valLoss.reduce((a, b) => a + b, 0) / 
                          this.trainingHistory.valLoss.length;
        
        // Simple heuristic: lower validation loss = higher confidence
        const lossConfidence = Math.max(0, 1 - Math.sqrt(avgValLoss) * 10);
        
        // Also consider if prediction is within reasonable bounds
        const magnitudeConfidence = Math.max(0, 1 - Math.abs(prediction) * 2);
        
        return Math.min(0.95, Math.max(0.1, (lossConfidence + magnitudeConfidence) / 2));
    }
    
    // Clean up TensorFlow.js memory
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
        tf.disposeVariables();
    }
}
