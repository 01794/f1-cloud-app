function startTelemetryListener() {
  const telemetryRef = firebase.database().ref("/live_telemetry");

  telemetryRef.on("value", (snapshot) => {
    const data = snapshot.val();
    updateTelemetryTable(data);
  }, (error) => {
    console.error("Erro ao escutar dados de telemetria:", error);
  });
}

function updateTelemetryTable(data) {
  const tbody = document.getElementById("telemetry-body");
  tbody.innerHTML = "";

  if (!data || typeof data !== "object") return;

  const pilotos = Object.values(data)
    .filter(p => p && p.driver_number)
    .sort((a, b) => (a.position || 99) - (b.position || 99));

  for (const piloto of pilotos) {
    console.log("Renderizando piloto:", piloto);  // 👈 debug
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${piloto.in_pit ? "PIT" : ""}</td>
      <td>${piloto.position ?? ""}</td>
      <td>${piloto.driver_number ?? ""}</td>
      <td>${piloto.driver_name ?? ""}</td>
      <td>${piloto.tyre ?? ""}</td>
      <td>${piloto.interval_to_car_ahead ?? ""}</td>
      <td>${formatTime(piloto.last_lap_time)}</td>
      <td>${formatTime(piloto.sector_1)}</td>
      <td>${formatTime(piloto.sector_2)}</td>
      <td>${formatTime(piloto.sector_3)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function formatTime(value) {
  if (!value || isNaN(value)) return "";
  const time = parseFloat(value);
  const minutes = Math.floor(time / 60);
  const seconds = (time % 60).toFixed(3).padStart(6, "0");
  return minutes ? `${minutes}:${seconds}` : seconds;
}

window.onload = startTelemetryListener;

firebase.database().ref("/live_telemetry").once("value").then(snapshot => {
  console.log("Firebase conectado, dados de /live_telemetry:", snapshot.val());
}).catch(error => {
  console.error("Erro ao conectar Firebase:", error);
});