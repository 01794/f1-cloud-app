document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("track-canvas");
  const ctx = canvas.getContext("2d");

  let trackData = [];
  let positions = [];

  function drawTrack() {
    if (!ctx || !trackData.length) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desenhar o traçado
    ctx.beginPath();
    trackData.forEach((point, index) => {
      const x = (point.x / 100) * canvas.width;
      const y = (point.y / 100) * canvas.height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Desenhar os carros
    positions.forEach((car) => {
      const x = (car.x / 100) * canvas.width;
      const y = (car.y / 100) * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = "red";
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "12px Arial";
      ctx.fillText(car.driver_number, x - 5, y - 8);
    });
  }

  async function fetchTrackData() {
    const res = await fetch("/api/track_map");
    const data = await res.json();
    if (!data.error) trackData = data;
  }

  async function fetchPositions() {
    const res = await fetch("/api/live_positions");
    const data = await res.json();
    if (!data.error) positions = data;
  }

  async function refresh() {
    await fetchPositions();
    drawTrack();
  }

  // Inicialização
    fetchTrackData().then(() => {
        refresh();
        setInterval(refresh, 5000);
    });
});
