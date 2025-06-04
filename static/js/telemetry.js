firebase.database().ref('/live_telemetry').on('value', snapshot => {
  const data = snapshot.val();
  console.log("Firebase conectado, dados de /live_telemetry:", data);
  updateTelemetryTable(data || []);
});

function updateTelemetryTable(data) {
  const tbody = document.getElementById("telemetry-body");
  tbody.innerHTML = "";

  const pilotos = Object.values(data)
    .filter(p => p && p.driver_number)
    .sort((a, b) => (a.position || 99) - (b.position || 99));

  for (const piloto of pilotos) {
    const tr = document.createElement("tr");

    const fields = [
      piloto.in_pit ? "🛠" : "",
      piloto.position ?? "",
      piloto.driver_number ?? "",
      piloto.driver_name ?? "",
      piloto.tyre ?? "",
      piloto.interval_to_car_ahead ?? "",
      piloto.last_lap_time ?? "",
      piloto.sector_1 ?? "",
      piloto.sector_2 ?? "",
      piloto.sector_3 ?? ""
    ];

    const keys = [
      "in_pit", "position", "driver_number", "driver_name", "tyre",
      "interval_to_car_ahead", "last_lap_time", "sector_1", "sector_2", "sector_3"
    ];

    fields.forEach((value, i) => {
      const key = keys[i];
      const td = document.createElement("td");
      td.textContent = value;
      td.classList.add("telemetry-cell");

      // Cor de pneus
      if (key === "tyre") {
        if (value === "SOFT") td.style.color = "red";
        else if (value === "MEDIUM") td.style.color = "orange";
        else if (value === "HARD") td.style.color = "white";
        else td.style.color = "gray";
      }

      // Destaques de setores
      if (["sector_1", "sector_2", "sector_3"].includes(key)) {
        const floatVal = parseFloat(value);
        if (!isNaN(floatVal)) {
          if (floatVal < 30) td.style.backgroundColor = "#cfc"; // verde claro (bom)
          else if (floatVal > 40) td.style.backgroundColor = "#fbb"; // vermelho claro (ruim)
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }
}
