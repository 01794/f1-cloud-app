from flask import Flask, request, jsonify, render_template
import json
from urllib.request import urlopen
import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime, timedelta
import fastf1
import requests
import pytz
import pandas as pd
import threading
import time
import os

app = Flask(__name__)

if not os.path.exists("./cache"):
    os.makedirs("./cache")

fastf1.Cache.enable_cache("./cache")

cred = credentials.Certificate("f1-cloud-lvtl-firebase-adminsdk-fbsvc-978b212e8f.json")
firebase_admin.initialize_app(
    cred,
    {
        "databaseURL": "https://f1-cloud-lvtl-default-rtdb.europe-west1.firebasedatabase.app/"
    },
)

SESSIONS = ["FP1", "FP2", "FP3", "Q", "R"]


def get_event_schedule(year):
    from fastf1.events import get_event_schedule as ges

    return ges(year)


"""""" """""" """""" """""" """""" """"""
telemetry_threads_started = False
keep_updating_telemetry = False

# --- session key ---
def get_latest_session_info():
    try:
        res = requests.get("https://api.openf1.org/v1/sessions?session_name=Race")
        res.raise_for_status()
        sessions = res.json()
        latest = sorted(sessions, key=lambda s: s.get("date_start", ""), reverse=True)
        return latest[0] if latest else None
    except Exception as e:
        print(f"[ERROR] session_info: {e}")
        return None
    
# --- THREAD DE TELEMETRIA ---
def fetch_and_push_live_telemetry():
    def loop():
        while True:
            try:
                res = requests.get("http://127.0.0.1:5000/api/live_dashboard")
                if res.status_code == 200:
                    dashboard = res.json()
                    db.reference("/live_telemetry").set(dashboard)
                    print(f"[LIVE TELEMETRY] Dados enviados: {len(dashboard)} pilotos")
            except Exception as e:
                print("Erro ao atualizar live_telemetry:", e)
            time.sleep(5.0)

    threading.Thread(target=loop, daemon=True).start()

# --- THREAD DE RESUMO DA CORRIDA ---
def fetch_and_push_race_summary():
    def loop():
        while True:
            try:
                events_res = requests.get(
                    "https://api.openf1.org/v1/race_control?session_key=latest"
                )
                summary = "Eventos de controle de corrida"
                events = []
                if events_res.status_code == 200:
                    events_data = events_res.json()
                    for event in reversed(events_data[-5:]):
                        event_text = f"[{event.get('flag_state', 'INFO')}] {event.get('message', '')}"
                        events.append(event_text)

                db.reference("/race_summary").set(
                    {"summary": summary, "events": events}
                )
            except Exception as e:
                print("Erro ao atualizar race_summary:", e)
            time.sleep(15.0)

    threading.Thread(target=loop, daemon=True).start()

# --- THREAD DE RÁDIOS ---
def fetch_and_push_team_radio():
    def loop():
        while True:
            try:
                res = requests.get("https://api.openf1.org/v1/team_radio?session_key=latest")
                if res.status_code == 200:
                    radios_data = res.json()
                    radios = [
                        {
                            "driver_number": r.get("driver_number"),
                            "message": r.get("transcript", ""),
                            "date": r.get("date"),
                            "recording_url": r.get("recording_url")
                        }
                        for r in reversed(radios_data)
                        if r.get("recording_url")  # só se tiver áudio
                    ][:5]  # pega os 5 mais recentes com áudio

                    db.reference('/team_radio').set(radios)
            except Exception as e:
                print("Erro ao atualizar team_radio:", e)
            time.sleep(10.0)

    threading.Thread(target=loop, daemon=True).start()

