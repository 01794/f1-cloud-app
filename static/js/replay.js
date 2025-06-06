// Variáveis globais
let frames = [];
let currentFrame = 0;
let replayInterval;
let pathCoords = [];
let isPlaying = false;
let playbackSpeed = 1000;
let lapTimes = {};
let lapIndexMap = {};
let driverColors = {};
let lastDriverPositions = {};

// Gerar cor única para cada piloto
function getDriverColor(driverNumber) {
  if (driverColors[driverNumber]) return driverColors[driverNumber];
  const hue = (parseInt(driverNumber) * 137.5) % 360;
  const saturation = 80 + (driverNumber % 20);
  const lightness = 40 + (driverNumber % 10);
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  driverColors[driverNumber] = color;
  return color;
}

// Iniciar replay
function startReplay() {
  clearInterval(replayInterval);
  currentFrame = 0;
  isPlaying = false;
  driverColors = {};
  lastDriverPositions = {};

  const svg = document.getElementById('replay-map');
  svg.innerHTML = '';

  const year = document.getElementById('year').value;
  const round = document.getElementById('round').value;
  const session = document.getElementById('session').value;

  fetch(`/api/track_layout?year=${year}&round=${round}&session=${session}`)
    .then(res => res.json())
    .then(layout => {
      if (!Array.isArray(layout) || layout.length === 0) throw new Error("Traçado inválido");
      pathCoords = layout;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      path.setAttribute("points", layout.map(p => `${p.x},${p.y}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#555");
      path.setAttribute("stroke-width", "5");
      svg.appendChild(path);
      return Promise.all([
        fetch(`/api/replay_data?year=${year}&round=${round}&session=${session}`).then(r => r.json()),
        fetch(`/api/lap_times?year=${year}&round=${round}&session=${session}`).then(r => r.json())
      ]);
    })
    .then(([replayData, lapData]) => {
      frames = replayData.frames;
      lapIndexMap = replayData.lap_index_map || {};
      
      const lapSelect = document.getElementById("lap-select");
      lapSelect.innerHTML = "<option value=''>--</option>";
      
      const sortedLaps = Object.keys(lapIndexMap)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedLaps.forEach(lapNumber => {
          const option = document.createElement("option");
          option.value = lapNumber;
          option.textContent = `Volta ${lapNumber}`;
          lapSelect.appendChild(option);
      });

      updateViewBox();
      renderNextFrame();
      updateProgressUI();
    })
    .catch(err => {
      console.error("Erro ao carregar dados:", err);
      alert("Erro ao carregar dados da sessão.");
    });
}

// Play/Pause
function togglePlayPause() {
    const playButton = document.querySelector('.replay-controls button');
    const icon = playButton.querySelector('i');
    
    isPlaying = !isPlaying;
    
    if (isPlaying) {
      // Se estiver no último frame, voltar ao início
      if (currentFrame >= frames.length - 1) {
        currentFrame = 0;
      }
      replayInterval = setInterval(playNext, playbackSpeed);
      icon.className = 'fas fa-pause';
    } else {
      clearInterval(replayInterval);
      icon.className = 'fas fa-play';
    }
  }

// Avançar para próximo frame
function playNext() {
    // Verificar se chegou ao final
    if (currentFrame >= frames.length - 1) {
      clearInterval(replayInterval);
      isPlaying = false;
      const playButton = document.querySelector('.replay-controls button');
      const icon = playButton.querySelector('i');
      icon.className = 'fas fa-play';
      return;
    }
  
    currentFrame++;
    renderNextFrame();
    updateViewBox();
    updateProgressUI();
  }

// Navegar para frame específico
function seekFrame(value) {
  currentFrame = parseInt(value);
  renderNextFrame();
  updateViewBox();
  updateProgressUI();
}

// Atualizar velocidade
function updateSpeed() {
  playbackSpeed = parseInt(document.getElementById("speed-select").value);
  if (isPlaying) {
    clearInterval(replayInterval);
    replayInterval = setInterval(playNext, playbackSpeed);
  }
}

// Atualizar UI de progresso
function updateProgressUI() {
  const bar = document.getElementById("progress-bar");
  const label = document.getElementById("time-label");
  
  if (frames.length > 0) {
    bar.max = frames.length - 1;
    bar.value = currentFrame;
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    const currentSeconds = frames[currentFrame]?.time_sec || 0;
    const totalSeconds = frames[frames.length - 1]?.time_sec || 0;
    
    label.textContent = `${formatTime(currentSeconds)} / ${formatTime(totalSeconds)}`;
  } else {
    label.textContent = "0:00 / 0:00";
  }
}

// Atualizar viewBox do mapa
function updateViewBox() {
  const svg = document.getElementById('replay-map');
  const allPoints = [...pathCoords];
  
  if (frames.length > 0 && frames[currentFrame]?.positions) {
    frames[currentFrame].positions.forEach(car => {
      allPoints.push({x: car.x, y: car.y});
    });
  }
  
  const minX = Math.min(...allPoints.map(p => p.x));
  const maxX = Math.max(...allPoints.map(p => p.x));
  const minY = Math.min(...allPoints.map(p => p.y));
  const maxY = Math.max(...allPoints.map(p => p.y));
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  const margin = Math.max(width, height) * 0.1;
  
  svg.setAttribute("viewBox", 
    `${minX - margin} ${minY - margin} ${width + 2 * margin} ${height + 2 * margin}`);
}

// Saltar para volta específica
function jumpToLap() {
  const lapNumber = document.getElementById("lap-select").value;
  if (lapNumber && lapIndexMap[lapNumber] !== undefined) {
    currentFrame = lapIndexMap[lapNumber];
    
    renderNextFrame();
    updateViewBox();
    updateProgressUI();
    
    document.getElementById("progress-bar").value = currentFrame;
    
    if (isPlaying) {
      clearInterval(replayInterval);
      replayInterval = setInterval(playNext, playbackSpeed);
    }
  }
}


// Renderizar frame atual
function renderNextFrame() {
  const svg = document.getElementById('replay-map');
  const tooltip = document.getElementById('tooltip');
  
  // Remover carros anteriores (manter apenas a pista)
  while (svg.children.length > 1) {
    svg.removeChild(svg.lastChild);
  }

  const positions = frames[currentFrame]?.positions || [];
  positions.sort((a, b) => a.position - b.position);

  const tableBody = document.querySelector("#driver-table tbody");
  const currentRows = Array.from(tableBody.children);
  const newRows = [];
  const currentDriverPositions = {};

  positions.forEach(car => {
    currentDriverPositions[car.driver_number] = car.position;
    
    // Criar elemento SVG para o carro
    const carGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Círculo do carro com cor única
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", car.x);
    circle.setAttribute("cy", car.y);
    circle.setAttribute("r", 90);
    circle.setAttribute("fill", getDriverColor(car.driver_number));
    circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "2");
    
    // Label com número do piloto
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", car.x);
    label.setAttribute("y", car.y + 8);
    label.setAttribute("fill", "#fff");
    label.setAttribute("font-size", "40");
    label.setAttribute("font-weight", "bold");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.textContent = car.driver_number;
    
    carGroup.appendChild(circle);
    carGroup.appendChild(label);
    svg.appendChild(carGroup);

    // Criar linha na tabela
    let row = currentRows.find(r => 
      r.querySelector('td:nth-child(2)').textContent == car.driver_number
    );
    
    const isNewRow = !row;
    if (isNewRow) {
      row = document.createElement("tr");
    }
    
    // Determinar mudança de posição
    let positionChange = "same";
    if (lastDriverPositions[car.driver_number] !== undefined) {
      const lastPos = lastDriverPositions[car.driver_number];
      if (car.position < lastPos) positionChange = "up";
      else if (car.position > lastPos) positionChange = "down";
    }
    
    row.innerHTML = `
      <td>${car.position}º</td>
      <td>${car.driver_number}</td>
      <td>${car.driver_name}</td>`;
    
    // Aplicar classes para animações
    row.classList.remove("leader", "position-up", "position-down", "new-position");
    
    if (car.position === 1) {
      row.classList.add("leader");
    }
    
    if (positionChange === "up") {
      row.classList.add("position-up");
    } else if (positionChange === "down") {
      row.classList.add("position-down");
    }
    
    if (isNewRow) {
      row.classList.add("new-position");
    }
    
    newRows.push(row);

    // Tooltip
    carGroup.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.pageX + 15}px`;
      tooltip.style.top = `${e.pageY + 15}px`;
      tooltip.textContent = `${car.position}º - ${car.driver_name || 'Desconhecido'}`;
      tooltip.style.display = 'block';
    });

    carGroup.addEventListener('mouseout', () => tooltip.style.display = 'none');
  });
  
  // Atualizar tabela
  tableBody.innerHTML = "";
  newRows.forEach(row => tableBody.appendChild(row));
  
  // Salvar posições para próximo frame
  lastDriverPositions = {...currentDriverPositions};
}

// Inicialização quando a página carrega
// Inicialização quando a página carrega - Atualizado
document.addEventListener('DOMContentLoaded', () => {
    // Event listener para botão de play/pause
    document.querySelector('.replay-controls button').addEventListener('click', togglePlayPause);
    
    // Event listener para o botão "Visualizar Sessão"
    document.querySelector('.replay-header button').addEventListener('click', startReplay);
  });