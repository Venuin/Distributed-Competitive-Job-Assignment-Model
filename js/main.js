// js/main.js
import { SimulationSystem } from "./simulation.js";
import { CONFIG } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const infoPanelIds = {
    time: "timeDisplay",
    jobsCreated: "jobsCreatedDisplay",
    maxJobs: "maxJobsDisplay",
    jobsCompleted: "jobsCompletedDisplay",
    totalEarnings: "totalEarningsDisplay",
  };

  const numWorkersSlider = document.getElementById("numWorkersSlider");
  const numWorkersValueSpan = document.getElementById("numWorkersValue");
  const maxJobsSlider = document.getElementById("maxJobsSlider");
  const maxJobsValueSpan = document.getElementById("maxJobsValue");

  numWorkersSlider.value = CONFIG.NUM_WORKERS;
  numWorkersValueSpan.textContent = CONFIG.NUM_WORKERS;
  maxJobsSlider.value = CONFIG.MAX_JOBS;
  maxJobsValueSpan.textContent = CONFIG.MAX_JOBS;

  // İşçi sayısı kaydırma çubuğu için
  numWorkersSlider.addEventListener("input", () => {
    numWorkersValueSpan.textContent = numWorkersSlider.value;
  });

  // Maksimum iş sayısı kaydırma çubuğu için
  maxJobsSlider.addEventListener("input", () => {
    maxJobsValueSpan.textContent = maxJobsSlider.value;
  });

  const sim = new SimulationSystem(
    "simulationCanvas",
    "earningsChartCanvas",
    infoPanelIds
  );

  document
    .getElementById("startButton")
    .addEventListener("click", () => sim.start());
  document
    .getElementById("pauseButton")
    .addEventListener("click", () => sim.pause());

  document.getElementById("resetButton").addEventListener("click", () => {
    sim.pause();

    const currentNumWorkers = parseInt(numWorkersSlider.value);
    const currentMaxJobs = parseInt(maxJobsSlider.value);

    sim.reset(currentNumWorkers, currentMaxJobs);
  });

  // Sayfa ilk yüklendiğinde simülasyonu varsayılan (veya slider'daki başlangıç) değerlerle başlat
  const initialNumWorkers = parseInt(numWorkersSlider.value);
  const initialMaxJobs = parseInt(maxJobsSlider.value);
  sim.reset(initialNumWorkers, initialMaxJobs);
});
