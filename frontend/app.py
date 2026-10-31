import streamlit as st
import requests
import pandas as pd
from datetime import datetime

# Setup configuration connecting to your live backend

BACKEND_URL = "http://127.0.0"

st.set_page_config(page_title="IrrigaSmart Dashboard", layout="wide")

st.title("🌱 IrrigaSmart Dashboard")
st.caption("AI-Based Precision Irrigation Assistant")

# --- SIDEBAR: SENSOR DATA SIMULATOR FORM ---
st.sidebar.header("📡 Simulate IoT Field Sensors")
with st.sidebar.form("sensor_form", clear_on_submit=True):
    crop = st.selectbox("Target Crop", ["Tomato", "Maize"])
    stage = st.selectbox("Growth Stage", ["Initial", "Mid", "Late"])
    moisture = st.slider("Soil Moisture (%)", 0, 100, 50)
    temp = st.number_input("Temperature (°C)", min_value=0.0, max_value=50.0, value=28.0)
    humidity = st.slider("Air Humidity (%)", 0, 100, 60)
    
    submitted = st.form_submit_button("Transmit Data")
    if submitted:
        payload = {
            "cropType": crop.lower(),
            "growthStage": stage.lower(),
            "soilMoisturePct": moisture,
            "temperatureC": temp,
            "humidityPct": humidity,
            "forecastRainMm": 0
        }
        try:
            res = requests.post(BACKEND_URL, json=payload)
            if res.status_code == 201:
                st.sidebar.success("Data transmitted to MongoDB Atlas!")
            else:
                st.sidebar.error("Server rejected packet.")
        except Exception as e:
            st.sidebar.error(f"Cannot reach backend server.")

# --- MAIN LAYOUT: DISPLAY LIVE RECORDS ---
try:
    response = requests.get(BACKEND_URL)
    if response.status_code == 200 and response.json():
        data = response.json()
        latest = data[0]  # The most recent record

        # 1. Main Action Alert Callout
        decision = latest.get("irrigationDecision", {"status": "UNKNOWN", "instructions": "No calculation found."})
        if decision["status"] == "IRRIGATE_NOW":
            st.error(f"🚨 **ACTION REQUIRED:** {decision['instructions']}")
        else:
            st.success(f"✅ **SYSTEM OPTIMAL:** {decision['instructions']}")

        # 2. Metric Grid Layout
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Soil Moisture", f"{latest['soilMoisturePct']}%")
        col2.metric("Temperature", f"{latest['temperatureC']}°C")
        col3.metric("Air Humidity", f"{latest['humidityPct']}%")
        col4.metric("Crop Status", f"{latest['cropType'].capitalize()} ({latest['growthStage']})")

        # 3. History Data Logs Table
        st.subheader("📋 Recent Telemetry History Logs")
        
        # Format the data cleanly into a clean DataFrame table
        log_list = []
        for log in data:
            log_time = datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00")).strftime("%H:%M:%S")
            dec_obj = log.get("irrigationDecision", {"status": "SKIP", "volumeLitreSqM": 0})
            
            log_list.append({
                "Time": log_time,
                "Crop Context": f"{log['cropType'].capitalize()} ({log['growthStage']})",
                "Moisture": f"{log['soilMoisturePct']}%",
                "Temp/Humidity": f"{log['temperatureC']}°C / {log['humidityPct']}%",
                "Engine Action": dec_obj["status"],
                "Volume (L/m²)": dec_obj["volumeLitreSqM"]
            })
        
        df = pd.DataFrame(log_list)
        st.dataframe(df, use_container_width=True)

    else:
        st.info("Database is currently empty. Use the sidebar form to submit your first sensor reading!")

except Exception as e:
    st.error(f"⚠️ Failed to pull real-time database logs. Make sure your Node.js backend (`node server.js`) is running on port 5000.")