# --- THREAD DE PENALIDADES ---
def fetch_and_push_penalties():
    try:
        # Obter a sessão mais recente
        sessions = requests.get("https://api.openf1.org/v1/sessions").json()
        sessions = [s for s in sessions if s.get("date_start")]
        sessions.sort(key=lambda s: s["date_start"], reverse=True)
        latest = sessions[0]

        session_key = latest["session_key"]
        print(f"[PENALTIES] Usando session_key={session_key} ({latest['session_name']})")

        # Buscar mensagens de controle de corrida
        race_control_url = f"https://api.openf1.org/v1/race_control?session_key={session_key}"
        events = requests.get(race_control_url).json()
        print(f"[PENALTIES] Total de eventos recebidos: {len(events)}")

        # Palavras-chave que sugerem penalidades
        penalty_keywords = [
            "TIME PENALTY",
            "DRIVE THROUGH",
            "STOP AND GO",
            "DISQUALIFIED",
            "BLACK AND WHITE",
            "UNSAFE RELEASE",
            "PENALTY FOR",
            "PIT LANE SPEEDING",
            "DELETED LAP TIME",
            "YELLOW FLAG INFRINGEMENT"
        ]

        penalties = []
        for e in events:
            message = e.get("message", "").upper()
            if any(keyword in message for keyword in penalty_keywords):
                penalties.append({
                    "driver_number": e.get("driver_number"),
                    "penalty_type": e.get("category") or "Penalty",
                    "description": e.get("message"),
                    "lap_number": e.get("lap_number"),
                    "date": e.get("date")
                })

        print(f"[PENALTIES] Penalidades encontradas: {len(penalties)}")

        db.reference("/penalties").set(penalties)
        print("[PENALTIES] Penalidades enviadas para o Firebase.")

    except Exception as e:
        print(f"[PENALTIES] Erro ao buscar penalidades: {e}")

# --- THREAD DE SESSION INFO ---
def fetch_and_push_session_info():
    try:
        # 1. Buscar todas as sessões já iniciadas, ordenadas por data
        res = requests.get("https://api.openf1.org/v1/sessions")
        data = res.json()

        if not data:
            print("[SESSION INFO] Nenhuma sessão encontrada.")
            return

        # Filtrar apenas sessões com data de início definida
        data = [s for s in data if s.get("date_start")]
        data.sort(key=lambda s: s["date_start"], reverse=True)  # Mais recente primeiro

        session = data[0]
        meeting_key = session["meeting_key"]

        # 2. Buscar o nome da corrida usando o meeting_key
        meeting_res = requests.get(f"https://api.openf1.org/v1/meetings?meeting_key={meeting_key}")
        meeting_data = meeting_res.json()
        meeting = meeting_data[0] if meeting_data else {}

        session_info = {
            "session_name": session.get("session_name", "Sessão"),
            "meeting_name": meeting.get("meeting_name") or "Evento desconhecido",
            "location": meeting.get("location") or session.get("location", "Desconhecido"),
            "country": meeting.get("country_name") or session.get("country_name", "Desconhecido"),
            "start_time": session.get("date_start", "Horário indefinido"),
        }

        db.reference("/session_info").set(session_info)
        print("[SESSION INFO] Enviado:", session_info)

    except Exception as e:
        print("Erro em fetch_and_push_session_info:", e)

# --- THREAD DE SESSION DETAILS ---
def fetch_and_push_session_details():
    try:
        res = requests.get("https://api.openf1.org/v1/sessions")
        sessions = res.json()

        if not sessions:
            print("[SESSION DETAILS] Nenhuma sessão encontrada.")
            return

        sessions = [s for s in sessions if s.get("date_start")]
        sessions.sort(key=lambda s: s["date_start"], reverse=True)

        for session in sessions:
            meeting_key = session["meeting_key"]
            session_key = session["session_key"]

            print(f"[DEBUG] Verificando sessão: {session['session_name']} ({meeting_key}/{session_key})")

            weather_res = requests.get(
                f"https://api.openf1.org/v1/weather?meeting_key={meeting_key}&session_key={session_key}"
            )
            weather_data = weather_res.json()
            if not weather_data:
                continue

            last = weather_data[-1]
            print(f"[DEBUG] Clima encontrado:", last)

            rainfall = last.get("rainfall", 0)
            weather_label = "Wet" if rainfall and rainfall > 0 else "Dry"

            session_details = {
                "air_temp": last.get("air_temperature"),
                "track_temp": last.get("track_temperature"),
                "wind_speed": last.get("wind_speed"),
                "current_lap": last.get("session_time", "N/D"),
                "weather": weather_label
            }

            db.reference("/session_details").set(session_details)
            print("[SESSION DETAILS] Enviado corretamente:", session_details)
            return

        print("[SESSION DETAILS] Nenhuma sessão com dados climáticos.")

    except Exception as e:
        print("Erro em fetch_and_push_session_details:", e)



