// js/ChartManager.js
import { CONFIG } from "./config.js"; // Gerekirse

export class ChartManager {
  constructor(simulationController) {
    this.sim = simulationController; // Ana SimulationController'a erişim için

    // DOM Elementleri
    this.chartCanvas = document.getElementById("earningsChartCanvas");
    this.mabArmChartCanvas = document.getElementById("mabArmChartCanvas");
    this.mabWorkerSelector = document.getElementById("mabWorkerSelector");
    this.infoPanelIds = this.sim.infoPanelIds;
    this.auctionLogPanel = document.getElementById("auctionLogPanel");

    // Radio butonlar
    this.earningsRadio = document.getElementById("earningsRadio");
    this.profitRadio = document.getElementById("profitRadio");

    this.earningsChart = null;
    this.mabArmChart = null;
    this.selectedWorkerForMabChart = null;
    this.currentEarningsChartType = "earnings"; // Varsayılan: 'earnings' veya 'profit'

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
    if (!this.mabWorkerSelector) {
      console.warn(
        `MAB işçi seçici elementi ID "mabWorkerSelector" ile bulunamadı!`
      );
    }
    if (!this.earningsRadio || !this.profitRadio) {
      console.warn("Kazanç/Kâr radio butonları bulunamadı!");
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
    // MAB işçi seçici için event listener main.js dosyasında zaten eklenmiş durumda.
    // Eğer burada da yönetmek isterseniz:
    /*
    if (this.mabWorkerSelector) {
        this.mabWorkerSelector.addEventListener('change', (event) => {
            this.setSelectedWorkerForMabChart(event.target.value);
        });
    }
    */
  }

  initCharts() {
    this._initEarningsChart();
    this._initMabArmChart(); // Başlangıçta boş veya varsayılan işçi ile
    this._populateWorkerSelector(); // Seçiciyi doldur ve MAB grafiğini tetikle
  }

  _getEarningsChartDataAndLabel() {
    const workerLabels = this.sim.workers.map((w) => `W${w.id}`);
    let dataValues;
    let chartLabel;

    if (this.currentEarningsChartType === "profit") {
      dataValues = this.sim.workers.map((w) => w.totalNetProfit);
      chartLabel = "İşçi Toplam Net Kârları";
    } else {
      // Varsayılan olarak kazançlar (earnings)
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
            suggestedMax: Math.max(100, ...initialDataset.data, 0), // İlk veri için
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, // Animasyonları kapatmak performansı artırabilir
      },
    });
  }

  _updateEarningsChartAppearance() {
    if (!this.earningsChart || !this.sim || this.sim.workers.length < 0) return;

    const currentDataAndLabel = this._getEarningsChartDataAndLabel();

    this.earningsChart.data.labels = currentDataAndLabel.labels;
    this.earningsChart.data.datasets[0].data = currentDataAndLabel.data;
    this.earningsChart.data.datasets[0].label = currentDataAndLabel.label;

    // Renkler gibi diğer dataset özellikleri güncellenebilir (eğer işçi sayısı değişirse vs.)
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
      50, // Minimum y-ekseni değeri (örneğin)
      maxVal + maxVal * 0.1 // Mevcut maksimumun %10 fazlası, ya da sabit bir değer
    );

    this.earningsChart.update("none"); // 'none' ile animasyonsuz güncelleme
  }

  _populateWorkerSelector() {
    if (!this.mabWorkerSelector) return;
    this.mabWorkerSelector.innerHTML = ""; // Önceki seçenekleri temizle

    if (this.sim.workers.length === 0) {
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "İşçi Yok";
      this.mabWorkerSelector.appendChild(defaultOption);
      this.mabWorkerSelector.disabled = true;
      this.selectedWorkerForMabChart = null; // Seçili işçiyi sıfırla
      this._initMabArmChart(); // MAB grafiğini de "işçi yok" durumuna güncelle
      return;
    }
    this.mabWorkerSelector.disabled = false;

    let firstWorkerIdAsDefault = null;
    this.sim.workers.forEach((worker, index) => {
      const option = document.createElement("option");
      option.value = worker.id.toString(); // Değeri string olarak saklamak daha güvenli
      option.textContent = `İşçi W${worker.id}`;
      this.mabWorkerSelector.appendChild(option);
      if (index === 0) {
        firstWorkerIdAsDefault = worker.id.toString();
      }
    });

    // Önceden seçili bir işçi varsa ve hala mevcutsa onu koru, yoksa ilk işçiyi seç
    const currentSelectionIsValid =
      this.selectedWorkerForMabChart !== null &&
      this.sim.workers.find(
        (w) => w.id.toString() === this.selectedWorkerForMabChart
      );

    if (currentSelectionIsValid) {
      this.mabWorkerSelector.value = this.selectedWorkerForMabChart;
    } else if (firstWorkerIdAsDefault !== null) {
      this.selectedWorkerForMabChart = firstWorkerIdAsDefault;
      this.mabWorkerSelector.value = firstWorkerIdAsDefault;
    } else {
      this.selectedWorkerForMabChart = null; // Hiçbir işçi seçilemiyorsa
      this.mabWorkerSelector.value = "";
    }
    this._initMabArmChart(); // Seçici dolduktan sonra MAB grafiğini başlat/güncelle
  }

  _initMabArmChart() {
    if (!this.mabArmChartCanvas || typeof Chart === "undefined") {
      // ... (hata mesajı aynı) ...
      return;
    }

    const ctx = this.mabArmChartCanvas.getContext("2d");
    if (this.mabArmChart) {
      this.mabArmChart.destroy();
      this.mabArmChart = null;
    }

    // selectedWorkerForMabChart artık string ID tutuyor olabilir, parseInt gerekebilir
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
      ctx.fillStyle = "#6c757d"; // Daha yumuşak bir renk
      ctx.fillText(
        this.sim.workers.length === 0
          ? "Simülasyonda henüz işçi yok."
          : "MAB verisi için bir işçi seçin.",
        this.mabArmChartCanvas.width / 2,
        this.mabArmChartCanvas.height / 2 - 10
      );
      return;
    }

    if (typeof selectedWorker.getMabArmData !== "function") {
      console.error(
        `W${selectedWorker.id} için getMabArmData metodu bulunamadı.`
      );
      return;
    }
    const armData = selectedWorker.getMabArmData();
    const armLabels = Object.keys(armData);
    const armValues = armLabels.map((key) => armData[key].value); // Ortalama net kâr (Q-değeri)

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
        labels: armLabels.map((label) =>
          label.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
        ),
        datasets: [
          {
            label: `W${selectedWorker.id} - MAB Kolu Ort. Net Kârı (Q-Değeri)`,
            data: armValues,
            backgroundColor: backgroundColors.slice(0, armLabels.length),
            borderColor: borderColors.slice(0, armLabels.length),
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
              label: function (context) {
                let label = `Ort. Net Kâr (Q): `;
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(2);
                }
                const originalArmKey = context.label // Tooltip'teki etiket üzerinden orijinal anahtarı bul
                  .replace(/ /g, "_")
                  .toLowerCase();
                if (
                  armData[originalArmKey] &&
                  typeof armData[originalArmKey].count !== "undefined"
                ) {
                  label += ` (Seçim Sayısı: ${armData[originalArmKey].count})`;
                }
                return label;
              },
            },
          },
        },
      },
    });
  }

  setSelectedWorkerForMabChart(workerId) {
    // workerId string olarak gelmeli
    // workerId'nin null veya boş string olup olmadığını kontrol et
    if (workerId === null || workerId === "") {
      this.selectedWorkerForMabChart = null;
    } else {
      const newSelectedIdStr = workerId.toString();
      if (this.sim.workers.find((w) => w.id.toString() === newSelectedIdStr)) {
        this.selectedWorkerForMabChart = newSelectedIdStr;
      } else if (this.sim.workers.length > 0) {
        // Eğer gelen ID geçersizse ve işçiler varsa, ilk işçiyi seç
        this.selectedWorkerForMabChart = this.sim.workers[0].id.toString();
        if (this.mabWorkerSelector)
          this.mabWorkerSelector.value = this.selectedWorkerForMabChart; // Seçiciyi de güncelle
      } else {
        // Hiç işçi yoksa null yap
        this.selectedWorkerForMabChart = null;
      }
    }

    if (this.mabWorkerSelector && this.selectedWorkerForMabChart !== null) {
      this.mabWorkerSelector.value = this.selectedWorkerForMabChart;
    } else if (this.mabWorkerSelector) {
      this.mabWorkerSelector.value = ""; // İşçi seçilmemişse seçiciyi boşalt
    }
    this._initMabArmChart(); // Seçim değişince MAB grafiğini yeniden çiz/güncelle
  }

  updateChartData() {
    this._updateEarningsChartAppearance(); // Bu artık seçime göre kazanç/kâr grafiğini günceller

    // MAB grafiği güncellemesi (sadece veri ve etiket değişebilir, yeniden başlatmak daha güvenli)
    if (this.selectedWorkerForMabChart !== null) {
      const selectedWorker = this.sim.workers.find(
        (w) => w.id.toString() === this.selectedWorkerForMabChart
      );
      if (
        selectedWorker &&
        this.mabArmChart &&
        typeof selectedWorker.getMabArmData === "function"
      ) {
        const armData = selectedWorker.getMabArmData();
        const armLabels = Object.keys(armData);

        this.mabArmChart.data.labels = armLabels.map((label) =>
          label.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
        );
        this.mabArmChart.data.datasets[0].data = armLabels.map(
          (key) => armData[key].value
        );
        this.mabArmChart.data.datasets[0].label = `W${selectedWorker.id} - MAB Kolu Ort. Net Kârı (Q-Değeri)`;
        // Tooltip'teki seçim sayısı için grafiği yeniden başlatmak daha garanti olabilir.
        // Veya tooltip callback'ini dinamik hale getirmek gerekir. Şimdilik sadece veriyi güncelleyelim.
        this.mabArmChart.update("none");
      } else if (
        !selectedWorker &&
        this.mabWorkerSelector &&
        this.sim.workers.length > 0
      ) {
        // Eğer seçili işçi artık listede yoksa ve başka işçiler varsa, seçiciyi ve grafiği güncelle.
        this.setSelectedWorkerForMabChart(this.sim.workers[0].id.toString());
      } else if (!selectedWorker && this.sim.workers.length === 0) {
        // Hiç işçi kalmadıysa
        this.setSelectedWorkerForMabChart(null);
      }
    } else if (
      this.selectedWorkerForMabChart === null &&
      this.sim.workers.length > 0
    ) {
      // Eğer bir işçi seçilmemişse ama işçiler varsa, ilkini seç.
      this.setSelectedWorkerForMabChart(this.sim.workers[0].id.toString());
    } else if (
      this.selectedWorkerForMabChart === null &&
      this.sim.workers.length === 0
    ) {
      // Hiç işçi yok ve seçili işçi de yoksa, MAB grafiğini boş göster.
      this._initMabArmChart();
    }
  }

  updateInfoPanel() {
    if (!this.infoPanelIds) return;
    try {
      document.getElementById(this.infoPanelIds.time).textContent =
        this.sim.time.toFixed(1);
      document.getElementById(this.infoPanelIds.jobsCreated).textContent =
        this.sim.jobCounter;
      document.getElementById(this.infoPanelIds.maxJobs).textContent =
        this.sim.currentMaxJobs;
      document.getElementById(this.infoPanelIds.jobsCompleted).textContent =
        this.sim.completedJobs.length;

      // Toplam Brüt Kazanç (worker.earnings toplamı)
      const totalGrossEarnings = this.sim.workers.reduce(
        (sum, w) => sum + w.earnings,
        0
      );
      document.getElementById(this.infoPanelIds.totalEarnings).textContent = // HTML'deki ID bu
        totalGrossEarnings.toFixed(0);

      // İsteğe bağlı: Toplam Net Kârı da gösterebilirsiniz, bunun için HTML'e yeni bir satır eklemeniz gerekir.
      // const totalNetProfits = this.sim.workers.reduce((sum, w) => sum + w.totalNetProfit, 0);
      // document.getElementById('totalNetProfitDisplay').textContent = totalNetProfits.toFixed(0);
    } catch (e) {
      console.warn("Info panel güncelleme hatası:", e);
    }
  }

  addAuctionLog(message) {
    if (!this.auctionLogPanel) return;
    const logEntry = document.createElement("p");
    logEntry.textContent = `[${this.sim.time.toFixed(1)}s] ${message}`; // Zaman damgası ekle
    this.auctionLogPanel.appendChild(logEntry);
    // En alta kaydır, ancak sadece kullanıcı en altta ise veya çok fazla log yoksa
    if (
      this.auctionLogPanel.scrollHeight - this.auctionLogPanel.scrollTop <=
      this.auctionLogPanel.clientHeight + 50
    ) {
      this.auctionLogPanel.scrollTop = this.auctionLogPanel.scrollHeight;
    }
  }

  clearAuctionLog() {
    if (this.auctionLogPanel) {
      this.auctionLogPanel.innerHTML = "";
    }
  }
}
