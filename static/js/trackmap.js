function fetchCarLocations() {
  fetch('https://api.openf1.org/v1/location?session_key=latest')
    .then(response => response.json())
    .then(data => {
      const svg = document.getElementById('track-map');
      svg.innerHTML = '';

      const latestByDriver = {};

      data.forEach(entry => {
        const num = entry.driver_number;
        if (!latestByDriver[num] || new Date(entry.date) > new Date(latestByDriver[num].date)) {
          latestByDriver[num] = entry;
        }
      });

      Object.values(latestByDriver).forEach(car => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", car.x);
        circle.setAttribute("cy", car.y);
        circle.setAttribute("r", 20);
        circle.setAttribute("fill", "#" + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, '0'));
        circle.setAttribute("stroke", "#fff");
        circle.setAttribute("stroke-width", 2);
        circle.setAttribute("opacity", 0.85);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", car.x);
        label.setAttribute("y", car.y - 25);
        label.setAttribute("fill", "#fff");
        label.setAttribute("font-size", "30");
        label.setAttribute("text-anchor", "middle");
        label.textContent = car.driver_number;

        svg.appendChild(circle);
        svg.appendChild(label);
      });
    })
    .catch(err => console.error("Erro ao carregar mapa:", err));
}

setInterval(fetchCarLocations, 2000);
fetchCarLocations();
