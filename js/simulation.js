// js/simulation.js
import { Worker } from "./worker.js";
import { Job } from "./job.js";
import { Utils } from "./utils.js";
import { CONFIG } from "./config.js";

export class SimulationSystem {
  constructor(canvasId, chartCanvasId, infoPanelIds) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(
        `Ana simülasyon canvas'ı ID "${canvasId}" ile bulunamadı! Simülasyon başlayamaz.`
      );
      this.validInitialization = false;
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.validInitialization = true;

    this.chartCanvas = document.getElementById(chartCanvasId); // Ana kazanç grafiği
    if (!this.chartCanvas) {
      console.warn(
        `Kazanç grafiği canvas'ı ID "${chartCanvasId}" ile bulunamadı! Grafik gösterilmeyecek.`
      );
    }

    // MAB Grafiği ve Seçici için DOM elementleri
    this.mabArmChartCanvas = document.getElementById("mabArmChartCanvas");
    if (!this.mabArmChartCanvas) {
      console.warn(
        `MAB kolu grafik canvas'ı ID "mabArmChartCanvas" ile bulunamadı! MAB grafiği gösterilmeyecek.`
      );
    }
    this.mabWorkerSelector = document.getElementById("mabWorkerSelector");
    if (!this.mabWorkerSelector) {
      console.warn(
        `MAB işçi seçici elementi ID "mabWorkerSelector" ile bulunamadı! MAB grafiği için işçi seçimi yapılamayacak.`
      );
    }

    this.infoPanelIds = infoPanelIds;
    this.auctionLogPanel = document.getElementById("auctionLogPanel");

    this.workers = [];
    this.jobs = [];
    this.completedJobs = [];
    this.time = 0.0;
    this.jobCounter = 0;
    this.allJobsCreated = false;

    this.animationFrameId = null;
    this.isRunning = false;
    this.simulationEnding = false;

    this.currentNumWorkers = CONFIG.NUM_WORKERS;
    this.currentMaxJobs = CONFIG.MAX_JOBS;

    this.auctionInterval = CONFIG.AUCTION_INTERVAL;
    this.timeSinceLastAuction = 0.0;

