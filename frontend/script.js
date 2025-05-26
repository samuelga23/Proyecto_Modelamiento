// Convertir horas a minutos
function hoursToMinutes(hours) {
    return hours * 60;
}

// Generar intervalos automáticos de 1 hora
function generateIntervals(durationHours) {
    const intervalInputs = document.getElementById('intervalInputs');
    intervalInputs.innerHTML = ''; // Limpiar intervalos existentes

    if (durationHours <= 0) return; // No generar intervalos si la duración es 0 o negativa

    const numIntervals = Math.ceil(durationHours); // Número de intervalos de 1 hora
    for (let i = 0; i < numIntervals; i++) {
        const startHours = i;
        const endHours = Math.min(i + 1, durationHours);
        const startTime = hoursToMinutes(startHours);
        const endTime = hoursToMinutes(endHours);
        const startTimeString = `${startHours.toString().padStart(2, '0')}:00`;
        const endTimeString = `${Math.floor(endHours).toString().padStart(2, '0')}:${(endHours % 1 * 60).toString().padStart(2, '0')}`;

        const intervalDiv = document.createElement('div');
        intervalDiv.className = 'interval-pair';
        intervalDiv.innerHTML = `
            <label style="display: inline-block; width: 150px;">${startTimeString} - ${endTimeString}</label>
            <input type="number" name="intensity_${i}" placeholder="Intensidad (mm/h)" step="0.1" min="0" required>
        `;
        intervalInputs.appendChild(intervalDiv);
    }
}

// Actualizar intervalos cuando cambia la duración
document.getElementById('rainDuration').addEventListener('change', function() {
    const durationHours = parseFloat(this.value) || 0;
    generateIntervals(durationHours);
});

// Generar intervalos iniciales (vacíos hasta que se ingrese una duración)
generateIntervals(0);

let chart = null;

document.getElementById('reservoirForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());
    
    // Recolectar intervalos
    const durationHours = parseFloat(data.rainDuration) || 0;
    const numIntervals = Math.ceil(durationHours);
    const intervals = [];
    let totalRainfall = 0; // Puedes mantener esta variable si la usas para mostrar al usuario en el frontend

    for (let i = 0; i < numIntervals; i++) {
        const intensity = parseFloat(data[`intensity_${i}`]) || 0;
        const startTime = hoursToMinutes(i);
        const endTime = hoursToMinutes(Math.min(i + 1, durationHours));
        if (!isNaN(intensity)) {
            intervals.push({ time: startTime, intensity });
            const intervalDuration = (endTime - startTime) / 60;
            totalRainfall += intensity * intervalDuration;
        }
    }
    data.rainIntervals = intervals;
    
    // Validaciones rápidas
    if (parseFloat(data.currentLevel) > parseFloat(data.maxCapacity)) {
        showAlert('El nivel actual no puede ser mayor que la capacidad máxima', 'danger');
        return;
    }

    showLoading(true);
    document.getElementById('simulateBtn').disabled = true;

    try {
        const response = await fetch('/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (response.ok) {
            displayResults(result);
        } else {
            showAlert(result.error || 'Error en la simulación', 'danger');
        }
    } catch (error) {
        showAlert('Error de conexión: ' + error.message, 'danger');
    } finally {
        showLoading(false);
        document.getElementById('simulateBtn').disabled = false;
    }
});

// Funciones auxiliares para la interfaz
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showAlert(message, type) {
    const alertsContainer = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.display = 'block';
    alertsContainer.innerHTML = '';
    alertsContainer.appendChild(alert);
    setTimeout(() => { alert.remove(); }, 10000);
}

function displayResults(result) {
    document.getElementById('initialMessage').style.display = 'none';
    document.getElementById('results').style.display = 'block';
    
    // Mostrar alerta según el resultado
    if (result.overflow_risk) {
        showAlert(
            `⚠️ RIESGO DE DESBORDAMIENTO: Se alcanzará ${result.max_level.toFixed(2)} m³ a los ${result.overflow_time.toFixed(1)} min`,
            'warning'
        );
    } else {
        showAlert(
            `✅ Sin riesgo de desbordamiento. Nivel máximo: ${result.max_level.toFixed(2)} m³`,
            'success'
        );
    }

    // Generar gráfico
    createChart(result.time_points, result.water_levels, result.max_capacity, result.rain_duration_minutes);

    // Mostrar recomendaciones
    const container = document.getElementById('recommendations');
    container.innerHTML = '<h3>💡 Recomendaciones</h3>';
    const p = document.createElement('p');
    p.textContent = result.recommendations;
    container.appendChild(p);
}

let waterLevelChart; // Variable para mantener la instancia del gráfico

function createChart(timePoints, waterLevels, maxCapacity, rainDurationMinutes) { // <-- LÍNEA MODIFICADA: Añadir rainDurationMinutes
    const ctx = document.getElementById('waterLevelChart').getContext('2d');

    if (waterLevelChart) {
        waterLevelChart.destroy(); // Destruir el gráfico existente si lo hay
    }

    waterLevelChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timePoints,
            datasets: [
                {
                    label: 'Nivel de Agua',
                    data: waterLevels,
                    borderColor: '#2196F3',
                    borderWidth: 2,
                    fill: true,
                    backgroundColor: 'rgba(33, 150, 243, 0.2)',
                    tension: 0.1
                },
                {
                    label: 'Capacidad Máxima',
                    data: new Array(timePoints.length).fill(maxCapacity),
                    borderColor: '#f44336',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Evolución del Nivel de Agua'
                },
                legend: { display: true }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Tiempo (min)' },
                    // MODIFICACIÓN: AÑADIR MIN Y MAX PARA EL EJE X
                    min: 0,
                    max: rainDurationMinutes, // <-- Establece el máximo del eje X a la duración de la lluvia
                    ticks: {
                        // Opcional: ajustar los pasos de los ticks si es necesario.
                        // Por ejemplo, para mostrar ticks cada 60 minutos (cada hora):
                        // stepSize: 60
                    }
                },
                y: {
                    title: { display: true, text: 'Volumen (m³)' },
                    beginAtZero: true
                }
            }
        }
    });
}

// Validación en tiempo real para el nivel actual
document.getElementById('currentLevel').addEventListener('input', function() {
    const maxCapacity = parseFloat(document.getElementById('maxCapacity').value) || 0;
    const currentLevel = parseFloat(this.value) || 0;
    
    if (currentLevel > maxCapacity && maxCapacity > 0) {
        this.style.borderColor = '#f44336';
        showAlert('El nivel actual no puede superar la capacidad máxima', 'danger');
    } else {
        this.style.borderColor = '#ddd';
    }
});