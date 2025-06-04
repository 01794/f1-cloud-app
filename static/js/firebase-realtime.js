import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDuvzb5NhT6XxKr_0yVENarOEgxVU59l_0",
  authDomain: "f1-cloud-lvtl.firebaseapp.com",
  databaseURL: "https://f1-cloud-lvtl-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "f1-cloud-lvtl",
  storageBucket: "f1-cloud-lvtl.firebasestorage.app",
  messagingSenderId: "615647908453",
  appId: "1:615647908453:web:05139e9ebe6c888041ac8c",
  measurementId: "G-TTZWXG7F61"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export function startRealtimeUpdates(callback, interval = 3000) {
  let updateInterval = null;
  const telemetryRef = ref(database, '/live_telemetry');

  const fetchData = () => {
    onValue(telemetryRef, snapshot => {
      callback(snapshot.val());
    }, { onlyOnce: true });
  };

  const toggleUpdates = () => {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
      return false;
    } else {
      fetchData();
      updateInterval = setInterval(fetchData, interval);
      return true;
    }
  };

  return { toggleUpdates };
}
