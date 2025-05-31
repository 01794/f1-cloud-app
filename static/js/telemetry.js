function fetchTelemetry() {
  const tbody = document.getElementById('telemetry-body');
  tbody.innerHTML = ''; // limpa antes de inserir

  firebase.database().ref("/live_telemetry").once("value")
    .then(snapshot => {
      const data = snapshot.val();

      if (!data || !Array.isArray(data)) return;

      data.forEach(d => {
        const row = document.createElement('tr');
        const pitStatus = d.in_pit ? '✅' : '';
        const tyreClass = {
          SOFT: 'red',
          MEDIUM: 'yellow',
          HARD: 'white'
        }[d.tyre?.toUpperCase()] || 'gray';

        row.innerHTML = `
          <td>${pitStatus}</td>
          <td>${d.position ?? '-'}</td>
          <td>${d.driver_number}</td>
          <td>${d.driver_name}</td>
          <td style="color: ${tyreClass}; font-weight: bold;">${d.tyre}</td>
          <td>${d.interval_to_car_ahead !== null && d.interval_to_car_ahead !== undefined ? '+' + d.interval_to_car_ahead.toFixed(3) + 's' : '-'}</td>
          <td>${d.last_lap_time ? Number(d.last_lap_time).toFixed(3) + 's' : '-'}</td>
          <td>${d.sector_1 !== undefined ? Number(d.sector_1).toFixed(3) + 's' : '-'}</td>
          <td>${d.sector_2 !== undefined ? Number(d.sector_2).toFixed(3) + 's' : '-'}</td>
          <td>${d.sector_3 !== undefined ? Number(d.sector_3).toFixed(3) + 's' : '-'}</td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => console.error("Erro ao carregar do Firebase:", err));
}

setInterval(fetchTelemetry, 2000);
fetchTelemetry();
