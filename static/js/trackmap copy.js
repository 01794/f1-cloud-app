let trackBounds = null;
let trackDrawn = false;

function fetchCarLocations() {
  const now = new Date();
  const before = new Date(now.getTime() - 2000);
  const formatISO = d => d.toISOString();

  const url = `https://api.openf1.org/v1/location?session_key=latest&date>=${formatISO(before)}&date<=${formatISO(now)}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (!data || !Array.isArray(data.x)) {
        console.error("Dados inválidos da track_map:", data);
        return;
      }

      const svg = document.getElementById('track-map');
      if (!svg) {
        console.warn("Elemento SVG 'track-map' não encontrado.");
        return;
      }

      svg.innerHTML = ''; // Limpa antes de desenhar
      if (!trackDrawn) {
        drawTrack().then(() => plotCars(data));
      } else {
        plotCars(data);
      }
    })
    .catch(err => console.error("Erro ao carregar localização dos carros:", err));
}

function drawTrack() {
  return fetch('/api/track_map')
    .then(res => res.json())
    .then(data => {
      console.log("Resposta bruta do /api/track_map:", data);

      if (!Array.isArray(data)) {
        console.error("Resposta não é um array:", data);
        return;
      }

      if (data.length === 0) {
        console.warn("O array de pontos está vazio:", data);
        return;
      }

      const svg = document.getElementById('track-map');
      if (!svg) {
        console.warn("SVG com id 'track-map' não encontrado.");
        return;
      }

      const xs = data.map(p => p.x);
      const ys = data.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      trackBounds = { minX, maxX, minY, maxY };

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = data.map((p, i) => {
        const [x, y] = normalizeCoordinates(p.x, p.y);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');

      path.setAttribute("d", d);
      path.setAttribute("stroke", "#888");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", "4");
      svg.appendChild(path);

      trackDrawn = true;
    })
    .catch(err => console.error("Erro ao desenhar o traçado:", err));
}



function plotCars(data) {
  const svg = document.getElementById('track-map');
  const latestByDriver = {};

  data.forEach(car => {
    if (!car.x || !car.y) return;

    const num = car.driver_number;
    if (!latestByDriver[num] || new Date(car.date) > new Date(latestByDriver[num].date)) {
      latestByDriver[num] = car;
    }
  });

  Object.values(latestByDriver).forEach(car => {
    const [cx, cy] = normalizeCoordinates(car.x, car.y);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 18);
    circle.setAttribute("fill", "red");
    circle.setAttribute("stroke", "#fff");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", cy - 25);
    label.setAttribute("fill", "#fff");
    label.setAttribute("font-size", "20");
    label.setAttribute("text-anchor", "middle");
    label.textContent = car.driver_number;

    svg.appendChild(circle);
    svg.appendChild(label);
  });
}

function normalizeCoordinates(x, y) {
  if (!trackBounds) return [x, y];
  const { minX, maxX, minY, maxY } = trackBounds;
  const svgWidth = 4000, svgHeight = 4000;

  const scaleX = svgWidth / (maxX - minX);
  const scaleY = svgHeight / (maxY - minY);
  const scale = Math.min(scaleX, scaleY) * 0.95;

  const nx = (x - minX) * scale + 100;
  const ny = (y - minY) * scale + 100;
  return [nx, ny];
}

// Inicia o carregamento
setTimeout(() => {
  fetchCarLocations();
  setInterval(fetchCarLocations, 5000);
}, 5000);
