import fastf1

schedule = fastf1.get_event_schedule(2025)
print(schedule.columns)
import time
import threading
import requests
from flask import Flask, render_template
import firebase_admin
from firebase_admin import credentials, db

# Inicialização do Firebase
cred = credentials.Certificate("f1-cloud-lvtl-firebase-adminsdk-fbsvc-978b212e8f.json")
firebase_admin.initialize_app(
    cred,
    {
        "databaseURL": "https://f1-cloud-lvtl-default-rtdb.europe-west1.firebasedatabase.app/"
    },
)

# Inicialização do Flask
app = Flask(__name__)


# Rotas
@app.route("/")
def live_telemetry():
    return render_template("live_telemetry.html")


# Atualização de Telemetria
def update_live_telemetry():
    try:
        url = "https://api.openf1.org/v1/position?session_key=latest"
        response = requests.get(url)
        data = response.json()
        telemetry = {}

        for item in data:
            driver_num = item.get("driver_number")
            if not driver_num:
                continue

            telemetry[driver_num] = {
                "driver_number": driver_num,
                "name": item.get("name_acronym", "N/A"),
                "team": item.get("team", "N/A"),
                "position": item.get("position", "-"),
                "lap": item.get("lap_number", "-"),
                "lap_time": item.get("best_lap_time", "-"),
                "gap": item.get("gap_to_leader", "-"),
                "interval": item.get("interval_to_car_ahead", "-"),
                "tyres": item.get("compound", "-"),
                "speed": item.get("speed", "-"),
                "status": item.get("status", "-"),
            }

        db.reference("/live_telemetry").set(telemetry)
        print("📡 Telemetria atualizada com sucesso")
    except Exception as e:
        print("Erro ao atualizar live_telemetry:", e)


def update_session_info():
    try:
        url = "https://api.openf1.org/v1/sessions?session_key=latest"
        response = requests.get(url)
        data = response.json()
        if not data:
            return

        session = data[0]
        session_info = {
            "meeting_name": session.get("meeting_name", "Unknown"),
            "session_name": session.get("session_name", "Unknown"),
            "location": session.get("location", "Unknown"),
            "year": session.get("meeting_key", "")[:4],
            "date": session.get("date_start", ""),
        }

        db.reference("/session_info").set(session_info)
        print("ℹ️ Session Info atualizado")
    except Exception as e:
        print("Erro ao atualizar session_info:", e)


def update_session_details():
    try:
        url = "https://api.openf1.org/v1/stints?session_key=latest"
        response = requests.get(url)
        data = response.json()
        if not data:
            return

        details = {}
        for stint in data:
            driver_num = stint.get("driver_number")
            if not driver_num:
                continue

            if driver_num not in details:
                details[driver_num] = []

            details[driver_num].append(
                {
                    "compound": stint.get("compound", "-"),
                    "stint": stint.get("stint_number", "-"),
                    "lap_start": stint.get("lap_start", "-"),
                    "lap_end": stint.get("lap_end", "-"),
                }
            )

        db.reference("/session_details").set(details)
        print("📝 Session Details atualizado")
    except Exception as e:
        print("Erro ao atualizar session_details:", e)


def update_race_summary():
    try:
        url = "https://api.openf1.org/v1/results?session_key=latest"
        response = requests.get(url)
        data = response.json()
        summary = {}

        for res in data:
            driver_num = res.get("driver_number")
            if not driver_num:
                continue

            summary[driver_num] = {
                "position": res.get("position"),
                "driver": res.get("name_acronym"),
                "team": res.get("team"),
                "status": res.get("status"),
                "time": res.get("time"),
            }

        db.reference("/race_summary").set(summary)
        print("🏁 Race Summary atualizado")
    except Exception as e:
        print("Erro ao atualizar race_summary:", e)


def update_penalties():
    try:
        url = "https://api.openf1.org/v1/penalties?session_key=latest"
        response = requests.get(url)
        data = response.json()
        if not data:
            return

        penalties = []
        for penalty in data:
            penalties.append(
                {
                    "driver_number": penalty.get("driver_number"),
                    "reason": penalty.get("reason"),
                    "lap": penalty.get("lap_number"),
                    "time": penalty.get("penalty_seconds", "-"),
                }
            )

        db.reference("/penalties").set(penalties)
        print("⚠️ Penalidades atualizadas")
    except Exception as e:
        print("Erro ao atualizar penalties:", e)


def update_team_radio():
    try:
        url = "https://api.openf1.org/v1/team_radio?session_key=latest"
        response = requests.get(url)
        data = response.json()
        radios = []

        for radio in data:
            radios.append(
                {
                    "driver_number": radio.get("driver_number"),
                    "message": radio.get("transcript"),
                    "date": radio.get("date"),
                }
            )

        db.reference("/team_radio").set(radios)
        print("🎙️ Team Radio atualizado")
    except Exception as e:
        print("Erro ao atualizar team_radio:", e)


def atualizar_dados_openf1():
    while True:
        print("🔄 Atualizando dados do OpenF1...")
        update_live_telemetry()
        update_session_info()
        update_session_details()
        update_race_summary()
        update_penalties()
        update_team_radio()
        time.sleep(10)


# Inicializa o loop de atualizações em background
if __name__ == "__main__":
    threading.Thread(target=atualizar_dados_openf1, daemon=True).start()
    app.run(debug=True)
