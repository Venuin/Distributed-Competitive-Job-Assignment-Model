// js/SimulationController.js
import { Worker } from "./worker.js";
import { Job } from "./job.js";
import { Utils } from "./utils.js";
import { CONFIG } from "./config.js"; // CONFIG'i import ediyoruz
import { ChartManager } from "./ChartManager.js";
import { AuctionManager } from "./AuctionManager.js";

export class SimulationController {
  constructor(canvasId, infoPanelIds) {
    // chartCanvasId parametresine gerek yok, ChartManager kendi ID'sini bilir
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

    this.infoPanelIds = infoPanelIds;

    this.chartManager = new ChartManager(this);
    this.auctionManager = new AuctionManager(this);

    this.workers = [];
    this.jobs = [];
    this.completedJobs = [];
    this.time = 0.0;
    this.jobCounter = 0;
    this.allJobsCreated = false;

    this.animationFrameId = null;
    this.isRunning = false;
    this.simulationEnding = false;

    // currentNumWorkers ve currentMaxJobs reset metodunda CONFIG'den alınacak.
    // Bu yüzden constructor'da başlangıç atamasına gerek yok.
    // this.currentNumWorkers = CONFIG.NUM_WORKERS;
    // this.currentMaxJobs = CONFIG.MAX_JOBS;
  }