@app.route("/")
def index():
    return render_template("index.html")

@app.route("/live_telemetry")
def live_telemetry():
    global telemetry_threads_started
    if not telemetry_threads_started:
        fetch_and_push_live_telemetry()
        fetch_and_push_race_summary()
        fetch_and_push_team_radio()
        fetch_and_push_penalties()
        fetch_and_push_session_info()
        fetch_and_push_session_details()
        telemetry_threads_started = True
    return render_template("live_telemetry.html")



@app.route("/analysis")
def analysis():
    return render_template("analysis.html")


@app.route("/replay")
def replay():
    return render_template("replay.html")

@app.route("/api/live_positions")
def live_positions():
    import numpy as np

    try:
        now = datetime.datetime.now(pytz.utc)
        schedule = fastf1.get_event_schedule(now.year, include_testing=False)

        # Obter última sessão válida
        schedule = schedule.dropna(subset=[f"Session{i}DateUtc" for i in range(1, 6)], how='all')
        past_sessions = []
        for i in range(1, 6):
            date_col = f"Session{i}DateUtc"
            name_col = f"Session{i}"
            if date_col in schedule.columns and name_col in schedule.columns:
                schedule[date_col] = pd.to_datetime(schedule[date_col], utc=True)
                recent = schedule[schedule[date_col] <= now]
                if not recent.empty:
                    last = recent.iloc[-1]
                    past_sessions.append((int(last["RoundNumber"]), last[name_col]))

        if not past_sessions:
            return jsonify([])

        rnd, session_name = past_sessions[-1]
        session = fastf1.get_session(now.year, rnd, session_name)
        session.load(telemetry=False, laps=False, weather=False, messages=False)

        pos_data = session.position_data
        if pos_data.empty:
            return jsonify([])

        latest_time = pos_data.index.get_level_values(1).max()
        latest_positions = pos_data.xs(latest_time, level=1)

        # Normalize positions for rendering
        x_vals = latest_positions["X"].astype(float)
        y_vals = latest_positions["Y"].astype(float)
        min_x, max_x = x_vals.min(), x_vals.max()
        min_y, max_y = y_vals.min(), y_vals.max()

        norm_x = ((x_vals - min_x) / (max_x - min_x)) * 100
        norm_y = ((y_vals - min_y) / (max_y - min_y)) * 100

        drivers = latest_positions.index
        data = [
            {"driver_number": driver, "x": float(x), "y": float(y)}
            for driver, x, y in zip(drivers, norm_x, norm_y)
        ]

        return jsonify(data)

    except Exception as e:
        print(f"[ERROR] FastF1 /api/live_positions: {e}")
        return jsonify([])


@app.route("/api/replay_telemetry")
def replay_telemetry():
    session_key = request.args.get("session_key")
    start = int(request.args.get("start", 0))
    step = int(request.args.get("step", 7))

    try:
        end_time = datetime.datetime.utcnow()
        start_time = end_time - datetime.timedelta(seconds=step)

        # Formata as datas no formato ISO para usar nos parâmetros da OpenF1
        start_iso = start_time.isoformat()
        end_iso = end_time.isoformat()

        url = f"https://api.openf1.org/v1/location?session_key={session_key}&date>={start_iso}&date<={end_iso}"
        response = urlopen(url)
        data = json.loads(response.read().decode())

        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/compare")
