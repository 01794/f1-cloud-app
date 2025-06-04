document.addEventListener("DOMContentLoaded", async () => {
  const yearSelect = document.getElementById("yearSelect");
  const roundSelect = document.getElementById("roundSelect");
  const sessionSelect = document.getElementById("sessionSelect");
  const loadSessionBtn = document.getElementById("loadSessionBtn");
  const driverSelect = document.getElementById("driverSelect");
  const loadTelemetryBtn = document.getElementById("loadTelemetryBtn");
  const lapSelect = document.getElementById("lapSelect");
  const showLapBtn = document.getElementById("showLapBtn");

  loadTelemetryBtn.disabled = true;
  showLapBtn.disabled = true;

  const updateRounds = async (year) => {
    roundSelect.innerHTML = "";
    try {
      const res = await fetch(`/api/gcs/list_rounds?year=${year}`);
      const rounds = await res.json();
      rounds.forEach((roundStr) => {
        const option = document.createElement("option");
        option.value = roundStr.split(" - ")[0];
        option.textContent = roundStr;
        roundSelect.appendChild(option);
      });
    } catch (e) {
      console.error("Erro ao carregar rounds:", e);
    }
  };

  yearSelect.addEventListener("change", () => {
    const year = yearSelect.value;
    updateRounds(year);
  });

  updateRounds(yearSelect.value);

  if (loadSessionBtn) {
    loadSessionBtn.addEventListener("click", async () => {
      const year = yearSelect.value;
      const round = roundSelect.value;
      const session = sessionSelect.value;

      console.log("Carregar info da sessão:", { year, round, session });

      try {
        const res = await fetch(
          `/api/gcs/upload_session_info?year=${year}&round=${round}&session=${session}`
        );
        const data = await res.json();
        console.log("Resultado do upload:", data);

        if (data.error) {
          alert("Erro ao carregar dados: " + data.error);
          return;
        }

        // Mostrar info sessão
        if (data.session_data) {
          const infoDiv = document.getElementById("sessionInfo");
          infoDiv.innerText = `Sessão: ${data.session_data.session_name} | Local: ${data.session_data.location} (${data.session_data.country}) | Início: ${new Date(data.session_data.start_time).toLocaleString()}`;
        }

        // Tabela de pilotos
        if (data.drivers && Array.isArray(data.drivers)) {
          const tableBody = document.getElementById("driversTableBody");
          tableBody.innerHTML = "";

          const pilotSelect = document.getElementById("driverSelect");
          pilotSelect.innerHTML = '<option disabled selected>-- Seleciona --</option>';

          data.drivers.forEach(driver => {
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${driver.DriverNumber}</td>
              <td>${driver.FullName}</td>
              <td>${driver.TeamName}</td>
              <td>${driver.Position}</td>
              <td>${driver.Status}</td>
              <td>${driver.Time}</td>
            `;
            tableBody.appendChild(row);

            const opt = document.createElement("option");
            opt.value = driver.DriverNumber;
            opt.text = `${driver.DriverNumber} - ${driver.FullName}`;
            pilotSelect.appendChild(opt);
          });

          loadTelemetryBtn.disabled = true;
          showLapBtn.disabled = true;
        }

        alert("Info da sessão carregada com sucesso!");

      } catch (e) {
        console.error("Erro ao enviar info da sessão:", e);
        alert("Erro ao enviar info da sessão.");
      }
    });
  }

  if (driverSelect) {
    driverSelect.addEventListener("change", () => {
      loadTelemetryBtn.disabled = false;
    });
  }

  if (loadTelemetryBtn) {
    loadTelemetryBtn.addEventListener("click", async () => {
      const year = yearSelect.value;
      const round = roundSelect.value;
      const session = sessionSelect.value;
      const driver = driverSelect.value;

      if (!driver) {
        alert("Seleciona um piloto válido antes de carregar telemetria.");
        return;
      }

      try {
        const res = await fetch(
          `/api/gcs/upload_telemetry?year=${year}&round=${round}&session=${session}&driver=${driver}`
        );
        const data = await res.json();
        console.log("Resultado do upload de telemetria:", data);

        if (data.laps && Array.isArray(data.laps)) {
          lapSelect.innerHTML = '<option disabled selected>-- Escolhe uma volta --</option>';
          data.laps.forEach(lap => {
            const opt = document.createElement("option");
            opt.value = lap.lap_number;
            opt.textContent = `Volta ${lap.lap_number} - ${lap.lap_time}`;
            lapSelect.appendChild(opt);
          });

          showLapBtn.disabled = false;
        } else {
          alert("Sem voltas disponíveis para esse piloto.");
        }

        alert("Telemetria enviada com sucesso!");

      } catch (e) {
        console.error("Erro ao enviar telemetria:", e);
        alert("Erro ao enviar telemetria.");
      }
    });
  }

  if (showLapBtn) {
    showLapBtn.addEventListener("click", async () => {
      const year = yearSelect.value;
      const round = roundSelect.value;
      const session = sessionSelect.value;
      const driver = driverSelect.value;
      const lap = lapSelect.value;

      if (!driver || !lap) {
        alert("Seleciona piloto e volta para mostrar telemetria.");
        return;
      }

      try {
        const res = await fetch(`/api/gcs/get_lap_telemetry?year=${year}&round=${round}&session=${session}&driver=${driver}&lap=${lap}`);
        const data = await res.json();

        if (data.error) {
          alert("Erro ao obter telemetria: " + data.error);
          return;
        }

        const time = data.Time;

        // Velocidade
        Plotly.newPlot("speedChart", [{
          x: time, y: data.Speed, mode: 'lines', name: 'Velocidade'
        }], { title: "Velocidade (km/h)", xaxis: { title: "Tempo (s)" }, yaxis: { title: "Velocidade" } });

        // Throttle e Brake
        Plotly.newPlot("throttleBrakeChart", [
          { x: time, y: data.Throttle, mode: 'lines', name: 'Throttle (%)' },
          { x: time, y: data.Brake.map(v => v * 100), mode: 'lines', name: 'Brake (%)' }
        ], {
          title: "Throttle & Brake",
          xaxis: { title: "Tempo (s)" },
          yaxis: { title: "%" }
        });

        // RPM e Marcha
        Plotly.newPlot("rpmGearChart", [
          { x: time, y: data.RPM, mode: 'lines', name: 'RPM', yaxis: 'y1' },
          { x: time, y: data.Gear, mode: 'lines', name: 'Marcha', yaxis: 'y2' }
        ], {
          title: "RPM & Mudança",
          xaxis: { title: "Tempo (s)" },
          yaxis: { title: "RPM", side: 'left' },
          yaxis2: { title: "Mudanças", overlaying: 'y', side: 'right' }
        });

        // DRS
        Plotly.newPlot("drsChart", [{
          x: time, y: data.DRS, mode: 'markers', name: 'DRS'
        }], {
          title: "DRS Ativado",
          xaxis: { title: "Tempo (s)" },
          yaxis: {
            title: "DRS",
            tickvals: [0, 1],
            ticktext: ["Desativado", "Ativado"]
          }
        });

        document.getElementById("lapSummary").innerText = `Volta ${lap} de ${driver} carregada com sucesso.`;

      } catch (e) {
        console.error("Erro ao buscar telemetria:", e);
        alert("Erro ao buscar telemetria.");
      }
    });
  }

});