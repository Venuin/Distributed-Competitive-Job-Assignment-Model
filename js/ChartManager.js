import { CONFIG } from "./config.js";

export class ChartManager {
  constructor(simulationController) {
    this.sim = simulationController;

    this.chartCanvas = document.getElementById("earningsChartCanvas");
    this.mabArmChartCanvas = document.getElementById("mabArmChartCanvas");
    this.mabAuctionStatsChartCanvas = document.getElementById(
      "mabAuctionStatsChartCanvas"
    );
    this.mabWorkerSelector = document.getElementById("mabWorkerSelector");
    this.infoPanelIds = this.sim.infoPanelIds;
    this.auctionLogPanel = document.getElementById("auctionLogPanel");

    this.earningsRadio = document.getElementById("earningsRadio");
    this.profitRadio = document.getElementById("profitRadio");

    this.mabQValueRadio = document.getElementById("mabQValueRadio");
    this.mabSelectionCountRadio = document.getElementById(
      "mabSelectionCountRadio"
    );

    this.earningsChart = null;
    this.mabArmChart = null;
    this.mabAuctionStatsChart = null;
    this.selectedWorkerForMabChart = null;
    this.currentEarningsChartType = "earnings";
    this.currentMabChartType = "q_value";

    // Elementlerin varlığını kontrol et
    if (!this.chartCanvas) {
      console.warn(
        `Kazanç grafiği canvas'ı ID "earningsChartCanvas" ile bulunamadı!`
      );
    }
    if (!this.mabArmChartCanvas) {
      console.warn(
        `MAB kolu grafik canvas'ı ID "mabArmChartCanvas" ile bulunamadı!`
      );
    }
    if (!this.mabAuctionStatsChartCanvas) {
      console.warn(
        `MAB ihale istatistikleri grafik canvas'ı ID "mabAuctionStatsChartCanvas" ile bulunamadı!`
      );
    }
    if (!this.mabWorkerSelector) {
      console.warn(
        `MAB işçi seçici elementi ID "mabWorkerSelector" ile bulunamadı!`
      );
    }
    if (!this.earningsRadio || !this.profitRadio) {
      console.warn("Kazanç/Kâr radio butonları bulunamadı!");
    }
    if (!this.mabQValueRadio || !this.mabSelectionCountRadio) {
      console.warn("MAB grafik tipi radio butonları bulunamadı!");
    }
    if (!this.auctionLogPanel) {
      console.warn("İhale günlüğü paneli (auctionLogPanel) bulunamadı!");
    }

    this._setupEventListeners();
  }

  _setupEventListeners() {
    if (this.earningsRadio) {
      this.earningsRadio.addEventListener("change", () => {
        if (this.earningsRadio.checked) {
          this.currentEarningsChartType = "earnings";
          this._updateEarningsChartAppearance();
        }
      });
    }
    if (this.profitRadio) {
      this.profitRadio.addEventListener("change", () => {
        if (this.profitRadio.checked) {
          this.currentEarningsChartType = "profit";
          this._updateEarningsChartAppearance();
        }
      });
    }

    if (this.mabQValueRadio) {
      this.mabQValueRadio.addEventListener("change", () => {
        if (this.mabQValueRadio.checked) {
          this.currentMabChartType = "q_value";
          this._initMabArmChart();
        }
      });
    }
    if (this.mabSelectionCountRadio) {
      this.mabSelectionCountRadio.addEventListener("change", () => {
        if (this.mabSelectionCountRadio.checked) {
          this.currentMabChartType = "selection_count";
          this._initMabArmChart();
        }
      });
    }
  }

  initCharts() {
    this._initEarningsChart();
    this._populateWorkerSelector();
  }

  _getEarningsChartDataAndLabel() {
    const workerLabels = this.sim.workers.map((w) => `W${w.id}`);
    let dataValues;
    let chartLabel;

    if (this.currentEarningsChartType === "profit") {
      dataValues = this.sim.workers.map((w) => w.totalNetProfit);
      chartLabel = "İşçi Toplam Net Kârları";
    } else {
      dataValues = this.sim.workers.map((w) => w.earnings);
      chartLabel = "İşçi Kazançları (Toplam Brüt)";
    }
    return { labels: workerLabels, data: dataValues, label: chartLabel };
  }

