from flask import Flask, request, jsonify, render_template
import json
from urllib.request import urlopen
import firebase_admin
from firebase_admin import credentials, db
import datetime
import fastf1
import requests
import pandas as pd
import threading
import time

import os

app = Flask(__name__)

if not os.path.exists('./cache'):
    os.makedirs('./cache')

fastf1.Cache.enable_cache('./cache')

cred = credentials.Certificate("f1-cloud-lvtl-firebase-adminsdk-fbsvc-978b212e8f.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://f1-cloud-lvtl-default-rtdb.europe-west1.firebasedatabase.app/'
    })

def update_live_data():
    while True:
        try:
            print("Atualizando dados do OpenF1...")
            session_key = "latest"
            response = urlopen(f"http://127.0.0.1:5000/api/live_dashboard?session_key={session_key}")
            data = json.loads(response.read().decode())
            db.reference("/live_telemetry").set(data)
            print("Atualizado no Firebase com sucesso.")
        except Exception as e:
            print("Erro ao atualizar dados:", e)
        time.sleep(30)  # Aguarda 30s antes da próxima atualização

SESSIONS = ['FP1', 'FP2', 'FP3', 'Q', 'R']

@app.route('/')
def index():
    endpoints = {
        "drivers": "/api/drivers",
        "session_info": "/api/session_info",
        "telemetry": "/api/telemetry",
        "openf1_drivers": "/api/openf1/drivers",
        "track": "/api/track"
    }
    return render_template('live_telemetry.html', sessions=SESSIONS, endpoints=endpoints)


@app.route('/api/drivers')
def drivers():
    year = int(request.args.get('year', 2024))
    round_ = int(request.args.get('round', 1))
    session_name = request.args.get('session', 'FP1')
    if session_name not in SESSIONS:
        session_name = 'FP1'
    try:
        session = fastf1.get_session(year, round_, session_name)
        session.load()

        results = session.results
        results['Time'] = results['Time'].fillna(pd.Timedelta(0))
        results['Position'] = results['Position'].fillna(0).astype(int)
        results['Status'] = results['Status'].fillna('Unknown')

        drivers_list = []
        for _, row in results.iterrows():
            drivers_list.append({
                'number': row['DriverNumber'],
                'name': row['BroadcastName'],
                'abbr': row['Abbreviation'],
                'team': row['TeamName'],
                'position': row['Position'],
                'status': row['Status'],
                'time': str(row['Time']) if pd.notnull(row['Time']) else None,
            })
        
        return jsonify(drivers_list)

    except Exception as e:
        print(f"Erro ao buscar dados: {e}")
        return jsonify({"error": f"Erro ao buscar dados: {str(e)}"}), 500

