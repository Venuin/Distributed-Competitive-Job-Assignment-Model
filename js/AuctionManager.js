import { Utils } from "./utils.js";
import { CONFIG } from "./config.js";

export class AuctionManager {
  constructor(simulationController) {
    this.sim = simulationController;
    this.timeSinceLastAuction = 0.0;
  }

  reset() {
    this.timeSinceLastAuction = 0.0;
  }

  update(timeStep) {
    this.timeSinceLastAuction += timeStep;
    if (this.timeSinceLastAuction >= CONFIG.AUCTION_INTERVAL) {
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
    const currentTime = this.sim.time;
    const newJobsList = [];
    let timedOutCount = 0;

    for (let i = 0; i < this.sim.jobs.length; i++) {
      const job = this.sim.jobs[i];
      if (job.assignedWorkerId === null && !job.completed && !job.timedOut) {
        if (currentTime - job.creationTime > CONFIG.JOB_TIMEOUT_DURATION) {
          job.timedOut = true;
          this.sim.chartManager.addAuctionLog(
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
      this.sim.jobs = newJobsList;
    }
  }

  runAuctionRound() {
    this.checkJobTimeouts();
    this.sim.chartManager.addAuctionLog(`--- Yeni İhale Turu Başladı ---`);

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
        choice.bid > 0 &&
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
      jobBids.sort((a, b) => a.bid - b.bid);

      let bidsDetailMsg = `J${job.id} (R:${job.baseRevenue.toFixed(
        0
      )}) teklifleri: ${jobBids
        .map((b) => `W${b.worker.id}(${b.bid.toFixed(0)}, Kol:${b.armKey})`)
        .join("; ")}`;
      this.sim.chartManager.addAuctionLog(bidsDetailMsg);

      let assignedThisJob = false;
      let winningBidEntry = null;

      for (const currentBidEntry of jobBids) {
        if (currentBidEntry.worker.available) {
          this.assignJobToWorker(
            job,
            currentBidEntry.worker,
            currentBidEntry.bid,
            currentBidEntry.armKey
          );
          assignedDetailsLogArray.push(
            `J${job.id} -> W${
              currentBidEntry.worker.id
            } (Teklif: ${currentBidEntry.bid.toFixed(0)}, Kol:${
              currentBidEntry.armKey
            })`
          );
          jobsAssignedThisRoundCount++;
          assignedThisJob = true;
          winningBidEntry = currentBidEntry;
          break; // Bu iş için atama yapıldı, sonraki işe geç.
        }
      }

      // Eğer bir kazanan varsa, kaybedenlerin MAB istatistiklerini güncelle
      if (winningBidEntry) {
        for (const bidEntry of jobBids) {
          if (bidEntry.worker.id !== winningBidEntry.worker.id) {
            if (
              bidEntry.armKey &&
              bidEntry.worker.mabArmAuctionStats &&
              bidEntry.worker.mabArmAuctionStats[bidEntry.armKey]
            ) {
              bidEntry.worker.mabArmAuctionStats[bidEntry.armKey]
                .auctionsLost++;
              this.sim.chartManager.addAuctionLog(
                `W${bidEntry.worker.id}, J${job.id} için ihaleyi (Kol:${bidEntry.armKey}) kaybetti.`
              );
            }
          }
        }
      } else if (jobBids.length > 0 && !assignedThisJob) {
        // Teklifler vardı ama kazanan olmadı
        this.sim.chartManager.addAuctionLog(
          `J${job.id} için kazanan atanamadı (teklif verenler meşgul olabilir).`
        );
        for (const bidEntry of jobBids) {
          if (
            bidEntry.armKey &&
            bidEntry.worker.mabArmAuctionStats &&
            bidEntry.worker.mabArmAuctionStats[bidEntry.armKey]
          ) {
            bidEntry.worker.mabArmAuctionStats[bidEntry.armKey].auctionsLost++;
            this.sim.chartManager.addAuctionLog(
              `W${bidEntry.worker.id}, J${job.id} için verdiği teklif (Kol:${bidEntry.armKey}) sonuçsuz kaldı (kazanan yok).`
            );
          }
        }
      }
    }

    if (jobsAssignedThisRoundCount > 0) {
      this.sim.chartManager.addAuctionLog(
        `Atanan İşler: ${assignedDetailsLogArray.join(" | ")}`
      );
    } else if (potentialBids.length > 0) {
      this.sim.chartManager.addAuctionLog(
        "Bu turda teklifler oldu ancak hiçbir iş atanamadı."
      );
    }
    this.sim.chartManager.addAuctionLog("--- İhale Turu Bitti ---");
  }
}