    this.earningsChart = null;
    this.mabArmChart = null;
    this.selectedWorkerForMabChart = null;
  }

  _initChart() {
    // Ana kazanç grafiği
    if (
      !this.chartCanvas ||
      !this.validInitialization ||
      typeof Chart === "undefined"
    ) {
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
    const workerLabels = this.workers.map((w) => `W${w.id}`);
    const earningsData = this.workers.map((w) => w.earnings);
    this.earningsChart = new Chart(this.chartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: workerLabels,
        datasets: [
          {
            label: "Kazançlar (Toplam)",
            data: earningsData,
            backgroundColor: this.workers.map((w) => {
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
            borderColor: this.workers.map((w) =>
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
            suggestedMax: Math.max(100, ...earningsData, 0),
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
      },
    });
  }

  _populateWorkerSelector() {
    if (!this.mabWorkerSelector || !this.validInitialization) return;
    this.mabWorkerSelector.innerHTML = "";

    if (this.workers.length === 0) {
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "İşçi Yok";
      this.mabWorkerSelector.appendChild(defaultOption);
      this.mabWorkerSelector.disabled = true;
      this.selectedWorkerForMabChart = null;
      this._initMabArmChart(); // Grafiği de temizle
      return;
    }
    this.mabWorkerSelector.disabled = false;

    let firstWorkerIdAsDefault = null;
    this.workers.forEach((worker, index) => {
      const option = document.createElement("option");
      option.value = worker.id;
      option.textContent = `İşçi W${worker.id}`;
      this.mabWorkerSelector.appendChild(option);
      if (index === 0) {
        firstWorkerIdAsDefault = worker.id;
      }
    });

    // Önceden seçili bir işçi varsa ve hala mevcutsa onu koru, yoksa ilk işçiyi seç
    const currentSelectionIsValid =
      this.selectedWorkerForMabChart !== null &&
      this.workers.find((w) => w.id === this.selectedWorkerForMabChart);
    if (currentSelectionIsValid) {
      this.mabWorkerSelector.value = this.selectedWorkerForMabChart;
    } else if (firstWorkerIdAsDefault !== null) {
      this.selectedWorkerForMabChart = firstWorkerIdAsDefault;
      this.mabWorkerSelector.value = firstWorkerIdAsDefault;
    } else {
      this.selectedWorkerForMabChart = null; // Hiçbir işçi seçilemiyorsa
    }
    this._initMabArmChart(); // Seçici dolduktan sonra grafiği başlat/güncelle
  }

  _initMabArmChart() {
    if (
      !this.mabArmChartCanvas ||
      !this.validInitialization ||
      typeof Chart === "undefined"
    ) {
      if (this.mabArmChartCanvas && typeof Chart === "undefined") {
        console.warn(
          "Chart.js kütüphanesi bulunamadı. MAB kolu grafiği çizilemeyecek."
        );
      }
      return;
    }

    const ctx = this.mabArmChartCanvas.getContext("2d");
    if (this.mabArmChart) {
      this.mabArmChart.destroy();
      this.mabArmChart = null;
    }

    const selectedWorker = this.workers.find(
      (w) => w.id === this.selectedWorkerForMabChart
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
        this.workers.length === 0
          ? "Simülasyonda henüz işçi yok."
          : "MAB verisi için bir işçi seçin.",
        this.mabArmChartCanvas.width / 2,
        this.mabArmChartCanvas.height / 2 - 10 // Biraz yukarı alalım
      );
      return;
    }

    // Worker sınıfında getMabArmData() metodunun var olduğundan emin ol
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
                const originalArmKey = context.label
                  .replace(/ /g, "_")
                  .toLowerCase();
                if (
                  armData[originalArmKey] &&
                  typeof armData[originalArmKey].count !== "undefined"
                ) {
                  label += ` (Seçim: ${armData[originalArmKey].count})`;
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
    const newSelectedId = parseInt(workerId, 10);
    if (this.workers.find((w) => w.id === newSelectedId)) {
      this.selectedWorkerForMabChart = newSelectedId;
    } else if (this.workers.length > 0) {
      this.selectedWorkerForMabChart = this.workers[0].id; // Geçersiz ID ise ilk işçiyi seç
      if (this.mabWorkerSelector)
        this.mabWorkerSelector.value = this.selectedWorkerForMabChart;
    } else {
      this.selectedWorkerForMabChart = null; // Hiç işçi yoksa
      if (this.mabWorkerSelector) this.mabWorkerSelector.value = "";
    }
    this._initMabArmChart(); // Seçim değişince grafiği yeniden çiz/güncelle
  }

  reset(numWorkers = CONFIG.NUM_WORKERS, maxJobs = CONFIG.MAX_JOBS) {
    if (!this.validInitialization) return;
    this.pause();

    this.currentNumWorkers = parseInt(numWorkers, 10);
    this.currentMaxJobs = parseInt(maxJobs, 10);

    if (this.auctionLogPanel) {
      this.auctionLogPanel.innerHTML = "";
    }
    this.addAuctionLog(
      `Simülasyon sıfırlanıyor: ${this.currentNumWorkers} işçi, ${this.currentMaxJobs} maks. iş`
    );

    this.workers = [];
    for (let i = 0; i < this.currentNumWorkers; i++) {
      this.workers.push(
        new Worker( // Worker constructor'ınızın güncel halini yansıtmalı
          i,
          Math.random() * this.canvas.width,
          Math.random() * this.canvas.height,
          CONFIG.BASE_WORKER_SPEED,
          this.canvas.width,
          this.canvas.height
        )
      );
    }

    this.jobs = [];
    this.completedJobs = [];
    this.time = 0.0;
    this.jobCounter = 0;
    this.allJobsCreated = false;
    this.simulationEnding = false;
    this.isRunning = false;
    this.timeSinceLastAuction = 0.0;

    this.selectedWorkerForMabChart = null;
    if (this.workers.length > 0) {
      this.selectedWorkerForMabChart = this.workers[0].id;
    }
    this._populateWorkerSelector(); // Bu, _initMabArmChart'ı da çağırır

    const initialJobsToCreate = Math.max(
      1,
      Math.min(this.currentMaxJobs, Math.floor(0.2 * this.currentMaxJobs))
    );
    for (let i = 0; i < initialJobsToCreate; i++) {
      this.spawnNewJob();
    }

    this._initChart(); // Ana kazanç grafiği
    this.draw();
    this.updateInfoPanel();
    this.addAuctionLog("Simülasyon ayarları uygulandı ve sıfırlandı.");
  }

  spawnNewJob() {
    if (!this.validInitialization) return null;
    if (this.jobCounter < this.currentMaxJobs) {
      const padding = 20;
      const newJobX =
        Math.random() * (this.canvas.width - 2 * padding) + padding;
      const newJobY =
        Math.random() * (this.canvas.height - 2 * padding) + padding;
      const newJob = new Job(this.jobCounter, newJobX, newJobY, this.time);
      newJob.duration = CONFIG.JOB_FIXED_DURATION;
      newJob.baseRevenue =
        Math.random() *
          (CONFIG.MAX_REVENUE_FOR_JOB_SPAWN -
            CONFIG.MIN_REVENUE_FOR_JOB_SPAWN) +
        CONFIG.MIN_REVENUE_FOR_JOB_SPAWN;
      this.jobs.push(newJob);
      this.jobCounter++;
      this.addAuctionLog(
        `Yeni iş oluşturuldu: J${
          newJob.id
        } (Gelir: ${newJob.baseRevenue.toFixed(0)})`
      );
      if (this.jobCounter >= this.currentMaxJobs) {
        this.allJobsCreated = true;
        this.addAuctionLog(
          `Tanımlanan tüm işler (${this.currentMaxJobs}) oluşturuldu.`
        );
      }
      return newJob;
    }
    return null;
  }

  calculateJobTravelTime(worker, job) {
    const distance = Utils.distance(worker.x, worker.y, job.x, job.y);
    return worker.speed > 0 ? distance / worker.speed : Infinity;
  }

  assignJobToWorker(job, worker, bidAmount, armKeyUsed) {
    job.assignedWorkerId = worker.id;
    job.winningBid = bidAmount;
    job.estimatedTravelTime = this.calculateJobTravelTime(worker, job);
    job.startTime = null;
    job.progress = 0;
    const distanceToJob = Utils.distance(worker.x, worker.y, job.x, job.y);
    const distanceCostForJob = distanceToJob * CONFIG.COST_PER_DISTANCE_UNIT;
    worker.assigned_jobs.push({
      jobId: job.id,
      startTime: null,
      duration: job.duration,
      winningBid: bidAmount,
      targetX: job.x,
      targetY: job.y,
      armKeyUsed: armKeyUsed,
      calculatedDistanceCost: distanceCostForJob,
    });
    worker.available = false;
    worker.path = [{ x: job.x, y: job.y }];
  }

  checkJobTimeouts() {
    if (!this.validInitialization) return;
    const currentTime = this.time;
    const newJobsList = [];
    let timedOutCount = 0;
    for (let i = 0; i < this.jobs.length; i++) {
      const job = this.jobs[i];
      if (job.assignedWorkerId === null && !job.completed && !job.timedOut) {
        if (currentTime - job.creationTime > CONFIG.JOB_TIMEOUT_DURATION) {
          job.timedOut = true;
          this.addAuctionLog(
            `ZAMAN AŞIMI: J${job.id} (R:${job.baseRevenue.toFixed(
              0
            )}) ${CONFIG.JOB_TIMEOUT_DURATION.toFixed(
              1
            )}s boyunca atanmadığı için kaldırıldı.`
          );
          timedOutCount++;
        }
      }
      if (!job.timedOut) {
        newJobsList.push(job);
      }
    }
    if (timedOutCount > 0) {
      this.jobs = newJobsList;
    }
  }

  runAuctionRound() {
    if (!this.validInitialization) return;
    this.checkJobTimeouts();
    this.addAuctionLog(
      `--- ${this.time.toFixed(1)}s: Yeni İhale Turu Başladı ---`
    );
    const openForBiddingJobs = this.jobs.filter(
      (job) => !job.completed && job.assignedWorkerId === null && !job.timedOut
    );
    if (openForBiddingJobs.length === 0) {
      this.addAuctionLog("Teklif verilecek açık iş bulunmuyor.");
      this.addAuctionLog("--- İhale Turu Bitti ---");
      return;
    }
    this.addAuctionLog(
      `Açık İşler (${openForBiddingJobs.length}): ${openForBiddingJobs
        .map((j) => `J${j.id}(R:${j.baseRevenue.toFixed(0)})`)
        .join(", ")}`
    );
    const availableWorkers = this.workers.filter((w) => w.available);
    if (availableWorkers.length === 0) {
      this.addAuctionLog("Teklif verecek uygun işçi bulunmuyor.");
      this.addAuctionLog("--- İhale Turu Bitti ---");
      return;
    }
    this.addAuctionLog(
      `Uygun İşçiler (${availableWorkers.length}): ${availableWorkers
        .map((w) => `W${w.id}`)
        .join(", ")}`
    );
    const potentialBids = [];
    for (const worker of availableWorkers) {
      const choice = worker.selectJobAndCalculateBid(openForBiddingJobs);
      if (
        choice &&
        choice.job &&
        typeof choice.job.id !== "undefined" &&
        isFinite(choice.bid) &&
        choice.bid > 0 &&
        choice.armKey
      ) {
        potentialBids.push({
          worker: worker,
          job: choice.job,
          bid: choice.bid,
          armKey: choice.armKey,
        });
        this.addAuctionLog(
          `W${worker.id} (Kol:${choice.armKey}) -> J${
            choice.job.id
          } için potansiyel teklif: ${choice.bid.toFixed(
            0
          )} (İş Geliri: ${choice.job.baseRevenue.toFixed(0)})`
        );
      }
    }
    if (potentialBids.length === 0) {
      this.addAuctionLog("Hiçbir işçi bu turda geçerli bir teklif vermedi.");
      this.addAuctionLog("--- İhale Turu Bitti ---");
      return;
    }
    const bidsByJob = {};
    for (const pb of potentialBids) {
      if (pb && pb.job && typeof pb.job.id !== "undefined") {
        if (!bidsByJob[pb.job.id]) bidsByJob[pb.job.id] = [];
        bidsByJob[pb.job.id].push({
          worker: pb.worker,
          bid: pb.bid,
          armKey: pb.armKey,
        });
      } else {
        console.warn(
          "runAuctionRound: potansiyel teklifte geçersiz 'job' bulundu:",
          pb
        );
      }
    }
    let jobsAssignedThisRoundCount = 0;
    const assignedDetailsLogArray = [];
    for (const jobIdStr in bidsByJob) {
      const jobId = parseInt(jobIdStr);
      const job = this.jobs.find((j) => j.id === jobId);
      if (
        !job ||
        job.assignedWorkerId !== null ||
        job.completed ||
        job.timedOut
      )
        continue;
      const jobBids = bidsByJob[jobIdStr];
      jobBids.sort((a, b) => a.bid - b.bid);
      let bidsDetailMsg = `J${job.id} (R:${job.baseRevenue.toFixed(
        0
      )}) teklifleri: ${jobBids
        .map((b) => `W${b.worker.id}(${b.bid.toFixed(0)}, Kol:${b.armKey})`)
        .join("; ")}`;
      this.addAuctionLog(bidsDetailMsg);
      let assignedThisJob = false;
      for (const bestBidEntry of jobBids) {
        if (bestBidEntry.worker.available) {
          this.assignJobToWorker(
            job,
            bestBidEntry.worker,
            bestBidEntry.bid,
            bestBidEntry.armKey
          );
          assignedDetailsLogArray.push(
            `J${job.id} -> W${
              bestBidEntry.worker.id
            } (Teklif: ${bestBidEntry.bid.toFixed(0)}, Kol:${
              bestBidEntry.armKey
            })`
          );
          jobsAssignedThisRoundCount++;
          assignedThisJob = true;
          break;
        }
      }
      if (!assignedThisJob && jobBids.length > 0) {
        this.addAuctionLog(
          `J${job.id} için kazanan atanamadı (teklif verenler meşgul olabilir).`
        );
      }
    }
    if (jobsAssignedThisRoundCount > 0) {
      this.addAuctionLog(
        `Atanan İşler: ${assignedDetailsLogArray.join(" | ")}`
      );
    } else if (potentialBids.length > 0) {
      this.addAuctionLog("Bu turda teklifler oldu ancak hiçbir iş atanamadı.");
    }
    this.addAuctionLog("--- İhale Turu Bitti ---");
  }

  updateWorkers(timeStep) {
    if (!this.validInitialization) return;
    for (const worker of this.workers) {
      if (!worker.available && worker.assigned_jobs.length > 0) {
        const currentAssignment = worker.assigned_jobs[0];
        const job = this.jobs.find(
          (j) => j.id === currentAssignment.jobId && !j.timedOut && !j.completed
        );
        if (!job) {
          if (
            currentAssignment.armKeyUsed &&
            typeof worker.updateMabArm === "function"
          ) {
            // worker.updateMabArm(currentAssignment.armKeyUsed, -5); // Ceza
          }
          worker.assigned_jobs.shift();
          worker.available = worker.assigned_jobs.length === 0;
          worker.path = [];
          if (worker.available && worker.assigned_jobs.length === 0) {
            this.addAuctionLog(
              `W${worker.id} uygun hale geldi (atanan işi J${currentAssignment.jobId} bulunamadı/zaman aşımına uğradı/tamamlandı).`
            );
          }
          continue;
        }
        const targetX = currentAssignment.targetX;
        const targetY = currentAssignment.targetY;
        const arrivalTolerance = 1.5 * worker.speed * timeStep;
        if (
          Utils.distance(worker.x, worker.y, targetX, targetY) >
          arrivalTolerance
        ) {
          worker.moveToTarget(timeStep);
        } else {
          worker.x = targetX;
          worker.y = targetY;
          worker.path = [];
          if (job.startTime === null) {
            job.startTime = this.time;
            currentAssignment.startTime = this.time;
            this.addAuctionLog(`W${worker.id}, J${job.id}'ye başladı.`);
          }
          if (job.startTime !== null) {
            const elapsedTimeOnJob = this.time - job.startTime;
            if (job.duration > 0)
              job.progress = Math.min(elapsedTimeOnJob / job.duration, 1.0);
            else {
              job.progress = 1.0;
              if (!job.completed) console.warn(`J${job.id} süresi <= 0.`);
            }
            if (job.progress >= 1.0 && !job.completed) {
              job.completed = true;
              if (!this.completedJobs.find((cj) => cj.id === job.id))
                this.completedJobs.push(job);
              worker.earnings += currentAssignment.winningBid;
              const netProfit =
                currentAssignment.winningBid -
                currentAssignment.calculatedDistanceCost;
              if (
                currentAssignment.armKeyUsed &&
                typeof worker.updateMabArm === "function"
              ) {
                worker.updateMabArm(currentAssignment.armKeyUsed, netProfit);
              }
              this.addAuctionLog(
                `İŞ TAMAMLANDI: J${job.id} (W${
                  worker.id
                }, Teklif: ${currentAssignment.winningBid.toFixed(
                  0
                )}, Net Kâr: ${netProfit.toFixed(0)}, MAB Kolu: ${
                  currentAssignment.armKeyUsed || "N/A"
                })`
              );
              worker.assigned_jobs.shift();
              worker.available = worker.assigned_jobs.length === 0;
              if (worker.assigned_jobs.length > 0) {
                const nextAssignment = worker.assigned_jobs[0];
                const nextJobToAssign = this.jobs.find(
                  (j) =>
                    j.id === nextAssignment.jobId && !j.timedOut && !j.completed
                );
                if (nextJobToAssign) {
                  worker.path = [
                    { x: nextJobToAssign.x, y: nextJobToAssign.y },
                  ];
                  this.addAuctionLog(
                    `W${worker.id}, J${nextJobToAssign.id}'ye yöneliyor.`
                  );
                } else {
                  worker.available = true;
                  worker.path = [];
                  if (worker.available)
                    this.addAuctionLog(
                      `W${worker.id} uygun (sırada iş yok/geçersiz).`
                    );
                }
              } else {
                worker.path = [];
                if (worker.available)
                  this.addAuctionLog(`W${worker.id} uygun (iş bitti).`);
              }
            }
          }
        }
      } else {
        worker.available = true;
      }
    }
  }

  _updateChartData() {
    if (!this.validInitialization) return;
    if (this.earningsChart && this.workers.length >= 0) {
      this.earningsChart.data.labels = this.workers.map((w) => `W${w.id}`);
      this.earningsChart.data.datasets[0].data = this.workers.map(
        (w) => w.earnings
      );
      this.earningsChart.data.datasets[0].backgroundColor = this.workers.map(
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
      const maxEarnings = Math.max(...this.workers.map((w) => w.earnings), 0);
      this.earningsChart.options.scales.y.suggestedMax = Math.max(
        100,
        maxEarnings + 20
      );
      this.earningsChart.update("none");
    }
    if (this.mabArmChart && this.selectedWorkerForMabChart !== null) {
      const selectedWorker = this.workers.find(
        (w) => w.id === this.selectedWorkerForMabChart
      );
      if (
        selectedWorker &&
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
        // Tooltip'teki count bilgisinin güncel kalması için _initMabArmChart'ı çağırmak daha garanti olabilir,
        // çünkü tooltip callback'i Chart.js instance'ı oluşturulurken tanımlanıyor.
        // Ya da tooltip callback'ini selectedWorker'a dışarıdan erişecek şekilde yeniden yazmak gerekir.
        // En basit çözüm, veriler çok sık değişiyorsa _initMabArmChart'ı çağırmak veya
        // sadece datayı güncelleyip tooltip'in anlık durumu yansıtmasını ummak.
        // Daha doğru bir güncelleme için _initMabArmChart'ı çağırmak daha güvenli.
        // this._initMabArmChart(); // Bu, grafiği tamamen yeniden oluşturur, daha yavaş olabilir.
        this.mabArmChart.update("none"); // Sadece datayı günceller, daha hızlı.
      } else if (!selectedWorker && this.mabWorkerSelector) {
        this._populateWorkerSelector();
      }
    } else if (
      this.mabArmChart &&
      this.selectedWorkerForMabChart === null &&
      this.workers.length === 0
    ) {
      this._initMabArmChart();
    }
  }

  simulateStep(timeStep) {
    if (!this.validInitialization || this.simulationEnding) return;
    this.time += timeStep;
    this.timeSinceLastAuction += timeStep;
    if (
      !this.allJobsCreated &&
      this.jobCounter < this.currentMaxJobs &&
      Math.random() <
        CONFIG.JOB_CREATION_PROBABILITY *
          timeStep *
          (CONFIG.JOB_SPAWN_RATE_MULTIPLIER || 1)
    ) {
      this.spawnNewJob();
    }
    if (this.timeSinceLastAuction >= this.auctionInterval) {
      this.runAuctionRound();
      this.timeSinceLastAuction = 0.0;
    }
    this.updateWorkers(timeStep);
    if (
      this.allJobsCreated &&
      this.jobs.filter((job) => !job.completed && !job.timedOut).length === 0
    ) {
      if (!this.simulationEnding) {
        const logMsg = `TÜM İŞLER (${this.completedJobs.length}/${this.currentMaxJobs} tamamlandı) YA DA KALANLAR ZAMAN AŞIMINA UĞRADI! Simülasyon durduruluyor.`;
        console.log(logMsg);
        this.addAuctionLog(logMsg);
        this.simulationEnding = true;
      }
    }
    this._updateChartData();
    this.updateInfoPanel();
  }

  addAuctionLog(message) {
    if (!this.auctionLogPanel || !this.validInitialization) return;
    const logEntry = document.createElement("p");
    logEntry.textContent = message;
    this.auctionLogPanel.appendChild(logEntry);
    this.auctionLogPanel.scrollTop = this.auctionLogPanel.scrollHeight;
  }

  updateInfoPanel() {
    if (!this.infoPanelIds || !this.validInitialization) return;
    try {
      document.getElementById(this.infoPanelIds.time).textContent =
        this.time.toFixed(1);
      document.getElementById(this.infoPanelIds.jobsCreated).textContent =
        this.jobCounter;
      document.getElementById(this.infoPanelIds.maxJobs).textContent =
        this.currentMaxJobs;
      document.getElementById(this.infoPanelIds.jobsCompleted).textContent =
        this.completedJobs.length;
      const totalEarnings = this.workers.reduce(
        (sum, w) => sum + w.earnings,
        0
      );
      document.getElementById(this.infoPanelIds.totalEarnings).textContent =
        totalEarnings.toFixed(0);
    } catch (e) {
      console.warn("Info panel error:", e);
    }
  }

  draw() {
    if (!this.validInitialization) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const job of this.jobs) {
      job.draw(this.ctx);
    }
    for (const worker of this.workers) {
      worker.draw(this.ctx);
    }
  }

  loop() {
    if (!this.isRunning) return;
    this.simulateStep(CONFIG.TIME_STEP);
    this.draw();
    if (this.simulationEnding && this.isRunning) {
      this.pause();
      this.addAuctionLog("Simülasyon bitti ve duraklatıldı.");
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  start() {
    if (!this.validInitialization) {
      console.error("Simülasyon başlatılamadı: Geçersiz başlatma.");
      return;
    }
    if (this.simulationEnding) {
      this.addAuctionLog("Simülasyon bitmiş. Sıfırlayın.");
      return;
    }
    if (!this.isRunning) {
      this.isRunning = true;
      this.addAuctionLog("Simülasyon başlatılıyor...");
      console.log("Simülasyon başlatılıyor.");
      this.loop();
    } else {
      this.addAuctionLog("Simülasyon zaten çalışıyor.");
    }
  }

  pause() {
    if (this.isRunning) {
      this.isRunning = false;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.addAuctionLog("Simülasyon duraklatıldı.");
      console.log("Simülasyon duraklatıldı.");
    }
  }
}
