const database = firebase.database();

// --- SESSION INFO ---
function fetchSessionInfo() {
  firebase.database().ref("/session_info").once("value").then(snapshot => {
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

    console.log("Dados recebidos de /session_details:", data);
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
    console.log("Penalidades recebidas:", data);

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
      const item = document.createElement("li");
      item.textContent = `#${p.driver_number} - ${p.penalty_type ?? "Penalidade"} (${p.description ?? "Sem descrição"})`;
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

    // Resumo principal
    if (typeof data.summary === "string") {
      const item = document.createElement("li");
      item.textContent = data.summary;
      summaryList.appendChild(item);
    }

    // Lista de eventos
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
  database.ref("/team_radio").once("value").then(snapshot => {
    const data = snapshot.val();
    const list = document.getElementById("radio-list");
    list.innerHTML = "";

    if (!data || data.length === 0) return;

    data.forEach(r => {
      if (!r.recording_url) return;

      const item = document.createElement("li");
      item.innerHTML = `
        <b>#${r.driver_number}</b> - ${r.message || "Sem transcrição"}
        <br/>
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

// --- Atualização periódica ---
setInterval(fetchSessionInfo, 30000);
setInterval(fetchSessionDetails, 30000);
setInterval(fetchPenalties, 15000);
setInterval(fetchRaceSummary, 15000);
setInterval(fetchTeamRadio, 15000);
setInterval(renderExtras, 10000);

// --- Inicial ---
renderExtras();
fetchSessionInfo();
fetchSessionDetails();
fetchPenalties();
fetchRaceSummary();
fetchTeamRadio();
