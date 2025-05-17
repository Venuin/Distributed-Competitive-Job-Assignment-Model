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
        `Canvas element with ID "${canvasId}" not found! Simulation cannot start.`
      );
      this.validInitialization = false;
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.validInitialization = true;

    this.chartCanvas = document.getElementById(chartCanvasId);
    if (!this.chartCanvas) {
      console.warn(
        `Chart canvas element with ID "${chartCanvasId}" not found! Chart will not be displayed.`
      );
    }
    this.infoPanelIds = infoPanelIds;
    this.auctionLogPanel = document.getElementById("auctionLogPanel");

    this.workers = [];
    this.jobs = [];
    this.completedJobs = [];
    this.jobHistory = [];
    this.time = 0.0;
    this.jobCounter = 0;
    this.allJobsCreated = false;

    this.animationFrameId = null;
    this.isRunning = false;
    this.simulationEnding = false;

    this.currentNumWorkers = CONFIG.NUM_WORKERS;
    this.currentMaxJobs = CONFIG.MAX_JOBS;

    this.auctionInterval = CONFIG.AUCTION_INTERVAL || 5.0;
    this.timeSinceLastAuction = 0.0;

    this.earningsChart = null;
  }

  _initChart() {
    if (!this.chartCanvas || !this.validInitialization) return;

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
            label: "Kazançlar",
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
            suggestedMax: Math.max(100, ...earningsData),
          },
        },
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
      },
    });
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
        new Worker(
          i,
          Math.random() * this.canvas.width,
          Math.random() * this.canvas.height,
          CONFIG.BASE_WORKER_SPEED,
          CONFIG.BASE_WORKER_COST,
          this.canvas.width,
          this.canvas.height
        )
      );
    }

    this.jobs = [];
    this.completedJobs = [];
    this.jobHistory = [];
    this.time = 0.0;
    this.jobCounter = 0;
    this.allJobsCreated = false;
    this.simulationEnding = false;
    this.isRunning = false;
    this.timeSinceLastAuction = 0.0;

    const initialJobs = Math.max(1, Math.floor(0.2 * this.currentMaxJobs));
    for (let i = 0; i < initialJobs; i++) {
      this.spawnNewJob();
    }

    this._initChart();
    this.draw();
    this.updateInfoPanel();
    this.addAuctionLog("Simülasyon ayarları uygulandı ve sıfırlandı.");
  }

  spawnNewJob() {
    if (!this.validInitialization) return null;
    if (this.jobCounter < this.currentMaxJobs) {
      const padding = 10;
      const newJobX = Math.max(
        padding,
        Math.min(this.canvas.width - padding, Math.random() * this.canvas.width)
      );
      const newJobY = Math.max(
        padding,
        Math.min(
          this.canvas.height - padding,
          Math.random() * this.canvas.height
        )
      );

      const newJob = new Job(this.jobCounter, newJobX, newJobY, this.time);
      newJob.duration = CONFIG.JOB_FIXED_DURATION;
      this.jobs.push(newJob);
      this.jobCounter++;
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

  assignJobToWorker(job, worker, bid) {
    job.assignedWorkerId = worker.id;
    job.winningBid = bid;
    job.estimatedTravelTime = this.calculateJobTravelTime(worker, job);
    job.startTime = null;
    job.progress = 0;

    worker.assigned_jobs.push({
      jobId: job.id,
      startTime: null,
      duration: job.duration,
      winningBid: bid,
      targetX: job.x,
      targetY: job.y,
    });
    worker.available = false;
    worker.path = [{ x: job.x, y: job.y }];
  }

  runAuctionRound() {
    if (!this.validInitialization) return;
    this.addAuctionLog("--- Yeni İhale Turu Başladı ---");

    const openForBiddingJobs = this.jobs.filter(
      (job) => !job.completed && job.assignedWorkerId === null
    );
    if (openForBiddingJobs.length === 0) {
      this.addAuctionLog("Teklif verilecek açık iş bulunmuyor.");
      return;
    }
    this.addAuctionLog(
      `Açık İşler (${openForBiddingJobs.length}): ${openForBiddingJobs
        .map((j) => `J${j.id}`)
        .join(", ")}`
    );

    const availableWorkers = this.workers.filter((w) => w.available);
    if (availableWorkers.length === 0) {
      this.addAuctionLog("Teklif verecek uygun işçi bulunmuyor.");
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
      if (choice) {
        potentialBids.push({ worker, job: choice.job, bid: choice.bid });
      }
    }

    if (potentialBids.length === 0) {
      this.addAuctionLog("Hiçbir işçi bu turda teklif vermedi.");
      return;
    }

    const bidsByJob = {};
    for (const pb of potentialBids) {
      if (!bidsByJob[pb.job.id]) {
        bidsByJob[pb.job.id] = [];
      }
      bidsByJob[pb.job.id].push({
        workerId: pb.worker.id,
        worker: pb.worker,
        bid: pb.bid,
      });
    }

    let jobsAssignedThisRoundCount = 0;
    let assignedDetailsLogArray = [];

    for (const jobIdStr in bidsByJob) {
      const jobId = parseInt(jobIdStr);
      const job = this.jobs.find((j) => j.id === jobId);
      if (!job || job.assignedWorkerId !== null || job.completed) continue;

      const jobBids = bidsByJob[jobIdStr];
      jobBids.sort((a, b) => a.bid - b.bid);

      let bidsDetailMsg =
        `J${job.id} teklifleri: ` +
        jobBids.map((b) => `W${b.workerId}(${b.bid.toFixed(0)})`).join("; ");
      this.addAuctionLog(bidsDetailMsg);

      let assignedThisJob = false;
      for (const bestBid of jobBids) {
        if (bestBid.worker.available) {
          this.assignJobToWorker(job, bestBid.worker, bestBid.bid);
          assignedDetailsLogArray.push(
            `J${job.id} -> W${bestBid.worker.id} (Teklif: ${bestBid.bid.toFixed(
              0
            )})`
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
        const job = this.jobs.find((j) => j.id === currentAssignment.jobId);

        if (!job) {
          console.warn(
            `İşçi ${worker.id} için atanan J${currentAssignment.jobId} bulunamadı. Atama kaldırılıyor.`
          );
          worker.assigned_jobs.shift();
          worker.available = worker.assigned_jobs.length === 0;
          worker.path = [];
          continue;
        }

        if (job.completed) {
          if (
            worker.assigned_jobs.some((assigned) => assigned.jobId === job.id)
          ) {
            worker.assigned_jobs = worker.assigned_jobs.filter(
              (assigned) => assigned.jobId !== job.id
            );
            worker.available = worker.assigned_jobs.length === 0;
            if (worker.assigned_jobs.length > 0) {
              const nextAssignment = worker.assigned_jobs[0];
              const nextJobToAssign = this.jobs.find(
                (j) => j.id === nextAssignment.jobId
              );
              if (nextJobToAssign)
                worker.path = [{ x: nextJobToAssign.x, y: nextJobToAssign.y }];
            } else {
              worker.path = [];
            }
          }
          continue;
        }

        const targetX = currentAssignment.targetX;
        const targetY = currentAssignment.targetY;
        const arrivalTolerance = 1.0;

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
          }

          if (job.startTime !== null) {
            const elapsedTimeOnJob = this.time - job.startTime;
            if (job.duration > 0) {
              job.progress = Math.min(elapsedTimeOnJob / job.duration, 1.0);
            } else {
              job.progress = 1.0;
              if (!job.completed)
                console.warn(`J${job.id} süresi <= 0. Otomatik tamamlanıyor.`);
            }

            if (job.progress >= 1.0) {
              if (!job.completed) {
                job.completed = true;
                if (!this.completedJobs.find((cj) => cj.id === job.id)) {
                  this.completedJobs.push(job);
                }
                worker.earnings += currentAssignment.winningBid;
                // this.addAuctionLog(`İŞ TAMAMLANDI: J${job.id} (İşçi: W${worker.id})`);

                worker.assigned_jobs.shift();
                worker.available = worker.assigned_jobs.length === 0;

                if (worker.assigned_jobs.length > 0) {
                  const nextAssignment = worker.assigned_jobs[0];
                  const nextJobToAssign = this.jobs.find(
                    (j) => j.id === nextAssignment.jobId
                  );
                  if (nextJobToAssign) {
                    worker.path = [
                      { x: nextJobToAssign.x, y: nextJobToAssign.y },
                    ];
                  }
                } else {
                  worker.path = [];
                }
              }
            }
          }
        }
      }
    }
  }

  simulateStep(timeStep) {
    if (!this.validInitialization || this.simulationEnding) {
      return;
    }

    this.time += timeStep;
    this.timeSinceLastAuction += timeStep;

    if (
      !this.allJobsCreated &&
      Math.random() <
        CONFIG.JOB_CREATION_PROBABILITY *
          timeStep *
          (CONFIG.JOB_SPAWN_RATE_MULTIPLIER || 10)
    ) {
      this.spawnNewJob();
    }

    this.updateWorkers(timeStep);

    if (this.timeSinceLastAuction >= this.auctionInterval) {
      this.runAuctionRound();
      this.timeSinceLastAuction = 0.0;
    }

    if (
      this.allJobsCreated &&
      this.completedJobs.length >= this.currentMaxJobs
    ) {
      if (!this.simulationEnding) {
        const logMsg = `TÜM İŞLER (${this.completedJobs.length}/${this.currentMaxJobs}) OLUŞTURULDU VE TAMAMLANDI! Simülasyon durduruluyor.`;
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
    const timestamp = `[${this.time.toFixed(1)}] `;
    logEntry.textContent = timestamp + message;

    this.auctionLogPanel.appendChild(logEntry);
  }

  _updateChartData() {
    if (!this.chartCanvas || !this.validInitialization) return;
    if (this.earningsChart && this.workers.length >= 0) {
      this.earningsChart.data.labels = this.workers.map((w) => `W${w.id}`);
      this.earningsChart.data.datasets[0].data = this.workers.map(
        (w) => w.earnings
      );

      this.earningsChart.data.datasets[0].backgroundColor = this.workers.map(
        (w) => {
          const baseColor = w.color || "rgba(54, 162, 235, 1)";
          const alpha = w.available ? "0.6" : "0.9";
          if (baseColor.startsWith("rgba")) {
            return baseColor.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
          } else if (baseColor.startsWith("rgb")) {
            return baseColor.replace("rgb", "rgba").replace(")", `, ${alpha})`);
          }
          return baseColor;
        }
      );
      this.earningsChart.data.datasets[0].borderColor = this.workers.map((w) =>
        w.color
          ? w.color.replace(/rgba?\(([^)]+)(?:,\s*[\d.]+)?\)/, `rgba($1, 1)`)
          : "rgba(54, 162, 235, 1)"
      );
      this.earningsChart.update("none");
    }
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
      console.warn("Info panel elemanları güncellenirken hata oluştu:", e);
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
    if (!this.isRunning) {
      return;
    }
    this.simulateStep(CONFIG.TIME_STEP);
    this.draw();

    if (this.simulationEnding) {
      this.stop();
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  start() {
    if (!this.validInitialization) {
      console.error("Simülasyon başlatılamadı: Geçersiz başlatma durumu.");
      return;
    }
    if (!this.isRunning) {
      this.isRunning = true;
      this.simulationEnding = false;
      console.log("Simülasyon başlatılıyor.");
      this.loop();
    } else {
      console.warn("Simülasyon zaten çalışıyor.");
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log("Simülasyon durduruldu.");
  }

  pause() {
    this.stop();
  }
}
