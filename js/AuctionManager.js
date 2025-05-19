// js/AuctionManager.js
import { Utils } from "./utils.js";
import { CONFIG } from "./config.js"; // CONFIG'i import et

export class AuctionManager {
  constructor(simulationController) {
    this.sim = simulationController; // Ana SimulationController'a erişim için
    this.timeSinceLastAuction = 0.0;
  }

  reset() {
    this.timeSinceLastAuction = 0.0;
  }

  update(timeStep) {
    this.timeSinceLastAuction += timeStep;
    if (this.timeSinceLastAuction >= CONFIG.AUCTION_INTERVAL) {
      // CONFIG'den alınıyor
      this.runAuctionRound();
      this.timeSinceLastAuction = 0.0;
    }
  }

  calculateJobTravelTime(worker, job) {
    const distance = Utils.distance(worker.x, worker.y, job.x, job.y);
    return worker.speed > 0 ? distance / worker.speed : Infinity;
  }

  assignJobToWorker(job, worker, bidAmount, armKeyUsed) {
    job.assignedWorkerId = worker.id;
    job.winningBid = bidAmount;
    job.estimatedTravelTime = this.calculateJobTravelTime(worker, job);
    job.startTime = null; // İşe varınca set edilecek
    job.progress = 0;

    const distanceToJob = Utils.distance(worker.x, worker.y, job.x, job.y);
    const distanceCostForJob = distanceToJob * CONFIG.COST_PER_DISTANCE_UNIT; // CONFIG'den

    worker.assigned_jobs.push({
      jobId: job.id,
      startTime: null,
      duration: job.duration, // Bu, job nesnesinden gelir (CONFIG.JOB_FIXED_DURATION ile set edilir)
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
    const currentTime = this.sim.time;
    const newJobsList = [];
    let timedOutCount = 0;

    for (let i = 0; i < this.sim.jobs.length; i++) {
      const job = this.sim.jobs[i];
      if (job.assignedWorkerId === null && !job.completed && !job.timedOut) {
        if (currentTime - job.creationTime > CONFIG.JOB_TIMEOUT_DURATION) {
          // CONFIG'den
          job.timedOut = true;
          this.sim.chartManager.addAuctionLog(
            `ZAMAN AŞIMI: J${job.id} (R:${job.baseRevenue.toFixed(
              0
            )}) ${CONFIG.JOB_TIMEOUT_DURATION.toFixed(
              // CONFIG'den
              1 // Süreyi ondalıklı gösterebiliriz
            )}s boyunca atanmadığı için kaldırıldı.`
          );
          timedOutCount++;
        }
      }
      // Zaman aşımına uğramayan veya zaten atanmış/tamamlanmış işleri yeni listeye ekle
      if (!job.timedOut) {
        // Sadece zaman aşımına uğramayanları tut
        newJobsList.push(job);
      }
      // Not: Tamamlanmış işler zaten çizilmiyor ve worker'ın assigned_jobs listesinden çıkarılıyor.
      // Bu döngü, `this.sim.jobs` listesini temizlemek için.
    }

    if (timedOutCount > 0) {
      this.sim.jobs = newJobsList; // Simülasyonun ana iş listesini güncelle
    }
  }

  runAuctionRound() {
    this.checkJobTimeouts();
    this.sim.chartManager.addAuctionLog(
      // Loglama ChartManager üzerinden
      `--- Yeni İhale Turu Başladı ---` // Zaman damgası ChartManager.addAuctionLog içinde ekleniyor
    );

    const openForBiddingJobs = this.sim.jobs.filter(
      (job) => !job.completed && job.assignedWorkerId === null && !job.timedOut
    );

    if (openForBiddingJobs.length === 0) {
      this.sim.chartManager.addAuctionLog(
        "Teklif verilecek açık iş bulunmuyor."
      );
      this.sim.chartManager.addAuctionLog("--- İhale Turu Bitti ---");
      return;
    }
    this.sim.chartManager.addAuctionLog(
      `Açık İşler (${openForBiddingJobs.length}): ${openForBiddingJobs
        .map((j) => `J${j.id}(R:${j.baseRevenue.toFixed(0)})`)
        .join(", ")}`
    );

    const availableWorkers = this.sim.workers.filter((w) => w.available);
    if (availableWorkers.length === 0) {
      this.sim.chartManager.addAuctionLog(
        "Teklif verecek uygun işçi bulunmuyor."
      );
      this.sim.chartManager.addAuctionLog("--- İhale Turu Bitti ---");
      return;
    }
    this.sim.chartManager.addAuctionLog(
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
        choice.bid > 0 && // Teklif pozitif olmalı
        choice.armKey
      ) {
        potentialBids.push({
          worker: worker,
          job: choice.job,
          bid: choice.bid,
          armKey: choice.armKey,
        });
        this.sim.chartManager.addAuctionLog(
          `W${worker.id} (Kol:${choice.armKey}) -> J${
            choice.job.id
          } için potansiyel teklif: ${choice.bid.toFixed(
            0
          )} (İş Geliri: ${choice.job.baseRevenue.toFixed(0)})`
        );
      }
    }

    if (potentialBids.length === 0) {
      this.sim.chartManager.addAuctionLog(
        "Hiçbir işçi bu turda geçerli bir teklif vermedi."
      );
      this.sim.chartManager.addAuctionLog("--- İhale Turu Bitti ---");
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
          "AuctionManager: runAuctionRound içinde potansiyel teklifte geçersiz 'job' bulundu:",
          pb
        );
      }
    }

    let jobsAssignedThisRoundCount = 0;
    const assignedDetailsLogArray = [];

    for (const jobIdStr in bidsByJob) {
      const jobId = parseInt(jobIdStr);
      const job = this.sim.jobs.find((j) => j.id === jobId);

      if (
        !job ||
        job.assignedWorkerId !== null ||
        job.completed ||
        job.timedOut
      )
        continue;

      const jobBids = bidsByJob[jobIdStr];
      jobBids.sort((a, b) => a.bid - b.bid); // En düşük teklif önce gelir (ikinci fiyat ihalesi gibi değil, en düşük teklif kazanır mantığı)

      let bidsDetailMsg = `J${job.id} (R:${job.baseRevenue.toFixed(
        0
      )}) teklifleri: ${jobBids
        .map((b) => `W${b.worker.id}(${b.bid.toFixed(0)}, Kol:${b.armKey})`)
        .join("; ")}`;
      this.sim.chartManager.addAuctionLog(bidsDetailMsg);

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
        this.sim.chartManager.addAuctionLog(
          `J${job.id} için kazanan atanamadı (teklif verenler meşgul olabilir).`
        );
      }
    }
    if (jobsAssignedThisRoundCount > 0) {
      this.sim.chartManager.addAuctionLog(
        `Atanan İşler: ${assignedDetailsLogArray.join(" | ")}`
      );
    } else if (potentialBids.length > 0) {
      // Teklif vardı ama atama olmadıysa
      this.sim.chartManager.addAuctionLog(
        "Bu turda teklifler oldu ancak hiçbir iş atanamadı (örneğin, teklif veren tüm işçiler başka işlere atandı)."
      );
    }
    this.sim.chartManager.addAuctionLog("--- İhale Turu Bitti ---");
  }
}
