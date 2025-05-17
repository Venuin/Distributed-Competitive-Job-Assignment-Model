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
  }

  _initChart() {
    if (
      !this.chartCanvas ||
      !this.validInitialization ||
      typeof Chart === "undefined"
    ) {
      if (this.chartCanvas && typeof Chart === "undefined") {
        console.warn("Chart.js kütüphanesi bulunamadı. Grafik çizilemeyecek.");
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
              return baseColor; // hsl renkleri için alpha doğrudan değiştirilmiyor
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

    const initialJobsToCreate = Math.max(
      1,
      Math.min(this.currentMaxJobs, Math.floor(0.2 * this.currentMaxJobs))
    );
    for (let i = 0; i < initialJobsToCreate; i++) {
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

  assignJobToWorker(job, worker, bidAmount) {
    job.assignedWorkerId = worker.id;
    job.winningBid = bidAmount;
    job.estimatedTravelTime = this.calculateJobTravelTime(worker, job);
    job.startTime = null;
    job.progress = 0;

    worker.assigned_jobs.push({
      jobId: job.id,
      startTime: null,
      duration: job.duration,
      winningBid: bidAmount,
      targetX: job.x,
      targetY: job.y,
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

    this.checkJobTimeouts(); // İhale başlamadan önce zaman aşımı kontrolü

    this.addAuctionLog(
      `--- ${this.time.toFixed(1)}s: Yeni İhale Turu Başladı ---`
    );

    const openForBiddingJobs = this.jobs.filter(
      (job) => !job.completed && job.assignedWorkerId === null && !job.timedOut
    );

    if (openForBiddingJobs.length === 0) {
      this.addAuctionLog(
        "Teklif verilecek açık iş bulunmuyor (zaman aşımı sonrası kontrol)."
      );
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
      if (choice && choice.job && isFinite(choice.bid) && choice.bid > 0) {
        potentialBids.push({
          worker: worker,
          job: choice.job,
          bid: choice.bid,
        });
        this.addAuctionLog(
          `W${worker.id} -> J${
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
      if (!bidsByJob[pb.job.id]) {
        bidsByJob[pb.job.id] = [];
      }
      bidsByJob[pb.job.id].push({ worker: pb.worker, bid: pb.bid });
    }

    let jobsAssignedThisRoundCount = 0;
    const assignedDetailsLogArray = [];

    for (const jobIdStr in bidsByJob) {
      const jobId = parseInt(jobIdStr);
      const job = this.jobs.find((j) => j.id === jobId); // Job nesnesini this.jobs'dan bul

      if (
        !job ||
        job.assignedWorkerId !== null ||
        job.completed ||
        job.timedOut
      ) {
        continue;
      }

      const jobBids = bidsByJob[jobIdStr];
      jobBids.sort((a, b) => a.bid - b.bid);

      let bidsDetailMsg = `J${job.id} (R:${job.baseRevenue.toFixed(
        0
      )}) teklifleri: `;
      bidsDetailMsg += jobBids
        .map((b) => `W${b.worker.id}(${b.bid.toFixed(0)})`)
        .join("; ");
      this.addAuctionLog(bidsDetailMsg);

      let assignedThisJob = false;
      for (const bestBidEntry of jobBids) {
        if (bestBidEntry.worker.available) {
          this.assignJobToWorker(job, bestBidEntry.worker, bestBidEntry.bid);
          assignedDetailsLogArray.push(
            `J${job.id} -> W${
              bestBidEntry.worker.id
            } (Teklif: ${bestBidEntry.bid.toFixed(0)})`
          );
          jobsAssignedThisRoundCount++;
          assignedThisJob = true;
          break;
        }
      }
      if (!assignedThisJob && jobBids.length > 0) {
        this.addAuctionLog(
          `J${job.id} için kazanan atanamadı (teklif verenler meşgul olabilir veya teklifleri geçersiz).`
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
        // İşçinin atandığı işin hala this.jobs listesinde ve zaman aşımına uğramamış olduğunu kontrol et
        const job = this.jobs.find(
          (j) => j.id === currentAssignment.jobId && !j.timedOut && !j.completed
        );

        if (!job) {
          // console.warn(`W${worker.id}: Atanmış iş J${currentAssignment.jobId} bulunamadı, zaman aşımına uğradı veya zaten tamamlanmış. Atama kaldırılıyor.`);
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

        // İşin hedefine gitme mantığı
        const targetX = currentAssignment.targetX;
        const targetY = currentAssignment.targetY;
        const arrivalTolerance = 1.5 * worker.speed * timeStep;

        if (
          Utils.distance(worker.x, worker.y, targetX, targetY) >
          arrivalTolerance
        ) {
          worker.moveToTarget(timeStep);
        } else {
          // Hedefe varıldı
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
            if (job.duration > 0) {
              job.progress = Math.min(elapsedTimeOnJob / job.duration, 1.0);
            } else {
              job.progress = 1.0;
              if (!job.completed)
                console.warn(`J${job.id} süresi <= 0. Otomatik tamamlanıyor.`);
            }

            if (job.progress >= 1.0 && !job.completed) {
              job.completed = true;
              if (!this.completedJobs.find((cj) => cj.id === job.id)) {
                this.completedJobs.push(job);
              }
              worker.earnings += currentAssignment.winningBid;
              this.addAuctionLog(
                `İŞ TAMAMLANDI: J${job.id} (İşçi: W${
                  worker.id
                }, Kazanç: ${currentAssignment.winningBid.toFixed(
                  0
                )}, Toplam: ${worker.earnings.toFixed(0)})`
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
                    `W${worker.id}, sıradaki işi J${nextJobToAssign.id}'ye yöneliyor.`
                  );
                } else {
                  worker.available = true;
                  worker.path = [];
                  if (worker.available)
                    this.addAuctionLog(
                      `W${worker.id} uygun hale geldi (sırada iş yok/geçersiz).`
                    );
                }
              } else {
                worker.path = [];
                if (worker.available)
                  this.addAuctionLog(
                    `W${worker.id} uygun hale geldi (iş bitti).`
                  );
              }
            }
          }
        }
      } else {
        worker.available = true;
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
      this.jobCounter < this.currentMaxJobs &&
      Math.random() <
        CONFIG.JOB_CREATION_PROBABILITY *
          timeStep *
          (CONFIG.JOB_SPAWN_RATE_MULTIPLIER || 1)
    ) {
      this.spawnNewJob();
    }

    if (this.timeSinceLastAuction >= this.auctionInterval) {
      this.runAuctionRound(); // checkJobTimeouts() bunun içinde çağrılıyor
      this.timeSinceLastAuction = 0.0;
    }

    this.updateWorkers(timeStep);

    // Tüm işler oluşturulduysa VE aktif (tamamlanmamış VE zaman aşımına uğramamış) iş kalmadıysa
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
    //this.auctionLogPanel.scrollTop = this.auctionLogPanel.scrollHeight;
  }

  _updateChartData() {
    if (
      !this.earningsChart ||
      !this.validInitialization ||
      this.workers.length === 0
    )
      return;

    this.earningsChart.data.labels = this.workers.map((w) => `W${w.id}`);
    this.earningsChart.data.datasets[0].data = this.workers.map(
      (w) => w.earnings
    );
    this.earningsChart.data.datasets[0].backgroundColor = this.workers.map(
      (w) => {
        const baseColor = w.color || "rgba(54, 162, 235, 0.6)";
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
    const maxEarnings = Math.max(...this.workers.map((w) => w.earnings), 0);
    this.earningsChart.options.scales.y.suggestedMax = Math.max(
      100,
      maxEarnings + 20
    );
    this.earningsChart.update("none");
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
      // this.jobs artık zaman aşımına uğrayanları içermeyecek
      job.draw(this.ctx); // job.draw() metodu timedOut ise çizim yapmayacak
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

    if (this.simulationEnding && this.isRunning) {
      this.pause();
      this.addAuctionLog("Simülasyon bitti ve duraklatıldı.");
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  start() {
    if (!this.validInitialization) {
      console.error("Simülasyon başlatılamadı: Geçersiz başlatma durumu.");
      this.addAuctionLog("HATA: Simülasyon başlatılamadı (geçersiz durum).");
      return;
    }
    if (this.simulationEnding) {
      // Simülasyon bitmişse ve sıfırlanmamışsa tekrar başlatma
      this.addAuctionLog(
        "Simülasyon zaten bitmiş. Sıfırlayıp yeniden başlatın."
      );
      console.warn("Simülasyon bitmiş, başlatılamıyor. Sıfırlayın.");
      return;
    }
    if (!this.isRunning) {
      this.isRunning = true;
      // this.simulationEnding = false; // reset() içinde zaten false yapılıyor.
      this.addAuctionLog("Simülasyon başlatılıyor...");
      console.log("Simülasyon başlatılıyor.");
      this.loop();
    } else {
      console.warn("Simülasyon zaten çalışıyor.");
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