  reset(numWorkers, maxJobs) {
    // Sadece temel parametreler, diğerleri CONFIG'den
    if (!this.validInitialization) return;
    this.pause();

    // numWorkers ve maxJobs parametreleri main.js'deki slider'lardan geliyor.
    // Diğer ayarlar (JOB_SPAWN_RATE_MULTIPLIER vb.) zaten main.js'de CONFIG nesnesine yazıldı.
    this.currentNumWorkers = parseInt(numWorkers, 10);
    this.currentMaxJobs = parseInt(maxJobs, 10);

    this.chartManager.clearAuctionLog();
    this.chartManager.addAuctionLog(
      `Simülasyon sıfırlanıyor: ${this.currentNumWorkers} işçi, ${this.currentMaxJobs} maks. iş.`
    );
    this.chartManager.addAuctionLog(
      `Ayarlar: İş Hızı Çarpanı: ${CONFIG.JOB_SPAWN_RATE_MULTIPLIER.toFixed(
        1
      )}, Zaman Aşımı: ${CONFIG.JOB_TIMEOUT_DURATION.toFixed(
        0
      )}s, İş Süresi: ${CONFIG.JOB_FIXED_DURATION.toFixed(0)}s`
    );

    this.workers = [];
    for (let i = 0; i < this.currentNumWorkers; i++) {
      this.workers.push(
        new Worker(
          i,
          Math.random() * this.canvas.width,
          Math.random() * this.canvas.height,
          CONFIG.BASE_WORKER_SPEED, // CONFIG'den
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

    this.auctionManager.reset();

    if (this.workers.length > 0) {
      this.chartManager.setSelectedWorkerForMabChart(
        this.workers[0].id.toString()
      );
    } else {
      this.chartManager.setSelectedWorkerForMabChart(null);
    }
    this.chartManager.initCharts();

    const initialJobsToCreate = Math.max(
      1,
      Math.min(this.currentMaxJobs, Math.floor(0.1 * this.currentMaxJobs))
    );
    for (let i = 0; i < initialJobsToCreate; i++) {
      this.spawnNewJob();
    }

    this.draw();
    this.chartManager.updateInfoPanel();
    this.chartManager.addAuctionLog(
      "Simülasyon ayarları uygulandı ve sıfırlandı."
    );
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

      newJob.duration = CONFIG.JOB_FIXED_DURATION; // CONFIG'den
      newJob.baseRevenue =
        Math.random() *
          (CONFIG.MAX_REVENUE_FOR_JOB_SPAWN - // CONFIG'den
            CONFIG.MIN_REVENUE_FOR_JOB_SPAWN) + // CONFIG'den
        CONFIG.MIN_REVENUE_FOR_JOB_SPAWN; // CONFIG'den

      this.jobs.push(newJob);
      this.jobCounter++;
      this.chartManager.addAuctionLog(
        `Yeni iş oluşturuldu: J${
          newJob.id
        } (Gelir: ${newJob.baseRevenue.toFixed(
          0
        )}, Süre: ${newJob.duration.toFixed(1)}s)`
      );

      if (this.jobCounter >= this.currentMaxJobs) {
        this.allJobsCreated = true;
        this.chartManager.addAuctionLog(
          `Tanımlanan tüm işler (${this.currentMaxJobs}) oluşturuldu.`
        );
      }
      return newJob;
    }
    return null;
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
          worker.assigned_jobs.shift();
          worker.available = worker.assigned_jobs.length === 0;
          worker.path = [];
          if (worker.available && worker.assigned_jobs.length === 0) {
            this.chartManager.addAuctionLog(
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
            this.chartManager.addAuctionLog(
              `W${worker.id}, J${job.id}'ye başladı.`
            );
          }

          if (job.startTime !== null) {
            const elapsedTimeOnJob = this.time - job.startTime;
            if (job.duration > 0) {
              job.progress = Math.min(elapsedTimeOnJob / job.duration, 1.0);
            } else {
              job.progress = 1.0;
              if (!job.completed)
                console.warn(`J${job.id} süresi <= 0, anında tamamlandı.`);
            }

            if (job.progress >= 1.0 && !job.completed) {
              job.completed = true;
              if (!this.completedJobs.find((cj) => cj.id === job.id)) {
                this.completedJobs.push(job);
              }

              worker.earnings += currentAssignment.winningBid;

              const netProfitForThisJob =
                currentAssignment.winningBid -
                currentAssignment.calculatedDistanceCost;

              worker.totalNetProfit += netProfitForThisJob;

              if (
                currentAssignment.armKeyUsed &&
                typeof worker.updateMabArm === "function"
              ) {
                worker.updateMabArm(
                  currentAssignment.armKeyUsed,
                  netProfitForThisJob
                );
              }

              this.chartManager.addAuctionLog(
                `İŞ TAMAMLANDI: J${job.id} (W${
                  worker.id
                }, Teklif: ${currentAssignment.winningBid.toFixed(
                  0
                )}, Net Kâr: ${netProfitForThisJob.toFixed(0)}, MAB Kolu: ${
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
                  this.chartManager.addAuctionLog(
                    `W${worker.id}, sıradaki iş J${nextJobToAssign.id}'ye yöneliyor.`
                  );
                } else {
                  worker.available = true;
                  worker.path = [];
                  this.chartManager.addAuctionLog(
                    `W${worker.id} uygun (sırada bekleyen iş J${nextAssignment.jobId} geçersiz/bulunamadı).`
                  );
                }
              } else {
                worker.path = [];
                this.chartManager.addAuctionLog(
                  `W${worker.id} uygun (tüm atanmış işler bitti).`
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
    if (!this.validInitialization || this.simulationEnding) return;

    this.time += timeStep;

    if (
      !this.allJobsCreated &&
      this.jobCounter < this.currentMaxJobs && // this.currentMaxJobs kullanılmalı
      Math.random() <
        CONFIG.JOB_CREATION_PROBABILITY *
          timeStep *
          (CONFIG.JOB_SPAWN_RATE_MULTIPLIER || 1) // CONFIG'den
    ) {
      this.spawnNewJob();
    }

    this.auctionManager.update(timeStep);
    this.updateWorkers(timeStep);

    if (
      this.allJobsCreated &&
      this.jobs.filter((job) => !job.completed && !job.timedOut).length === 0
    ) {
      if (!this.simulationEnding) {
        const logMsg = `TÜM İŞLER (${this.completedJobs.length}/${this.currentMaxJobs} tamamlandı) YA DA KALANLAR ZAMAN AŞIMINA UĞRADI! Simülasyon durduruluyor.`;
        console.log(logMsg);
        this.chartManager.addAuctionLog(logMsg);
        this.simulationEnding = true;
      }
    }

    this.chartManager.updateChartData();
    this.chartManager.updateInfoPanel();
  }

  draw() {
    if (!this.validInitialization) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const job of this.jobs) {
      if (!job.completed && !job.timedOut) {
        job.draw(this.ctx);
      }
    }
    for (const worker of this.workers) {
      worker.draw(this.ctx);
    }
  }

  loop() {
    if (!this.isRunning) return;

    this.simulateStep(CONFIG.TIME_STEP); // CONFIG'den
    this.draw();

    if (this.simulationEnding && this.isRunning) {
      this.pause();
      this.chartManager.addAuctionLog("Simülasyon bitti ve duraklatıldı.");
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  start() {
    if (!this.validInitialization) {
      console.error("Simülasyon başlatılamadı: Geçersiz başlatma.");
      this.chartManager.addAuctionLog("HATA: Simülasyon başlatılamadı.");
      return;
    }
    if (this.simulationEnding) {
      this.chartManager.addAuctionLog("Simülasyon bitmiş. Lütfen sıfırlayın.");
      return;
    }
    if (!this.isRunning) {
      this.isRunning = true;
      this.chartManager.addAuctionLog("Simülasyon başlatılıyor...");
      console.log("Simülasyon başlatılıyor.");
      this.loop();
    } else {
      this.chartManager.addAuctionLog("Simülasyon zaten çalışıyor.");
    }
  }

  pause() {
    if (this.isRunning) {
      this.isRunning = false;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.chartManager.addAuctionLog("Simülasyon duraklatıldı.");
      console.log("Simülasyon duraklatıldı.");
    }
  }
}
