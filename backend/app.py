from flask import Flask, send_from_directory, request, jsonify
from oct2py import Oct2Py
import numpy as np
import os
import traceback

app = Flask(__name__, static_folder='../frontend')

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/frontend/<path:filename>')
def frontend_static(filename):
    return send_from_directory('../frontend', filename)

@app.route('/simulate', methods=['POST'])
def simulate():
    try:
        data = request.get_json()

        # 1) Leer inputs
        V_max      = float(data.get('maxCapacity', 0))
        V0         = float(data.get('currentLevel', 0))
        A_cap      = float(data.get('catchmentArea', 0))
        Q_out_Lmin = float(data.get('outflowRate', 0))
        rainfall   = float(data.get('expectedRainfall', 0))
        duration_h = float(data.get('rainDuration', 0))
        pattern    = data.get('rainPattern', 'uniform')
        rain_intervals = data.get('rainIntervals', [])  # Nuevo campo

        # 2) Convertir Q_out y crear t_points (min) e intensities (mm/h)
        Q_out = Q_out_Lmin / 1000.0
        total_minutes = duration_h * 60.0

        if rain_intervals:
            t_points = [interval['time'] for interval in rain_intervals]  # en minutos
            intensities = [interval['intensity'] for interval in rain_intervals]  # en mm/h
            sorted_indices = np.argsort(t_points)
            t_points = np.array(t_points)[sorted_indices].tolist()
            intensities = np.array(intensities)[sorted_indices].tolist()
            t_points.append(total_minutes) 
            intensities.append(0.0) 
        else: 
            t_points_h = np.linspace(0, duration_h, 6)
            t_points   = t_points_h * 60.0

            if pattern == 'uniform':
                intensity_mm_h = rainfall / duration_h
                intensities = np.full_like(t_points, intensity_mm_h)
            elif pattern == 'increasing':
                base = rainfall / duration_h
                intensities = np.linspace(0.2, 1.0, len(t_points)) * base
            elif pattern == 'decreasing':
                base = rainfall / duration_h
                intensities = np.linspace(1.0, 0.2, len(t_points)) * base
            elif pattern == 'peak':
                base = rainfall / duration_h
                mid = len(t_points) // 2
                intensities = np.concatenate([
                    np.linspace(0.2, 1.0, mid+1),
                    np.linspace(1.0, 0.2, len(t_points) - mid - 1)
                ]) * base
            else:
                intensity_mm_h = rainfall / duration_h
                intensities = np.full_like(t_points, intensity_mm_h)
        
        dt = 1 # Paso de tiempo en minutos para la simulación de Octave

        # 3) Invocar a Octave
        oc = Oct2Py()
        # Establecer la ruta a los scripts de Octave
        octave_scripts_path = os.path.join(app.root_path, '..', 'octave_scripts')
        oc.addpath(octave_scripts_path)
        main_path = os.path.join(octave_scripts_path, 'main.m') # <-- main_path ya está definida aquí

        oc.push('V_max',         V_max)
        oc.push('V0',            V0)
        oc.push('A_cap',         A_cap)
        oc.push('Q_out',         Q_out)
        oc.push('lluvia_puntos', t_points)
        oc.push('intensidades',  intensities)
        oc.push('total_minutes_sim', total_minutes)
        oc.push('dt',            dt)

        oc.eval(f"run('{main_path}')") # <-- MODIFICAR ESTA LÍNEA para usar la ruta completa

        t_octave             = np.array(oc.pull('t')).flatten().tolist()
        V_octave             = np.array(oc.pull('V')).flatten().tolist()
        riesgo_octave        = bool(oc.pull('hay_riesgo'))
        t_desborde_oct       = float(oc.pull('t_desborde')) if riesgo_octave else None
        vaciar_oct           = float(oc.pull('vaciar'))
        texto_recomendacion  = str(oc.pull('texto_recomendacion'))

        oc.exit()

        # 4) Devolver JSON con el texto exacto de “texto_recomendacion”
        result = {
            'time_points':     t_octave,
            'water_levels':    V_octave,
            'overflow_risk':   riesgo_octave,
            'max_level':       max(V_octave),
            'overflow_time':   t_desborde_oct,
            'recommendations': texto_recomendacion,
            'max_capacity':    V_max,
            'rain_duration_minutes': total_minutes
        }
        return jsonify(result)

    except Exception as e:
        print("=== ERROR en /simulate ===")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)