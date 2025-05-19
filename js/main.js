import { SimulationController } from "./SimulationController.js";
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

  const jobSpawnRateMultiplierSlider = document.getElementById(
    "jobSpawnRateMultiplierSlider"
  );
  const jobSpawnRateMultiplierValueSpan = document.getElementById(
    "jobSpawnRateMultiplierValue"
  );
  const jobTimeoutDurationSlider = document.getElementById(
    "jobTimeoutDurationSlider"
  );
  const jobTimeoutDurationValueSpan = document.getElementById(
    "jobTimeoutDurationValue"
  );
  const jobFixedDurationSlider = document.getElementById(
    "jobFixedDurationSlider"
  );
  const jobFixedDurationValueSpan = document.getElementById(
    "jobFixedDurationValue"
  );

  numWorkersSlider.value = CONFIG.NUM_WORKERS;
  numWorkersValueSpan.textContent = CONFIG.NUM_WORKERS;
  maxJobsSlider.value = CONFIG.MAX_JOBS;
  maxJobsValueSpan.textContent = CONFIG.MAX_JOBS;

  jobSpawnRateMultiplierSlider.value = CONFIG.JOB_SPAWN_RATE_MULTIPLIER;
  jobSpawnRateMultiplierValueSpan.textContent =
    CONFIG.JOB_SPAWN_RATE_MULTIPLIER.toFixed(1);
  jobTimeoutDurationSlider.value = CONFIG.JOB_TIMEOUT_DURATION;
  jobTimeoutDurationValueSpan.textContent =
    CONFIG.JOB_TIMEOUT_DURATION.toFixed(0);
  jobFixedDurationSlider.value = CONFIG.JOB_FIXED_DURATION;
  jobFixedDurationValueSpan.textContent = CONFIG.JOB_FIXED_DURATION.toFixed(0);

  numWorkersSlider.addEventListener("input", () => {
    numWorkersValueSpan.textContent = numWorkersSlider.value;
  });

  maxJobsSlider.addEventListener("input", () => {
    maxJobsValueSpan.textContent = maxJobsSlider.value;
  });

  jobSpawnRateMultiplierSlider.addEventListener("input", () => {
    jobSpawnRateMultiplierValueSpan.textContent = parseFloat(
      jobSpawnRateMultiplierSlider.value
    ).toFixed(1);
  });

  jobTimeoutDurationSlider.addEventListener("input", () => {
    jobTimeoutDurationValueSpan.textContent = parseInt(
      jobTimeoutDurationSlider.value,
      10
    ).toFixed(0);
  });

  jobFixedDurationSlider.addEventListener("input", () => {
    jobFixedDurationValueSpan.textContent = parseInt(
      jobFixedDurationSlider.value,
      10
    ).toFixed(0);
  });

  const simController = new SimulationController(
    "simulationCanvas",
    infoPanelIds
  );

  document
    .getElementById("startButton")
    .addEventListener("click", () => simController.start());
  document
    .getElementById("pauseButton")
    .addEventListener("click", () => simController.pause());

  document.getElementById("resetButton").addEventListener("click", () => {
    simController.pause();

    const currentNumWorkers = parseInt(numWorkersSlider.value, 10);
    const currentMaxJobs = parseInt(maxJobsSlider.value, 10);
    const currentJobSpawnRateMultiplier = parseFloat(
      jobSpawnRateMultiplierSlider.value
    );
    const currentJobTimeoutDuration = parseInt(
      jobTimeoutDurationSlider.value,
      10
    );
    const currentJobFixedDuration = parseInt(jobFixedDurationSlider.value, 10);

    CONFIG.NUM_WORKERS = currentNumWorkers;
    CONFIG.MAX_JOBS = currentMaxJobs;
    CONFIG.JOB_SPAWN_RATE_MULTIPLIER = currentJobSpawnRateMultiplier;
    CONFIG.JOB_TIMEOUT_DURATION = currentJobTimeoutDuration;
    CONFIG.JOB_FIXED_DURATION = currentJobFixedDuration;

    simController.reset(currentNumWorkers, currentMaxJobs);
  });

  const mabWorkerSelector = document.getElementById("mabWorkerSelector");
  if (mabWorkerSelector && simController.chartManager) {
    mabWorkerSelector.addEventListener("change", (event) => {
      const selectedWorkerId = event.target.value;
      if (
        selectedWorkerId !== "" &&
        selectedWorkerId !== null &&
        typeof simController.chartManager.setSelectedWorkerForMabChart ===
          "function"
      ) {
        simController.chartManager.setSelectedWorkerForMabChart(
          selectedWorkerId
        );
      }
    });
  } else {
    console.warn("MAB işçi seçici elementi veya ChartManager bulunamadı.");
  }

  simController.reset(CONFIG.NUM_WORKERS, CONFIG.MAX_JOBS);
});
