// analysis.js

const gpSelect = document.getElementById("gp-select");
const sessionSelect = document.getElementById("session-type");
const driverSelect = document.getElementById("driver-select");
const lapSelect = document.getElementById("lap-select");
const loadButton = document.getElementById("load-lap-button");

let telemetryData = {};

async function listGPs() {
  try {
    const response = await fetch("/api/gcs/list_gps");
    const gps = await response.json();
    gpSelect.innerHTML = gps.map(gp => `<option value="${gp}">${gp}</option>`).join("");
    await loadSessionInfo();
  } catch (err) {
    console.error("Erro ao listar GPs:", err);
  }
}

async function loadSessionInfo() {
  const gp = gpSelect.value;
  const session = sessionSelect.value;
  try {
    const res = await fetch(`/api/gcs/session_info?gp=${gp}&session=${session}`);
    const info = await res.json();
    document.getElementById("session-info").innerText = `${info.session_name} - ${info.location}, ${info.country}`;
    document.getElementById("session-details").innerText = `Início: ${formatTime(info.start_time)}`;
    await loadDrivers();
  } catch (err) {
    console.error("Erro ao carregar info da sessão:", err);
  }
}

async function loadDrivers() {
  const gp = gpSelect.value;
  const session = sessionSelect.value;
  try {
    const res = await fetch(`/api/gcs/list_drivers?gp=${gp}&session=${session}`);
    const drivers = await res.json();
    driverSelect.innerHTML = drivers.map(d => `<option value="${d.code}">${d.code} - ${d.name}</option>`).join("");
    await loadLaps();
  } catch (err) {
    console.error("Erro ao carregar pilotos:", err);
  }
}

async function loadLaps() {
  const gp = gpSelect.value;
  const session = sessionSelect.value;
  const driver = driverSelect.value;
  try {
    const res = await fetch(`/api/gcs/list_laps?gp=${gp}&session=${session}&driver=${driver}`);
    const laps = await res.json();
    lapSelect.innerHTML = laps.map(l => `<option value="${l.lap}">Volta ${l.lap}</option>`).join("");
  } catch (err) {
    console.error("Erro ao carregar voltas:", err);
  }
}

loadButton.addEventListener("click", async () => {
  const gp = gpSelect.value;
  const session = sessionSelect.value;
  const driver = driverSelect.value;
  const lap = lapSelect.value;
  try {
    const res = await fetch(`/api/gcs/load_telemetry?gp=${gp}&session=${session}&driver=${driver}&lap=${lap}`);
    telemetryData = await res.json();
    renderCharts();
  } catch (err) {
    console.error("Erro ao carregar telemetria:", err);
  }
});

function renderCharts() {
  renderChart("speedChart", "Velocidade (km/h)", telemetryData.speed);
  renderChart("throttleBrakeChart", "Throttle / Brake", telemetryData.throttleBrake);
  renderChart("rpmGearChart", "RPM / Gear", telemetryData.rpmGear);
  renderChart("ersDrsChart", "ERS / DRS", telemetryData.ersDrs);
}

function renderChart(canvasId, label, dataset) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: dataset.x,
      datasets: dataset.y.map(trace => ({
        label: trace.label,
        data: trace.data,
        borderWidth: 2,
        fill: false
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top" },
        title: { display: true, text: label }
      },
      scales: {
        x: { title: { display: true, text: "Distância (m)" } },
        y: { title: { display: true, text: label } }
      }
    }
  });
}

function formatTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

gpSelect.addEventListener("change", loadSessionInfo);
sessionSelect.addEventListener("change", loadSessionInfo);
driverSelect.addEventListener("change", loadLaps);

listGPs();