  _initEarningsChart() {
    if (!this.chartCanvas || typeof Chart === "undefined") {
      if (this.chartCanvas && typeof Chart === "undefined") {
        console.warn(
          "Chart.js kütüphanesi bulunamadı. Kazanç grafiği çizilemeyecek."
        );
      }
      return;
    }
    if (this.earningsChart) {
      this.earningsChart.destroy();
    }

    const initialDataset = this._getEarningsChartDataAndLabel();

    this.earningsChart = new Chart(this.chartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: initialDataset.labels,
        datasets: [
          {
            label: initialDataset.label,
            data: initialDataset.data,
            backgroundColor: this.sim.workers.map((w) => {
              const baseColor = w.color || "rgba(54, 162, 235, 1)";
              const alpha = w.available ? "0.6" : "0.9";
              if (baseColor.startsWith("rgba")) {
                return baseColor.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
              } else if (baseColor.startsWith("rgb")) {
                return baseColor
                  .replace("rgb", "rgba")
                  .replace(")", `, ${alpha})`);
              }
              return baseColor;
            }),
            borderColor: this.sim.workers.map((w) =>
              w.color
                ? w.color.replace(
                    /rgba?\(([^)]+)(?:,\s*[\d.]+)?\)/,
                    `rgba($1, 1)`
                  )
                : "rgba(54, 162, 235, 1)"
            ),
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(100, ...initialDataset.data, 0),
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
      },
    });
  }

  _updateEarningsChartAppearance() {
    if (!this.earningsChart || !this.sim || this.sim.workers.length < 0) {
      this._initEarningsChart();
      return;
    }

    const currentDataAndLabel = this._getEarningsChartDataAndLabel();

    this.earningsChart.data.labels = currentDataAndLabel.labels;
    this.earningsChart.data.datasets[0].data = currentDataAndLabel.data;
    this.earningsChart.data.datasets[0].label = currentDataAndLabel.label;

    this.earningsChart.data.datasets[0].backgroundColor = this.sim.workers.map(
      (w) => {
        const baseColor = w.color || "rgba(54, 162, 235, 0.6)";
        const alpha = w.available ? "0.6" : "0.9";
        if (baseColor.startsWith("rgba"))
          return baseColor.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
        if (baseColor.startsWith("rgb"))
          return baseColor.replace("rgb", "rgba").replace(")", `, ${alpha})`);
        return baseColor;
      }
    );
    this.earningsChart.data.datasets[0].borderColor = this.sim.workers.map(
      (w) =>
        w.color
          ? w.color.replace(/rgba?\(([^)]+)(?:,\s*[\d.]+)?\)/, `rgba($1, 1)`)
          : "rgba(54, 162, 235, 1)"
    );

    const maxVal = Math.max(...currentDataAndLabel.data, 0);
    this.earningsChart.options.scales.y.suggestedMax = Math.max(
      50,
      maxVal + maxVal * 0.1
    );

    this.earningsChart.update("none");
  }

  _populateWorkerSelector() {
    if (!this.mabWorkerSelector) return;
    this.mabWorkerSelector.innerHTML = "";

    if (this.sim.workers.length === 0) {
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "İşçi Yok";
      this.mabWorkerSelector.appendChild(defaultOption);
      this.mabWorkerSelector.disabled = true;
      this.setSelectedWorkerForMabChart(null);
      return;
    }
    this.mabWorkerSelector.disabled = false;

    let firstWorkerIdAsDefault = null;
    this.sim.workers.forEach((worker, index) => {
      const option = document.createElement("option");
      option.value = worker.id.toString();
      option.textContent = `İşçi W${worker.id}`;
      this.mabWorkerSelector.appendChild(option);
      if (index === 0) {
        firstWorkerIdAsDefault = worker.id.toString();
      }
    });

    const currentSelectionIsValid =
      this.selectedWorkerForMabChart !== null &&
      this.sim.workers.find(
        (w) => w.id.toString() === this.selectedWorkerForMabChart
      );

    if (currentSelectionIsValid) {
      this.mabWorkerSelector.value = this.selectedWorkerForMabChart;
      this.setSelectedWorkerForMabChart(this.selectedWorkerForMabChart);
    } else if (firstWorkerIdAsDefault !== null) {
      this.setSelectedWorkerForMabChart(firstWorkerIdAsDefault);
    } else {
      this.setSelectedWorkerForMabChart(null);
    }
  }

  setSelectedWorkerForMabChart(workerId) {
    if (workerId === null || workerId === "") {
      this.selectedWorkerForMabChart = null;
    } else {
      const newSelectedIdStr = workerId.toString();
      if (this.sim.workers.find((w) => w.id.toString() === newSelectedIdStr)) {
        this.selectedWorkerForMabChart = newSelectedIdStr;
      } else if (this.sim.workers.length > 0) {
        this.selectedWorkerForMabChart = this.sim.workers[0].id.toString();
      } else {
        this.selectedWorkerForMabChart = null;
      }
    }

    if (this.mabWorkerSelector) {
      this.mabWorkerSelector.value =
        this.selectedWorkerForMabChart !== null
          ? this.selectedWorkerForMabChart
          : "";
    }

    this._initMabArmChart();
    this._initMabAuctionStatsChart();
  }

  _getMabArmChartDataAndLabel(selectedWorker) {
    if (!selectedWorker || typeof selectedWorker.getMabArmData !== "function") {
      return { labels: [], data: [], label: "Veri Yok", rawArmData: {} };
    }
    const armData = selectedWorker.getMabArmData();
    const armLabels = Object.keys(armData);
    let dataValues;
    let chartLabel;

    if (this.currentMabChartType === "selection_count") {
      dataValues = armLabels.map((key) => armData[key].count);
      chartLabel = `W${selectedWorker.id} - MAB Kolu Seçim Sayısı`;
    } else {
      dataValues = armLabels.map((key) => armData[key].value);
      chartLabel = `W${selectedWorker.id} - MAB Kolu Ort. Net Kârı (Q-Değeri)`;
    }
    return {
      labels: armLabels,
      data: dataValues,
      label: chartLabel,
      rawArmData: armData,
    };
  }

  _initMabArmChart() {
    if (!this.mabArmChartCanvas || typeof Chart === "undefined") return;

    const ctx = this.mabArmChartCanvas.getContext("2d");
    if (this.mabArmChart) {
      this.mabArmChart.destroy();
      this.mabArmChart = null;
    }

    const selectedWorker = this.sim.workers.find(
      (w) => w.id.toString() === this.selectedWorkerForMabChart
    );

    if (!selectedWorker) {
      ctx.clearRect(
        0,
        0,
        this.mabArmChartCanvas.width,
        this.mabArmChartCanvas.height
      );
      ctx.textAlign = "center";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#6c757d";
      ctx.fillText(
        this.sim.workers.length === 0
          ? "Simülasyonda henüz işçi yok."
          : "MAB verisi için bir işçi seçin.",
        this.mabArmChartCanvas.width / 2,
        this.mabArmChartCanvas.height / 2 - 10
      );
      return;
    }

    const chartDataset = this._getMabArmChartDataAndLabel(selectedWorker);
    const backgroundColors = [
      "rgba(255, 99, 132, 0.6)",
      "rgba(255, 159, 64, 0.6)",
      "rgba(255, 205, 86, 0.6)",
      "rgba(75, 192, 192, 0.6)",
      "rgba(54, 162, 235, 0.6)",
      "rgba(153, 102, 255, 0.6)",
      "rgba(201, 203, 207, 0.6)",
      "rgba(231, 76, 60, 0.6)",
      "rgba(46, 204, 113, 0.6)",
    ];
    const borderColors = [
      "rgb(255, 99, 132)",
      "rgb(255, 159, 64)",
      "rgb(255, 205, 86)",
      "rgb(75, 192, 192)",
      "rgb(54, 162, 235)",
      "rgb(153, 102, 255)",
      "rgb(201, 203, 207)",
      "rgb(231, 76, 60)",
      "rgb(46, 204, 113)",
    ];

    this.mabArmChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartDataset.labels.map((label) =>
          label.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
        ),
        datasets: [
          {
            label: chartDataset.label,
            data: chartDataset.data,
            backgroundColor: backgroundColors.slice(
              0,
              chartDataset.labels.length
            ),
            borderColor: borderColors.slice(0, chartDataset.labels.length),
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: { beginAtZero: true },
          x: {
            ticks: {
              autoSkip: false,
              maxRotation: 45,
              minRotation: 30,
              font: { size: 10 },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: { display: true, labels: { font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (context) => {
                let label = "";
                const originalArmKey = context.label
                  .replace(/ /g, "_")
                  .toLowerCase();
                const armInfo = chartDataset.rawArmData[originalArmKey];

                if (this.currentMabChartType === "selection_count") {
                  label = `Seçim Sayısı: ${context.parsed.y}`;
                  if (armInfo && typeof armInfo.value !== "undefined") {
                    label += ` (Q: ${armInfo.value.toFixed(2)})`;
                  }
                } else {
                  // Q-Değeri
                  label = `Ort. Net Kâr (Q): ${context.parsed.y.toFixed(2)}`;
                  if (armInfo && typeof armInfo.count !== "undefined") {
                    label += ` (Seçim: ${armInfo.count})`;
                  }
                }
                return label;
              },
            },
          },
        },
      },
    });
  }

  _initMabAuctionStatsChart() {
    if (!this.mabAuctionStatsChartCanvas || typeof Chart === "undefined")
      return;

    const ctx = this.mabAuctionStatsChartCanvas.getContext("2d");
    if (this.mabAuctionStatsChart) {
      this.mabAuctionStatsChart.destroy();
      this.mabAuctionStatsChart = null;
    }

    const selectedWorker = this.sim.workers.find(
      (w) => w.id.toString() === this.selectedWorkerForMabChart
    );

    if (
      !selectedWorker ||
      typeof selectedWorker.getMabArmAuctionStats !== "function"
    ) {
      ctx.clearRect(
        0,
        0,
        this.mabAuctionStatsChartCanvas.width,
        this.mabAuctionStatsChartCanvas.height
      );
      ctx.textAlign = "center";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#6c757d";
      ctx.fillText(
        this.sim.workers.length === 0
          ? "Simülasyonda henüz işçi yok."
          : "İhale istatistikleri için bir işçi seçin.",
        this.mabAuctionStatsChartCanvas.width / 2,
        this.mabAuctionStatsChartCanvas.height / 2 - 10
      );
      return;
    }

    const auctionStats = selectedWorker.getMabArmAuctionStats();
    const armLabels = Object.keys(auctionStats);
    const auctionsWonData = armLabels.map(
      (key) => auctionStats[key].auctionsWon
    );
    const auctionsLostData = armLabels.map(
      (key) => auctionStats[key].auctionsLost
    );

    const backgroundColorsWon = "rgba(75, 192, 192, 0.7)"; // Yeşilimsi - biraz daha belirgin
    const borderColorsWon = "rgb(75, 192, 192)";
    const backgroundColorsLost = "rgba(255, 99, 132, 0.7)"; // Kırmızımsı - biraz daha belirgin
    const borderColorsLost = "rgb(255, 99, 132)";

    this.mabAuctionStatsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: armLabels.map((label) =>
          label.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
        ),
        datasets: [
          {
            label: `W${selectedWorker.id} - İhale Kazanıldı`,
            data: auctionsWonData,
            backgroundColor: backgroundColorsWon,
            borderColor: borderColorsWon,
            borderWidth: 1,
          },
          {
            label: `W${selectedWorker.id} - İhale Kaybedildi`,
            data: auctionsLostData,
            backgroundColor: backgroundColorsLost,
            borderColor: borderColorsLost,
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            stacked: false,
            title: { display: true, text: "İhale Sayısı" },
          },
          x: {
            stacked: false,
            ticks: {
              autoSkip: false,
              maxRotation: 45,
              minRotation: 30,
              font: { size: 10 },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { font: { size: 12 } },
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
      },
    });
  }

  updateChartData() {
    if (!this.sim.validInitialization) return;

    this._updateEarningsChartAppearance();
    this._initMabArmChart();
    this._initMabAuctionStatsChart();
  }

  updateInfoPanel() {
    if (!this.infoPanelIds || !this.sim.validInitialization) return;
    try {
      document.getElementById(this.infoPanelIds.time).textContent =
        this.sim.time.toFixed(1);
      document.getElementById(this.infoPanelIds.jobsCreated).textContent =
        this.sim.jobCounter;
      document.getElementById(this.infoPanelIds.maxJobs).textContent =
        this.sim.currentMaxJobs;
      document.getElementById(this.infoPanelIds.jobsCompleted).textContent =
        this.sim.completedJobs.length;

      const totalGrossEarnings = this.sim.workers.reduce(
        (sum, w) => sum + w.earnings,
        0
      );
      document.getElementById(this.infoPanelIds.totalEarnings).textContent =
        totalGrossEarnings.toFixed(0);
    } catch (e) {
      console.warn("Info panel güncelleme hatası:", e);
    }
  }

  addAuctionLog(message) {
    if (!this.auctionLogPanel || !this.sim.validInitialization) return;
    const logEntry = document.createElement("p");
    logEntry.textContent = `[${this.sim.time.toFixed(1)}s] ${message}`;
    this.auctionLogPanel.appendChild(logEntry);
  }

  clearAuctionLog() {
    if (this.auctionLogPanel) {
      this.auctionLogPanel.innerHTML = "";
    }
  }
}
