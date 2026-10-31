const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 5000;

// Enable cross-origin resource sharing and body parsing
app.use(cors());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(express.json());

// Hardcoded link to bypass all hidden whitespace and environment variables syntax glitches
const MONGO_URI = "mongodb+srv://sahilchand757_db_user:irriga1234@taskmanager.nssufhi.mongodb.net/irrigasmart?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true";

const client = new MongoClient(MONGO_URI);
let db;

// Static Crop Coefficients (Kc) for quick JavaScript execution
const CROP_COEFFICIENTS = {
    tomato: { initial: 0.6, development: 0.8, mid: 1.15, late: 0.8 },
    maize: { initial: 0.3, development: 0.7, mid: 1.2, late: 0.6 }
};

async function startServer() {
    try {
        console.log("Connecting to MongoDB Atlas...");
        await client.connect();
        
        // Target the specific 'irrigasmart' database collection layout
        db = client.db('irrigasmart');
        console.log("✅ Fully connected to MongoDB Atlas!");

        // --- API ROUTES ---

        // 1. POST: Ingest Sensor Data + Calculate Precision Schedule instantly
        app.post('/api/telemetry', async (req, res) => {
            try {
                if (!req.body || Object.keys(req.body).length === 0) {
                    return res.status(400).json({ error: "Invalid Request: Body is empty." });
                }

                const { cropType, growthStage, soilMoisturePct, temperatureC, humidityPct, forecastRainMm } = req.body;
                
                const crop = (cropType || "tomato").toLowerCase();
                const stage = (growthStage || "mid").toLowerCase();
                const moisture = parseFloat(soilMoisturePct || 50);
                const temp = parseFloat(temperatureC || 25);
                const humidity = parseFloat(humidityPct || 50);
                const rain = parseFloat(forecastRainMm || 0);

                // --- PRECISION IRRIGATION ENGINE ---
                // Calculate Reference Evapotranspiration (ET0) via basic atmospheric model
                const baseEvap = 0.0023 * (temp + 17.8) * Math.sqrt(Math.max(0, temp - 10)) * 50;
                const humidityFactor = (100 - humidity) / 100;
                const et0 = Math.max(0.5, baseEvap * humidityFactor);

                // Fetch Crop Multiplier
                const kc = CROP_COEFFICIENTS[crop]?.[stage] || 0.75;
                const cropDemandMm = et0 * kc;
                const netDemandMm = Math.max(0, cropDemandMm - rain);

                // Determine Irrigation Action Thresholds
                let status = "SKIP_IRRIGATION";
                let volumeLitreSqM = 0;
                let instructions = "Soil moisture is stable. Skip this irrigation cycle.";

                if (moisture < 45.0) { // Depletion trigger point
                    status = "IRRIGATE_NOW";
                    const deficitMultiplier = (45.0 - moisture) / 45.0;
                    volumeLitreSqM = netDemandMm * (1 + deficitMultiplier);
                    instructions = `Apply ${volumeLitreSqM.toFixed(2)}L per m² immediately.`;
                }

                const telemetryRecord = {
                    cropType: crop,
                    growthStage: stage,
                    soilMoisturePct: moisture,
                    temperatureC: temp,
                    humidityPct: humidity,
                    forecastRainMm: rain,
                    irrigationDecision: {
                        status,
                        volumeLitreSqM: parseFloat(volumeLitreSqM.toFixed(2)),
                        instructions
                    },
                    timestamp: new Date()
                };

                const result = await db.collection('telemetry').insertOne(telemetryRecord);
                res.status(201).json({ 
                    message: "Telemetry processed and saved!", 
                    dataId: result.insertedId,
                    decision: telemetryRecord.irrigationDecision 
                });

            } catch (err) {
                res.status(500).json({ error: "Internal processing crash", details: err.message });
            }
        });

        // 2. GET: Retrieve all historical log entries for dashboard rendering
        app.get('/api/telemetry', async (req, res) => {
            try {
                const logs = await db.collection('telemetry').find().sort({ timestamp: -1 }).toArray();
                res.status(200).json(logs);
            } catch (err) {
                res.status(500).json({ error: "Failed to fetch logs", details: err.message });
            }
        });

        // System Health Status Check
        app.get('/api/status', (req, res) => {
            res.json({ message: "IrrigaSmart backend environment operational." });
        });

        // Start listening for inbound dashboard network streams
        app.listen(PORT, () => {
            console.log(`🚀 IrrigaSmart Server active on port ${PORT}`);
        });

    } catch (err) {
        console.error("❌ Critical Database Connection Error:");
        console.error(err.message);
        process.exit(1); 
    }
}

startServer();
