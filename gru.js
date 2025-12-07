// gru.js
/**
 * GRU-based model for S&P 500 returns prediction
 * All training happens client-side in the browser
 */

class GRUModel {
    constructor() {
        this.model = null;
        this.history = {
            loss: [],
            val_loss: [],
            epochs: []
        };
        this.isTraining = false;
        this.dataStats = {
            mean: 0,
            std: 1,
            min: 0,
            max: 1
        };
    }

    /**
     * Build the GRU model architecture
     * @param {number} sequenceLength - Length of input sequences
     * @param {number} gruUnits - Number of units in GRU layer
     * @returns {tf.LayersModel} Compiled model
     */
    buildModel(sequenceLength = 20, gruUnits = 50) {
        // Clear any existing model from memory
        if (this.model) {
            this.model.dispose();
        }

        const model = tf.sequential();
        
        // GRU layer for sequence processing
        model.add(tf.layers.gru({
            units: gruUnits,
            inputShape: [sequenceLength, 1],
            activation: 'tanh',
            returnSequences: false,
            kernelInitializer: 'glorotNormal'
        }));
        
        // Dropout for regularization
        model.add(tf.layers.dropout({rate: 0.2}));
        
        // Output layer for return prediction
        model.add(tf.layers.dense({
            units: 1,
            activation: 'linear'
        }));
        
        // Compile model with Adam optimizer and MSE loss
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        this.model = model;
        return model;
    }

    /**
     * Prepare sequences from returns data
     * @param {Array} returns - Array of daily returns
     * @param {number} sequenceLength - Length of each sequence
     * @returns {Object} X and y tensors
     */
    createSequences(returns, sequenceLength) {
        const xs = [];
        const ys = [];
        
        for (let i = 0; i < returns.length - sequenceLength; i++) {
            const sequence = returns.slice(i, i + sequenceLength);
            const target = returns[i + sequenceLength];
            
            xs.push(sequence);
            ys.push(target);
        }
        
        // Convert to tensors with proper shape [samples, sequenceLength, features]
        const xTensor = tf.tensor3d(xs, [xs.length, sequenceLength, 1]);
        const yTensor = tf.tensor2d(ys, [ys.length, 1]);
        
        return { xs: xTensor, ys: yTensor };
    }

    /**
     * Normalize data using z-score normalization
     * @param {Array} data - Data to normalize
     * @returns {Object} Normalized data and statistics
     */
    normalizeData(data) {
        const mean = tf.mean(data).dataSync()[0];
        const std = tf.moments(data).variance.sqrt().dataSync()[0];
        const min = tf.min(data).dataSync()[0];
        const max = tf.max(data).dataSync()[0];
        
        // Avoid division by zero
        const safeStd = std === 0 ? 1 : std;
        
        const normalized = tf.sub(data, mean).div(safeStd);
        
        this.dataStats = { mean, std: safeStd, min, max };
        
        return normalized;
    }

    /**
     * Denormalize predictions back to original scale
     * @param {tf.Tensor} predictions - Normalized predictions
     * @returns {tf.Tensor} Denormalized predictions
     */
    denormalize(predictions) {
        return predictions.mul(this.dataStats.std).add(this.dataStats.mean);
    }

    /**
     * Train the model
     * @param {tf.Tensor} xTrain - Training features
     * @param {tf.Tensor} yTrain - Training labels
     * @param {tf.Tensor} xVal - Validation features
     * @param {tf.Tensor} yVal - Validation labels
     * @param {number} epochs - Number of training epochs
     * @param {Function} onEpochEnd - Callback after each epoch
     * @returns {Promise} Training history
     */
    async train(xTrain, yTrain, xVal, yVal, epochs = 50, onEpochEnd = null) {
        if (this.isTraining) {
            throw new Error('Model is already training');
        }
        
        this.isTraining = true;
        this.history = { loss: [], val_loss: [], epochs: [] };
        
        try {
            const batchSize = Math.min(32, xTrain.shape[0]);
            
            const history = await this.model.fit(xTrain, yTrain, {
                epochs: epochs,
                batchSize: batchSize,
                validationData: [xVal, yVal],
                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
                        // Store history
                        this.history.loss.push(logs.loss);
                        this.history.val_loss.push(logs.val_loss);
                        this.history.epochs.push(epoch + 1);
                        
                        // Call user callback if provided
                        if (onEpochEnd) {
                            onEpochEnd(epoch, logs);
                        }
                        
                        // Force garbage collection periodically
                        if (epoch % 5 === 0) {
                            tf.engine().startScope();
                            tf.engine().endScope();
                        }
                    }
                }
            });
            