@app.route('/api/session_info')
def session_info():
    year = int(request.args.get('year', 2024))
    round_ = int(request.args.get('round', 1))
    session_name = request.args.get('session', 'FP1')

    try:
        session = fastf1.get_session(year, round_, session_name)
        session.load()

        event = session.event  # Correção

        weather = session.weather_data.iloc[0] if not session.weather_data.empty else None

        info = {
            'trackName': event['EventName'],
            'location': f"{event['Location']}, {event['Country']}",
            'length': None,  # FastF1 não fornece diretamente o comprimento
            'sessionName': session.name,
            'date': str(session.date.date()),
            'scheduledTime': str(session.date.time()) if session.date else 'N/A',
            'weather': {
                'airTemp': float(weather['AirTemp']) if weather is not None else None,
                'humidity': float(weather['Humidity']) if weather is not None else None,
                'rainfall': float(weather['Rainfall']) if weather is not None else None
            } if weather is not None else {}
        }

        return jsonify(info)

    except Exception as e:
        print(f"Erro ao carregar info da sessão: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/track')
def track():
    year = int(request.args.get('year', 2024))
    round_ = int(request.args.get('round', 1))

    try:
        session = fastf1.get_session(year, round_, 'FP1')
        session.load()

        event = session.event
        location = event['Location']

        track_info = {
            'circuit_name': event['EventName'],
            'track_name': session.track_name,
            'location': f"{location['Locality']}, {location['Country']}",
            'date': str(session.date)
        }
        return jsonify(track_info)
    except Exception as e:
        print(f"Erro ao buscar circuito: {e}")
        return jsonify({"error": f"Erro ao buscar circuito: {str(e)}"}), 500

@app.route('/api/telemetry')
def telemetry():
    year = int(request.args.get('year'))
    round_num = int(request.args.get('round'))
    session_name = request.args.get('session')
    driver = request.args.get('driver')

    try:
        session = fastf1.get_session(year, round_num, session_name)
        session.load()

        laps = session.laps.pick_driver(driver)
        laps_list = []

        for lap in laps.iterlaps():
            lap_data = lap[1]  # lap object
            telemetry = lap_data.get_telemetry()

            # Converter colunas timedelta para segundos
            for col in telemetry.columns:
                if pd.api.types.is_timedelta64_dtype(telemetry[col]):
                    telemetry[col] = telemetry[col].dt.total_seconds()

            # Colunas que queremos pegar, só se existirem:
            wanted_cols = ['Time', 'Distance', 'Speed', 'Throttle', 'Brake', 'Gear', 'RPM', 'gLat', 'gLong', 'X', 'Y']
            available_cols = [col for col in wanted_cols if col in telemetry.columns]

            telemetry_json = telemetry[available_cols].fillna(0)
            telemetry_json.columns = [col.lower() for col in telemetry_json.columns]
            telemetry_json = telemetry_json.to_dict(orient='records')

            laps_list.append({
                'lapNumber': int(lap_data['LapNumber']),
                'lapTime': str(lap_data['LapTime']) if pd.notnull(lap_data['LapTime']) else "N/A",
                'data': telemetry_json
            })

        return jsonify({'laps': laps_list})

    except Exception as e:
        return jsonify({'error': 'Erro ao buscar telemetria: ' + str(e)})
    
@app.route('/api/live_dashboard')
def live_dashboard():
    session_key = request.args.get('session_key', 'latest')

    try:
        # Fetch all required datasets
        def get_openf1_data(url):
            with urlopen(url) as response:
                return json.loads(response.read().decode())

        drivers_data = get_openf1_data(f'https://api.openf1.org/v1/drivers?session_key={session_key}')
        intervals_data = get_openf1_data(f'https://api.openf1.org/v1/intervals?session_key={session_key}')
        laps_data = get_openf1_data(f'https://api.openf1.org/v1/laps?session_key={session_key}')
        stints_data = get_openf1_data(f'https://api.openf1.org/v1/stints?session_key={session_key}')
        pits_data = get_openf1_data(f'https://api.openf1.org/v1/pit?session_key={session_key}')
        positions_data = get_openf1_data(f'https://api.openf1.org/v1/position?session_key={session_key}')

        latest_laps = {}
        for lap in laps_data:
            driver = lap['driver_number']
            if driver not in latest_laps or lap['lap_number'] > latest_laps[driver]['lap_number']:
                latest_laps[driver] = lap

        # Estrutura de dados para o dashboard
        dashboard = []

        for driver in drivers_data:
            number = driver['driver_number']
            name = driver['broadcast_name']

            # Verifica se está nos pits
            in_pit = any(p['driver_number'] == number and p['lap_number'] == latest_laps.get(number, {}).get('lap_number') for p in pits_data)

            # Posição (última conhecida)
            position_info = next((p for p in reversed(positions_data) if p['driver_number'] == number), None)
            position = position_info['position'] if position_info else None

            # Tipo de pneu
            stint_info = next((s for s in reversed(stints_data) if s['driver_number'] == number), None)
            tyre = stint_info['compound'] if stint_info else "UNKNOWN"

            # Intervalo para o carro à frente
            interval_info = next((i for i in intervals_data if i['driver_number'] == number), {})
            interval = interval_info.get('interval')

            # Última volta e setores
            last_lap = latest_laps.get(number, {})
            last_lap_time = last_lap.get('lap_duration')
            sector_1 = last_lap.get('duration_sector_1')
            sector_2 = last_lap.get('duration_sector_2')
            sector_3 = last_lap.get('duration_sector_3')

            dashboard.append({
                'driver_number': number,
                'driver_name': name,
                'position': position,
                'in_pit': in_pit,
                'tyre': tyre,
                'interval_to_car_ahead': interval,
                'last_lap_time': last_lap_time,
                'sector_1': sector_1,
                'sector_2': sector_2,
                'sector_3': sector_3
            })

        # Ordena por posição (caso esteja disponível)
        dashboard.sort(key=lambda d: d['position'] if d['position'] is not None else 100)

        return jsonify(dashboard)

    except Exception as e:
        print(f"Erro no live_dashboard: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    threading.Thread(target=update_live_data, daemon=True).start()
    app.run(debug=True)

