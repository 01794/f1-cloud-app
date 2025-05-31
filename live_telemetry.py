from flask import Blueprint, render_template, jsonify
import requests

live_telemetry_bp = Blueprint('live_telemetry', __name__, template_folder='templates')

@live_telemetry_bp.route('/live_telemetry')
def live_telemetry():
    return render_template('live_telemetry.html')


@live_telemetry_bp.route('/api/live_telemetry_data')
def live_telemetry_data():
    try:
        url = "https://api.openf1.org/v1/position"
        params = {"session_key": 9157}  # ou o correto para o evento atual
        response = requests.get(url, params=params)

        if response.status_code != 200:
            print("Erro ao buscar dados da OpenF1:", response.text)
            return jsonify({"error": "Erro ao buscar dados da OpenF1"}), 500

        data = response.json()
        print("Dados recebidos:", data[:3])  # mostrar os 3 primeiros itens
        return jsonify(data)

    except Exception as e:
        print("Erro interno:", e)
        return jsonify({"error": str(e)}), 500

#def live_telemetry_data():
    try:
        base_url = "https://api.openf1.org/v1/"

        telemetry_url = f"{base_url}car_data?session_key=latest&meeting_key=latest"
        driver_info_url = f"{base_url}drivers?session_key=latest&meeting_key=latest"
        timing_data_url = f"{base_url}position?session_key=latest&meeting_key=latest"

        telemetry_res = requests.get(telemetry_url)
        drivers_res = requests.get(driver_info_url)
        timing_res = requests.get(timing_data_url)

        if telemetry_res.status_code != 200 or drivers_res.status_code != 200 or timing_res.status_code != 200:
            return jsonify({'error': 'Erro ao buscar dados da OpenF1'}), 500

        telemetry_data = telemetry_res.json()
        driver_data = drivers_res.json()
        timing_data = timing_res.json()

        # Mapeia driver_number -> driver_info
        driver_map = {d['driver_number']: d for d in driver_data}

        # Mapeia driver_number -> posição atual
        pos_map = {}
        for d in timing_data:
            number = d['driver_number']
            if number not in pos_map or d['session_time'] > pos_map[number]['session_time']:
                pos_map[number] = d

        result = []
        seen = set()

        for row in telemetry_data:
            number = row['driver_number']
            if number in seen:
                continue
            seen.add(number)

            driver = driver_map.get(number, {})
            timing = pos_map.get(number, {})

            result.append({
                'driver_number': number,
                'name': driver.get('broadcast_name', 'Desconhecido'),
                'in_pits': row.get('is_pit_limiter_active', False),
                'tyre_compound': row.get('tyre_compound', 'Unknown'),
                'position': timing.get('position', 'N/A'),
                'last_lap_time': timing.get('last_lap_time', 'N/A'),
                's1': timing.get('best_sector1_time', 'N/A'),
                's2': timing.get('best_sector2_time', 'N/A'),
                's3': timing.get('best_sector3_time', 'N/A'),
                'gap_ahead': timing.get('gap_to_leader', 'N/A')
            })

        return jsonify(result)

    except Exception as e:
        print(f"Erro ao carregar dados da live telemetry: {e}")
        return jsonify({'error': str(e)}), 500
