// dashboard_extras.js completo com proteção de refresh durante interações (rádios e inputs)

const database = firebase.database();

let driverMap = {};

// --- MAPEIA NOMES DOS PILOTOS ---
function updateDriverMap() {
  return database.ref("/live_telemetry").once("value").then(snapshot => {
    const data = snapshot.val() || [];
    driverMap = {};
    for (const d of data) {
      if (d.driver_number !== undefined && d.driver_name) {
        driverMap[d.driver_number] = d.driver_name;
      }
    }
  });
}

// --- SESSION INFO ---
function fetchSessionInfo() {
  database.ref("/session_info").once("value").then(snapshot => {
    const data = snapshot.val();
    const infoDiv = document.getElementById("session-info");

    if (!data) {
      infoDiv.textContent = "Informações da sessão indisponíveis.";
      return;
    }

    const sessionName = data.session_name ?? "Sessão";
    const meetingName = data.meeting_name ?? "Evento";
    const location = data.location ?? "Local desconhecido";
    const country = data.country ?? "País desconhecido";
    const startTime = data.start_time ? new Date(data.start_time).toLocaleString() : "Início indefinido";

    infoDiv.innerHTML = `
      <b>${sessionName}</b> - ${meetingName}<br/>
      ${location}, ${country}<br/>
      Início: ${startTime}
    `;
  }).catch(err => {
    console.error("Erro ao carregar session_info:", err);
  });
}

function fetchSessionDetails() {
  database.ref("/session_details").once("value").then(snapshot => {
    const data = snapshot.val();
    const detailsDiv = document.getElementById("session-details");

    if (!data) {
      detailsDiv.textContent = "Detalhes da sessão indisponíveis.";
      return;
    }

    const clima = data.weather ?? "N/A";
    const ar = data.air_temp !== undefined ? `${data.air_temp}°C` : "N/A";
    const pista = data.track_temp !== undefined ? `${data.track_temp}°C` : "N/A";
    const vento = data.wind_speed !== undefined ? `${data.wind_speed} km/h` : "N/A";
    const volta = data.current_lap ?? "N/D";

    detailsDiv.textContent = `Clima: ${clima} • T.A.: ${ar} • Pista: ${pista} • Vento: ${vento} • Volta atual: ${volta}`;
  }).catch(err => {
    console.error("Erro ao carregar session_details:", err);
  });
}

// --- PENALIDADES ---
function fetchPenalties() {
  database.ref("/penalties").once("value").then(snapshot => {
    const data = snapshot.val();
    const list = document.getElementById("penalty-list");
    list.innerHTML = "";

    if (!data) {
      list.innerHTML = "<li>Sem penalidades registradas.</li>";
      return;
    }

    const penalties = Array.isArray(data) ? data : Object.values(data);
    if (penalties.length === 0) {
      list.innerHTML = "<li>Sem penalidades registradas.</li>";
      return;
    }

    penalties.forEach(p => {
      const driverNum = p.driver_number;
      const driverName = driverNum !== undefined ? (driverMap[driverNum] || `#${driverNum}`) : null;
      const description = p.description ?? "Sem descrição";

      const item = document.createElement("li");
      item.textContent = driverName ? `${driverName} - ${description}` : `${description}`;
      list.appendChild(item);
    });
  }).catch(err => {
    console.error("Erro ao carregar penalidades:", err);
  });
}

// --- RESUMO DA CORRIDA ---
function fetchRaceSummary() {
  database.ref("/race_summary").once("value").then(snapshot => {
    const data = snapshot.val();
    const summaryList = document.getElementById("summary-list");
    const eventList = document.getElementById("event-list");
    summaryList.innerHTML = "";
    eventList.innerHTML = "";

    if (!data) return;

    if (typeof data.summary === "string") {
      const item = document.createElement("li");
      item.textContent = data.summary;
      summaryList.appendChild(item);
    }

    const events = Array.isArray(data.events) ? data.events : Object.values(data.events ?? {});
    events.forEach(e => {
      const item = document.createElement("li");
      item.textContent = e;
      eventList.appendChild(item);
    });
  }).catch(err => {
    console.error("Erro ao carregar race_summary:", err);
  });
}

// --- RÁDIOS ---
function fetchTeamRadio() {
  const isPlaying = Array.from(document.querySelectorAll("#radio-list audio")).some(a => !a.paused);
  if (isPlaying) {
    console.log("Rádio em reprodução — adiando refresh dos rádios.");
    return;
  }

  database.ref("/team_radio").once("value").then(snapshot => {
    const data = snapshot.val();
    const list = document.getElementById("radio-list");
    list.innerHTML = "";

    if (!data || data.length === 0) return;

    data.forEach(r => {
      if (!r.recording_url) return;
      const driverNum = r.driver_number ?? "?";
      const driverName = driverMap[driverNum] || `#${driverNum}`;
      const transcript = r.message && r.message.trim() !== "" ? r.message : "Sem transcrição";

      const item = document.createElement("li");
      item.innerHTML = `
        <b>#${driverNum} - ${driverName}</b><br/>
        ${transcript}<br/>
        <audio controls preload="none">
          <source src="${r.recording_url}" type="audio/mp3">
          Seu navegador não suporta áudio.
        </audio>
      `;
      list.appendChild(item);
    });
  }).catch(err => {
    console.error("Erro ao carregar rádios:", err);
  });
}

// --- Verifica se pode atualizar (evita durante interação) ---
function shouldRefresh() {
  const audioPlaying = Array.from(document.querySelectorAll("audio")).some(a => !a.paused);
  const focusedInput = document.querySelector("input:focus, textarea:focus, select:focus");
  return !(audioPlaying || focusedInput);
}

// --- Atualização periódica ---
function refreshAll() {
  if (!shouldRefresh()) {
    console.log("Interação detectada — refresh adiado.");
    return;
  }

  updateDriverMap().then(() => {
    fetchSessionInfo();
    fetchSessionDetails();
    fetchPenalties();
    fetchRaceSummary();
    fetchTeamRadio();
  });
}

setInterval(refreshAll, 15000);
document.addEventListener("DOMContentLoaded", refreshAll);