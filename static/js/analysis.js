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
        await loadLapConsistencyChart(year, round, session, driver);
        await loadTyreStintsChart(year, round, session, driver);


      } catch (e) {
        console.error("Erro ao enviar telemetria:", e);
        alert("Erro ao enviar telemetria.");
      }

      try {
        const stintsRes = await fetch(`/api/gcs/tyre_stints?year=${year}&round=${round}&session=${session}&driver=${driver}`);
        const stintsData = await stintsRes.json();

        if (stintsData.stints && stintsData.stints.length > 0) {
        } else {
          console.warn("Sem dados suficientes para gráfico de stints.");
        }
      } catch (error) {
        console.error("Erro ao carregar gráfico de stints:", error);
      }

      try {
        const consistencyRes = await fetch(`/api/gcs/lap_consistency?year=${year}&round=${round}&session=${session}&driver=${driver}`);
        const consistencyData = await consistencyRes.json();

        if (consistencyData.laps && consistencyData.laps.length > 0) {
        } else {
          console.warn("Sem dados suficientes para gráfico de consistência.");
        }
      } catch (error) {
        console.error("Erro ao carregar gráfico de consistência:", error);
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

        // RPM e Mudança
        Plotly.newPlot("rpmGearChart", [
          { x: time, y: data.RPM, mode: 'lines', name: 'RPM', yaxis: 'y1' },
          { x: time, y: data.Gear, mode: 'lines', name: 'Mudança', yaxis: 'y2' }
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

        // Mapa de Velocidade na Pista
        Plotly.newPlot("trackMapChart", [{
          x: data.X,
          y: data.Y,
          mode: "markers",
          marker: {
            color: data.Speed,
            colorscale: "Jet",
            colorbar: { title: "Velocidade (km/h)" },
            size: 4
          },
          type: "scatter"
        }], {
          title: "Mapa de Velocidade na Pista",
          xaxis: { title: "X (metros)" },
          yaxis: { title: "Y (metros)", scaleanchor: "x", scaleratio: 1 }
        });

        // Histograma da Velocidade
        Plotly.newPlot("speedHistogram", [{
          x: data.Speed,
          type: "histogram",
          marker: { color: "blue" },
        }], {
          title: "Distribuição da Velocidade",
          xaxis: { title: "Velocidade (km/h)" },
          yaxis: { title: "Frequência" },
          bargap: 0.05
        });

        // Gráfico de Consistência de Voltas
        if (data.lapTimes && Array.isArray(data.lapTimes)) {
          const laps = data.lapTimes.map(l => l.lap_number);
          const timesInSec = data.lapTimes.map(l => {
            const parts = l.lap_time.split(":").map(parseFloat);
            return parts.length === 2 ? parts[0] * 60 + parts[1] : parseFloat(l.lap_time);
          });

          Plotly.newPlot("lapConsistencyChart", [{
            x: laps,
            y: timesInSec,
            mode: 'lines+markers',
            name: 'Tempo por Volta',
            line: { color: 'orange' }
          }], {
            title: "Consistência de Voltas",
            xaxis: { title: "Volta" },
            yaxis: { title: "Tempo (s)" }
          });
        }

        // Gráfico de Stints de Pneus
        if (data.tyreStints && Array.isArray(data.tyreStints)) {
          const stintLabels = data.tyreStints.map((s, i) => `Stint ${i + 1}`);
          const durations = data.tyreStints.map(s => s.total_laps);
          const compounds = data.tyreStints.map(s => s.compound);

          Plotly.newPlot("tyreStintsChart", [{
            x: stintLabels,
            y: durations,
            type: 'bar',
            text: compounds,
            marker: {
              color: compounds.map(c => {
                if (c.includes("SOFT")) return "red";
                if (c.includes("MEDIUM")) return "yellow";
                if (c.includes("HARD")) return "white";
                return "gray";
              }),
            }
          }], {
            title: "Atuação de Pneus (Stints)",
            xaxis: { title: "Stint" },
            yaxis: { title: "Voltas" }
          });
        }

        // Gerar mapa de pista com aceleração/travagem
        try {
          const mapRes = await fetch(`/api/gcs/generate_trackmap?year=${year}&round=${round}&session=${session}&driver=${driver}&lap=${lap}`);
          const mapData = await mapRes.json();

          if (mapData.status === "success") {
            const mapDiv = document.getElementById("trackMapChart");
            mapDiv.innerHTML = `<iframe src="https://storage.googleapis.com/f1-cloud-lvtl-cache/${mapData.object}" 
                            width="100%" height="600px" frameborder="0"></iframe>`;
          } else {
            console.warn("Erro ao gerar mapa:", mapData.error);
            document.getElementById("trackMapChart").innerHTML = `<p style="color:red;">Erro ao gerar mapa: ${mapData.error}</p>`;
          }
        } catch (err) {
          console.error("Falha ao carregar mapa:", err);
          document.getElementById("trackMapChart").innerHTML = `<p style="color:red;">Erro ao carregar mapa de pista.</p>`;
        }


        document.getElementById("lapSummary").innerText = `Volta ${lap} de ${driver} carregada com sucesso.`;

      } catch (e) {
        console.error("Erro ao buscar telemetria:", e);
        alert("Erro ao buscar telemetria.");
      }

      try {
        const response = await fetch(`/api/gcs/tyre_stints?year=${year}&round=${round}&session=${session}&driver=${driver}`);
        const tyreData = await response.json();

        if (!tyreData.laps || !tyreData.tyre_stints) {
          console.warn("Dados de laps ou tyre_stints ausentes.");
          return;
        }

        // Gráfico de consistência de voltas
        const lapNumbers = tyreData.laps.map(lap => lap.LapNumber);
        const lapTimes = tyreData.laps.map(lap => parseFloat(lap.LapTimeSeconds).toFixed(3));

        Plotly.newPlot("lapConsistencyChart", [{
          x: lapNumbers,
          y: lapTimes,
          mode: "lines+markers",
          name: "Lap Times",
          line: { shape: 'linear' }
        }], {
          title: "Consistência de Voltas",
          xaxis: { title: "Volta" },
          yaxis: { title: "Tempo (s)" },
          template: "plotly_dark"
        });

        // Gráfico de stints por composto
        const stintLabels = tyreData.tyre_stints.map(stint => `Stint ${stint.Stint}`);
        const stintLaps = tyreData.tyre_stints.map(stint => stint.LapNumber);
        const stintColors = tyreData.tyre_stints.map(stint => stint.Compound);

        Plotly.newPlot("tyreStintsChart", [{
          x: stintLabels,
          y: stintLaps,
          type: 'bar',
          marker: { color: stintColors }
        }], {
          title: "Stints por Composto de Pneu",
          xaxis: { title: "Stint" },
          yaxis: { title: "Nº de Voltas" },
          template: "plotly_dark"
        });

      } catch (err) {
        console.error("Erro ao carregar gráficos de stints/consistência:", err);
      }
    })
  };


  async function loadLapConsistencyChart(year, round, session, driver) {
    try {
      const response = await fetch(`/api/gcs/lap_consistency?year=${year}&round=${round}&session=${session}&driver=${driver}`);
      const data = await response.json();

      console.log("Dados recebidos para consistência:", data);

      if (!Array.isArray(data) || data.length === 0) {
        console.warn("Sem dados suficientes para gráfico de consistência.");
        return;
      }

      const laps = data.map(d => d.lap);
      const times = data.map(d => d.lap_time);

      Plotly.newPlot("lapConsistencyChart", [{
        x: laps,
        y: times,
        type: 'scatter',
        mode: 'lines+markers',
        marker: { color: 'orange' },
        name: 'Tempo por Volta'
      }], {
        title: "Consistência de Voltas",
        xaxis: { title: "Volta" },
        yaxis: { title: "Tempo (s)" }
      });
    } catch (err) {
      console.error("Erro ao carregar gráfico de consistência:", err);
    }
  }

  async function loadTyreStintsChart(year, round, session, driver) {
    try {
      const response = await fetch(`/api/gcs/tyre_stints?year=${year}&round=${round}&session=${session}&driver=${driver}`);
      const json = await response.json();

      console.log("Dados recebidos para tyre stints:", json);

      if (!json.stints || json.stints.length === 0) {
        console.warn("Sem dados suficientes para gráfico de stints.");
        return;
      }

      const colors = {
        SOFT: 'red',
        MEDIUM: 'yellow',
        HARD: 'white',
        INTERMEDIATE: 'green',
        WET: 'blue'
      };

      const stints = json.stints.map((s, i) => {
        const duration = s.endLap - s.startLap + 1;
        return {
          x: [s.startLap],
          y: [`Stint ${i + 1}`],
          width: [duration],
          name: `${s.compound}`,
          marker: {
            color: colors[s.compound?.toUpperCase()] || 'gray',
            line: { width: 1, color: 'black' }
          },
          type: 'bar',
          orientation: 'h',
          hovertemplate: `Composto: ${s.compound}<br>Início: ${s.startLap}<br>Fim: ${s.endLap}<br>Duração: ${duration} voltas<extra></extra>`
        };
      });

      Plotly.newPlot("tyreStintsChart", stints, {
        title: "Stints de Pneus",
        barmode: 'stack',
        xaxis: { title: "Voltas" },
        yaxis: { title: "Stints" },
        margin: { l: 120 },
      });
    } catch (err) {
      console.error("Erro ao carregar gráfico de stints:", err);
    }
  }



});