def api_compare():
    driver1 = request.args.get("driver1")
    driver2 = request.args.get("driver2")
    year = int(request.args.get("year", 2024))
    round_ = int(request.args.get("round", 1))
    session_name = request.args.get("session", "R")

    try:
        session = fastf1.get_session(year, round_, session_name)
        session.load()

        laps1 = session.laps.pick_driver(driver1)
        laps2 = session.laps.pick_driver(driver2)

        best1 = laps1.pick_fastest().get("LapTime")
        best2 = laps2.pick_fastest().get("LapTime")

        return jsonify(
            {
                "driver1": {"name": driver1, "best_lap": str(best1)},
                "driver2": {"name": driver2, "best_lap": str(best2)},
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/drivers")
def drivers():
    year = int(request.args.get("year", 2024))
    round_ = int(request.args.get("round", 1))
    session_name = request.args.get("session", "FP1")
    if session_name not in SESSIONS:
        session_name = "FP1"
    try:
        session = fastf1.get_session(year, round_, session_name)
        session.load()

        results = session.results
        results["Time"] = results["Time"].fillna(pd.Timedelta(0))
        results["Position"] = results["Position"].fillna(0).astype(int)
        results["Status"] = results["Status"].fillna("Unknown")

        drivers_list = []
        for _, row in results.iterrows():
            drivers_list.append(
                {
                    "number": row["DriverNumber"],
                    "name": row["BroadcastName"],
                    "abbr": row["Abbreviation"],
                    "team": row["TeamName"],
                    "position": row["Position"],
                    "status": row["Status"],
                    "time": str(row["Time"]) if pd.notnull(row["Time"]) else None,
                }
            )

        return jsonify(drivers_list)

    except Exception as e:
        print(f"Erro ao buscar dados: {e}")
        return jsonify({"error": f"Erro ao buscar dados: {str(e)}"}), 500


@app.route("/api/session_info")
def session_info():
    year = int(request.args.get("year", 2024))
    round_ = int(request.args.get("round", 1))
    session_name = request.args.get("session", "FP1")

    try:
        session = fastf1.get_session(year, round_, session_name)
        session.load()

        event = session.event  # Correção

        weather = (
            session.weather_data.iloc[0] if not session.weather_data.empty else None
        )

        info = {
            "trackName": event["EventName"],
            "location": f"{event['Location']}, {event['Country']}",
            "length": None,  # FastF1 não fornece diretamente o comprimento
            "sessionName": session.name,
            "date": str(session.date.date()),
            "scheduledTime": str(session.date.time()) if session.date else "N/A",
            "weather": (
                {
                    "airTemp": (
                        float(weather["AirTemp"]) if weather is not None else None
                    ),
                    "humidity": (
                        float(weather["Humidity"]) if weather is not None else None
                    ),
                    "rainfall": (
                        float(weather["Rainfall"]) if weather is not None else None
                    ),
                }
                if weather is not None
                else {}
            ),
        }

        return jsonify(info)

    except Exception as e:
        print(f"Erro ao carregar info da sessão: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/track")
def track():
    year = int(request.args.get("year", 2024))
    round_ = int(request.args.get("round", 1))

    try:
        session = fastf1.get_session(year, round_, "FP1")
        session.load()

        event = session.event
        location = event["Location"]

        track_info = {
            "circuit_name": event["EventName"],
            "track_name": session.track_name,
            "location": f"{location['Locality']}, {location['Country']}",
            "date": str(session.date),
        }
        return jsonify(track_info)
    except Exception as e:
        print(f"Erro ao buscar circuito: {e}")
        return jsonify({"error": f"Erro ao buscar circuito: {str(e)}"}), 500


@app.route("/api/track_map")
def track_map():
    try:
        now = datetime.datetime.now(pytz.utc)
        schedule = fastf1.get_event_schedule(now.year, include_testing=False)
        schedule = schedule.dropna(axis=1, how="all")

        last_valid = None
        for i in range(5, 0, -1):  # Session5 → Session1
            date_col = f"Session{i}DateUtc"
            name_col = f"Session{i}"
            if date_col in schedule.columns and name_col in schedule.columns:
                schedule[date_col] = pd.to_datetime(schedule[date_col], utc=True)
                past_sessions = schedule[schedule[date_col] <= now]
                if not past_sessions.empty:
                    last_session = past_sessions.iloc[-1]
                    session_name = last_session[name_col]
                    round_number = int(last_session["RoundNumber"])
                    last_valid = (round_number, session_name)
                    break

        if not last_valid:
            return jsonify({"error": "Nenhuma sessão passada válida encontrada"}), 404

        rnd, session_name = last_valid

        session = fastf1.get_session(now.year, rnd, session_name)
        session.load(telemetry=False, weather=False, messages=False, laps=False)

        circuit_info = session.get_circuit_info()

        # Algumas versões do FastF1 têm o traçado em `corners`, outras exigem get_corners()
        try:
            corners = circuit_info.corners
        except AttributeError:
            try:
                corners = circuit_info.get_corners()
            except Exception:
                return jsonify({"error": "Sem dados de traçado disponíveis"}), 404

        if corners is None or corners.empty:
            return jsonify({"error": "Sem dados de traçado disponíveis"}), 404

        # Normaliza os dados para JSON
        x = corners["X"].astype(float).tolist()
        y = corners["Y"].astype(float).tolist()
        data = [{"x": xi, "y": yi} for xi, yi in zip(x, y)]

        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/telemetry")
def telemetry():
    year = int(request.args.get("year"))
    round_num = int(request.args.get("round"))
    session_name = request.args.get("session")
    driver = request.args.get("driver")

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
            wanted_cols = [
                "Time",
                "Distance",
                "Speed",
                "Throttle",
                "Brake",
                "Gear",
                "RPM",
                "gLat",
                "gLong",
                "X",
                "Y",
            ]
            available_cols = [col for col in wanted_cols if col in telemetry.columns]

            telemetry_json = telemetry[available_cols].fillna(0)
            telemetry_json.columns = [col.lower() for col in telemetry_json.columns]
            telemetry_json = telemetry_json.to_dict(orient="records")

            laps_list.append(
                {
                    "lapNumber": int(lap_data["LapNumber"]),
                    "lapTime": (
                        str(lap_data["LapTime"])
                        if pd.notnull(lap_data["LapTime"])
                        else "N/A"
                    ),
                    "data": telemetry_json,
                }
            )

        return jsonify({"laps": laps_list})

    except Exception as e:
        return jsonify({"error": "Erro ao buscar telemetria: " + str(e)})


@app.route("/api/live_dashboard")
def live_dashboard():
    session_key = request.args.get("session_key", "latest")

    try:
        # Fetch all required datasets
        def get_openf1_data(url):
            with urlopen(url) as response:
                return json.loads(response.read().decode())

        drivers_data = get_openf1_data(
            f"https://api.openf1.org/v1/drivers?session_key={session_key}"
        )
        intervals_data = get_openf1_data(
            f"https://api.openf1.org/v1/intervals?session_key={session_key}"
        )
        laps_data = get_openf1_data(
            f"https://api.openf1.org/v1/laps?session_key={session_key}"
        )
        stints_data = get_openf1_data(
            f"https://api.openf1.org/v1/stints?session_key={session_key}"
        )
        pits_data = get_openf1_data(
            f"https://api.openf1.org/v1/pit?session_key={session_key}"
        )
        positions_data = get_openf1_data(
            f"https://api.openf1.org/v1/position?session_key={session_key}"
        )

        latest_laps = {}
        for lap in laps_data:
            driver = lap["driver_number"]
            if (
                driver not in latest_laps
                or lap["lap_number"] > latest_laps[driver]["lap_number"]
            ):
                latest_laps[driver] = lap

        # Estrutura de dados para o dashboard
        dashboard = []

        for driver in drivers_data:
            number = driver["driver_number"]
            name = driver["broadcast_name"]

            # Verifica se está nos pits
            in_pit = any(
                p["driver_number"] == number
                and p["lap_number"] == latest_laps.get(number, {}).get("lap_number")
                for p in pits_data
            )

            # Posição (última conhecida)
            position_info = next(
                (p for p in reversed(positions_data) if p["driver_number"] == number),
                None,
            )
            position = position_info["position"] if position_info else None

            # Tipo de pneu
            stint_info = next(
                (s for s in reversed(stints_data) if s["driver_number"] == number), None
            )
            tyre = stint_info["compound"] if stint_info else "UNKNOWN"

            # Intervalo para o carro à frente
            interval_info = next(
                (i for i in intervals_data if i["driver_number"] == number), {}
            )
            interval = interval_info.get("interval")

            # Última volta e setores
            last_lap = latest_laps.get(number, {})
            last_lap_time = last_lap.get("lap_duration")
            sector_1 = last_lap.get("duration_sector_1")
            sector_2 = last_lap.get("duration_sector_2")
            sector_3 = last_lap.get("duration_sector_3")

            dashboard.append(
                {
                    "driver_number": number,
                    "driver_name": name,
                    "position": position,
                    "in_pit": in_pit,
                    "tyre": tyre,
                    "interval_to_car_ahead": interval,
                    "last_lap_time": last_lap_time,
                    "sector_1": sector_1,
                    "sector_2": sector_2,
                    "sector_3": sector_3,
                }
            )

        # Ordena por posição (caso esteja disponível)
        dashboard.sort(
            key=lambda d: d["position"] if d["position"] is not None else 100
        )

        return jsonify(dashboard)

    except Exception as e:
        print(f"Erro no live_dashboard: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/race_summary")
def race_summary():
    try:
        laps_data = json.loads(
            urlopen("https://api.openf1.org/v1/laps?session_key=latest").read().decode()
        )
        flags_data = json.loads(
            urlopen("https://api.openf1.org/v1/race_control?session_key=latest")
            .read()
            .decode()
        )

        # Voltas por piloto
        summary = {}
        for lap in laps_data:
            num = lap["driver_number"]
            summary[num] = summary.get(num, 0) + 1
        summary_list = [{"driver_number": k, "laps": v} for k, v in summary.items()]

        # Eventos relevantes (flags, pits, etc.)
        eventos = []
        for f in flags_data:
            if any(k in f["message"].upper() for k in ["PIT", "FLAG", "SC", "VSC"]):
                eventos.append(
                    {
                        "driver_number": f.get("driver_number"),
                        "message": f["message"],
                        "date": f["date"],
                    }
                )

        return jsonify({"summary": summary_list, "events": eventos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/team_radio")
def team_radio():
    try:
        data = json.loads(
            urlopen("https://api.openf1.org/v1/team_radio?session_key=latest")
            .read()
            .decode()
        )
        return jsonify(data[-10:])  # últimos 10 áudios
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/penalties")
def penalties():
    try:
        data = json.loads(
            urlopen("https://api.openf1.org/v1/race_control?session_key=latest")
            .read()
            .decode()
        )
        penalties = [d for d in data if "PENALTY" in d["message"].upper()]
        return jsonify(penalties)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/current_session")
def current_session():
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        print("[INFO] Current UTC time:", now)

        # Carrega calendário do ano atual
        schedule = fastf1.get_event_schedule(now.year)
        print("[INFO] Event schedule loaded.")

        # Verifica todas as sessões passadas
        past_sessions = []
        for _, row in schedule.iterrows():
            for i in range(1, 6):
                session_date = row.get(f"Session{i}Date")
                session_name = row.get(f"Session{i}")
                if pd.notnull(session_date) and session_date <= now:
                    past_sessions.append((session_date, row, session_name))

        if not past_sessions:
            return jsonify({"error": "Nenhuma sessão passada encontrada."}), 404

        # Pega a sessão mais recente do passado
        latest_date, event, session_name = sorted(past_sessions, key=lambda x: x[0])[-1]
        round_ = int(event["RoundNumber"])

        return jsonify(
            {
                "year": now.year,
                "round": round_,
                "track": event["EventName"],
                "location": f"{event['Location']}, {event['Country']}",
                "session": session_name,
                "session_pretty": session_name,  # sem .name do FastF1
                "date": str(latest_date),
            }
        )

    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/session_details_openf1")
def session_details_openf1():
    try:
        weather_data = json.loads(
            urlopen("https://api.openf1.org/v1/weather?session_key=latest")
            .read()
            .decode()
        )
        laps_data = json.loads(
            urlopen("https://api.openf1.org/v1/laps?session_key=latest").read().decode()
        )

        latest_weather = weather_data[-1] if weather_data else {}
        latest_lap = max(laps_data, key=lambda l: l["lap_number"]) if laps_data else {}

        return jsonify(
            {
                "air_temp": latest_weather.get("air_temperature"),
                "track_temp": latest_weather.get("track_temperature"),
                "wind_speed": latest_weather.get("wind_speed"),
                "wind_direction": latest_weather.get("wind_direction"),
                "current_lap": latest_lap.get("lap_number"),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