            this.isTraining = false;
            return history;
        } catch (error) {
            this.isTraining = false;
            throw error;
        }
    }

    /**
     * Predict next n days using recursive prediction
     * @param {Array} lastSequence - Last known sequence of returns
     * @param {number} nDays - Number of days to predict
     * @returns {Array} Array of predicted returns
     */
    predictNextDays(lastSequence, nDays = 5) {
        if (!this.model) {
            throw new Error('Model not trained yet');
        }
        
        const predictions = [];
        let currentSequence = [...lastSequence];
        
        for (let i = 0; i < nDays; i++) {
            // Prepare input tensor
            const inputTensor = tf.tensor3d(
                [currentSequence.map(val => [val])],
                [1, currentSequence.length, 1]
            );
            
            // Make prediction
            const prediction = this.model.predict(inputTensor);
            const predValue = prediction.dataSync()[0];
            
            // Denormalize prediction
            const denormPred = predValue * this.dataStats.std + this.dataStats.mean;
            predictions.push(denormPred);
            
            // Update sequence for next prediction
            currentSequence.shift();
            currentSequence.push(predValue);
            
            // Clean up tensors
            inputTensor.dispose();
            prediction.dispose();
        }
        
        return predictions;
    }

    /**
     * Make predictions on test data
     * @param {tf.Tensor} xTest - Test features
     * @returns {Array} Predictions
     */
    predict(xTest) {
        if (!this.model) {
            throw new Error('Model not trained yet');
        }
        
        const predictions = this.model.predict(xTest);
        const denormPredictions = this.denormalize(predictions);
        const result = denormPredictions.arraySync();
        
        predictions.dispose();
        denormPredictions.dispose();
        
        return result.flat();
    }

    /**
     * Calculate RMSE between predictions and actual values
     * @param {Array} predictions - Predicted values
     * @param {Array} actual - Actual values
     * @returns {number} RMSE value
     */
    calculateRMSE(predictions, actual) {
        if (predictions.length !== actual.length) {
            throw new Error('Predictions and actual arrays must have same length');
        }
        
        let sumSquaredError = 0;
        for (let i = 0; i < predictions.length; i++) {
            const error = predictions[i] - actual[i];
            sumSquaredError += error * error;
        }
        
        return Math.sqrt(sumSquaredError / predictions.length);
    }

    /**
     * Generate synthetic S&P 500 returns data for demonstration
     * @param {number} nDays - Number of days to generate
     * @returns {Object} Generated data with dates and returns
     */
    generateSyntheticData(nDays = 750) {
        const dates = [];
        const prices = [4000]; // Start at 4000
        const returns = [];
        
        const startDate = new Date('2020-01-01');
        
        // Parameters for synthetic data generation
        const drift = 0.0003; // Daily drift
        const volatility = 0.012; // Daily volatility
        const seasonality = 0.001; // Small seasonal component
        
        for (let i = 0; i < nDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            dates.push(currentDate.toISOString().split('T')[0]);
            
            if (i > 0) {
                // Generate random walk with drift and seasonality
                const dayOfYear = currentDate.getDayOfYear ? currentDate.getDayOfYear() : 
                                 (currentDate - new Date(currentDate.getFullYear(), 0, 0)) / 86400000;
                const seasonal = Math.sin(2 * Math.PI * dayOfYear / 365) * seasonality;
                
                const randomShock = (Math.random() - 0.5) * volatility;
                const dailyReturn = drift + seasonal + randomShock;
                
                returns.push(dailyReturn);
                prices.push(prices[i - 1] * (1 + dailyReturn));
            }
        }
        
        // Remove the first price since we don't have return for it
        prices.shift();
        
        return {
            dates: dates.slice(1), // Remove first date since no return
            prices: prices,
            returns: returns
        };
    }

    /**
     * Clean up model and tensors from memory
     */
    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        this.history = { loss: [], val_loss: [], epochs: [] };
        tf.engine().startScope();
        tf.engine().endScope();
    }

    /**
     * Get model summary
     * @returns {string} Model architecture summary
     */
    getSummary() {
        if (!this.model) {
            return 'Model not built yet';
        }
        
        let summary = 'Model Layers:\n';
        this.model.layers.forEach((layer, i) => {
            summary += `${i + 1}. ${layer.name} (${layer.getClassName()})\n`;
        });
        
        return summary;
    }
}

// Export the class for use in other modules
export { GRUModel };
