import { Utils } from "./utils.js";
import { CONFIG } from "./config.js";

export class Worker {
  constructor(id, x, y, speed, canvasWidth, canvasHeight) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Teklif hesaplaması için hedeflenen kâr yüzdesi
    this.targetProfitPercentageFromRemaining =
      CONFIG.DEFAULT_TARGET_PROFIT_PERCENTAGE;

    this.assigned_jobs = []; // { jobId, startTime, duration, winningBid, targetX, targetY, armKeyUsed, calculatedDistanceCost }
    this.earnings = 0.0; // Brüt kazanç (winningBid toplamı)
    this.totalNetProfit = 0.0; // Toplam net kâr
    this.available = true;
    this.path = [];
    this.color = `hsl(${Math.random() * 360}, 70%, 60%)`;

    this.mabArms = this._initializeMabArms();
    this.epsilon = CONFIG.MAB_EPSILON;
    this.mabArmAuctionStats = this._initializeMabArmAuctionStats();
  }

  _initializeMabArms() {
    const arms = {};
    const distances = ["near", "medium", "far"];
    const revenues = ["low", "medium", "high"];
    for (const d of distances) {
      for (const r of revenues) {
        arms[`${d}_${r}`] = {
          count: 0, // Bu kol kaç kere seçildi
          value: CONFIG.MAB_INITIAL_Q_VALUE, // Bu kolun ortalama ödülü (Q-değeri)
        };
      }
    }
    return arms;
  }

  // MAB kolu istatistikleri
  _initializeMabArmAuctionStats() {
    const stats = {};
    const distances = ["near", "medium", "far"];
    const revenues = ["low", "medium", "high"];
    for (const d of distances) {
      for (const r of revenues) {
        stats[`${d}_${r}`] = {
          auctionsWon: 0, // Bu kol kullanılarak kazanılan ihale sayısı
          auctionsLost: 0, // Bu kol kullanılarak teklif verilip kaybedilen ihale sayısı
        };
      }
    }
    return stats;
  }

  /**
   * @param {Job} job İş nesnesi.
   * @returns {string | null} İşin MAB kolu adı
   */
  _getJobCategory(job) {
    if (
      !job ||
      typeof job.baseRevenue === "undefined" ||
      job.baseRevenue <= 0
    ) {
      return null;
    }

    const distance = Utils.distance(this.x, this.y, job.x, job.y);
    let distCategory;
    if (distance <= CONFIG.MAB_DISTANCE_THRESHOLDS.NEAR) {
      distCategory = "near";
    } else if (distance <= CONFIG.MAB_DISTANCE_THRESHOLDS.MEDIUM) {
      distCategory = "medium";
    } else {
      distCategory = "far";
    }

    let revCategory;
    if (job.baseRevenue <= CONFIG.MAB_REVENUE_THRESHOLDS.LOW) {
      revCategory = "low";
    } else if (job.baseRevenue <= CONFIG.MAB_REVENUE_THRESHOLDS.MEDIUM) {
      revCategory = "medium";
    } else {
      revCategory = "high";
    }
    return `${distCategory}_${revCategory}`;
  }

  /**
   * @param {Job} job Teklif hesaplanacak iş nesnesi.
   * @returns {number} Hesaplanan teklif miktarı
   */
  _calculateBidForJob(job) {
    if (
      !job ||
      typeof job.baseRevenue === "undefined" ||
      job.baseRevenue <= 0
    ) {
      return Infinity;
    }

    const distance = Utils.distance(this.x, this.y, job.x, job.y);
    const distanceCost = distance * CONFIG.COST_PER_DISTANCE_UNIT;

    const remainingValueAfterDistanceCost = job.baseRevenue - distanceCost;

    const desiredProfitFromRemaining =
      remainingValueAfterDistanceCost *
      this.targetProfitPercentageFromRemaining;

    let workerBid = distanceCost + desiredProfitFromRemaining;
    workerBid = Math.max(CONFIG.MIN_POSSIBLE_BID, workerBid);

    return parseFloat(workerBid.toFixed(2));
  }

  /**
   * @param {Array<Job>} availableJobs Teklif verilebilecek işlerin listesi.
   * @returns {{job: Job, bid: number, armKey: string} | null} Seçilen iş, teklif ve kullanılan MAB kolu veya null.
   */
  selectJobAndCalculateBid(availableJobs) {
    if (!this.available || !availableJobs || availableJobs.length === 0) {
      return null;
    }

    const eligibleJobs = availableJobs.filter(
      (job) => job.assignedWorkerId === null && !job.completed && !job.timedOut
    );

    if (eligibleJobs.length === 0) {
      return null;
    }

    const activeArmsMap = new Map();
    for (const job of eligibleJobs) {
      const armKey = this._getJobCategory(job);
      if (armKey) {
        if (!activeArmsMap.has(armKey)) {
          activeArmsMap.set(armKey, []);
        }
        activeArmsMap.get(armKey).push(job);
      }
    }

    if (activeArmsMap.size === 0) {
      return null;
    }

    const activeArmKeys = Array.from(activeArmsMap.keys());
    let chosenArmKey;

    if (Math.random() < this.epsilon) {
      chosenArmKey =
        activeArmKeys[Math.floor(Math.random() * activeArmKeys.length)];
    } else {
      let bestArmKeyFromActive = null;
      let maxQValue = -Infinity;
      let allInitialOrUntried = true;

      for (const key of activeArmKeys) {
        const arm = this.mabArms[key];
        if (arm.value > maxQValue) {
          maxQValue = arm.value;
          bestArmKeyFromActive = key;
        }
        if (arm.count > 0 || arm.value !== CONFIG.MAB_INITIAL_Q_VALUE) {
          allInitialOrUntried = false;
        }
      }

      if (!bestArmKeyFromActive || allInitialOrUntried) {
        bestArmKeyFromActive =
          activeArmKeys[Math.floor(Math.random() * activeArmKeys.length)];
      }
      chosenArmKey = bestArmKeyFromActive;
    }

    if (!chosenArmKey) {
      return null;
    }

    const jobsInChosenArm = activeArmsMap.get(chosenArmKey);
    if (!jobsInChosenArm || jobsInChosenArm.length === 0) {
      return null;
    }

    let bestJobForArm = null;
    let highestPotentialNetProfitFromBid = -Infinity;
    let actualBidForBestJob = Infinity;

    for (const job of jobsInChosenArm) {
      const bid = this._calculateBidForJob(job);
      if (!isFinite(bid) || bid <= 0) {
        continue;
      }

      if (bid > job.baseRevenue) {
        continue;
      }

      const distance = Utils.distance(this.x, this.y, job.x, job.y);
      const distanceCost = distance * CONFIG.COST_PER_DISTANCE_UNIT;
      const potentialNetProfit = bid - distanceCost;

      if (potentialNetProfit > highestPotentialNetProfitFromBid) {
        highestPotentialNetProfitFromBid = potentialNetProfit;
        bestJobForArm = job;
        actualBidForBestJob = bid;
      }
    }

    if (bestJobForArm && highestPotentialNetProfitFromBid >= 0) {
      return {
        job: bestJobForArm,
        bid: actualBidForBestJob,
        armKey: chosenArmKey,
      };
    } else {
      return null;
    }
  }

  /**
   * @param {string} armKey Güncellenecek kolun adı
   * @param {number} reward Bu seçimden elde edilen ödül (net kâr)
   * @param {boolean} auctionWon İhale bu kol kullanılarak kazanıldı mı?
   */
  updateMabArm(armKey, reward, auctionWon) {
    if (this.mabArms[armKey]) {
      const arm = this.mabArms[armKey];

      if (auctionWon) {
        arm.count++;
        arm.value = arm.value + (1 / arm.count) * (reward - arm.value);
      }

      if (this.mabArmAuctionStats[armKey] && auctionWon) {
        this.mabArmAuctionStats[armKey].auctionsWon++;
      }
      // console.log(
      //   `W${this.id} MAB Güncelleme: Kol=${armKey}, Sayac=${
      //     arm.count
      //   }, Yeni Q-Değeri=${arm.value.toFixed(2)}, Ödül=${reward.toFixed(2)}, Kazanıldı: ${auctionWon}`
      // );
    } else {
      console.warn(
        `W${this.id}: Geçersiz MAB kolu güncellenmeye çalışıldı: ${armKey}`
      );
    }
  }

  /**
   * @returns {Object} { armKey: { value: number, count: number }, ... }
   */
  getMabArmData() {
    const armData = {};
    for (const key in this.mabArms) {
      armData[key] = {
        value: this.mabArms[key].value,
        count: this.mabArms[key].count,
      };
    }
    return armData;
  }

  /**
   * @returns {Object} { armKey: { auctionsWon: number, auctionsLost: number }, ... }
   */
  getMabArmAuctionStats() {
    return this.mabArmAuctionStats;
  }

  moveToTarget(timeStep) {
    if (this.path.length > 0) {
      const targetPos = this.path[0];
      const deltaX = targetPos.x - this.x;
      const deltaY = targetPos.y - this.y;
      const distanceToTargetPoint = Utils.distance(
        this.x,
        this.y,
        targetPos.x,
        targetPos.y
      );
      const travelDistanceInStep = this.speed * timeStep;

      if (distanceToTargetPoint <= travelDistanceInStep) {
        this.x = targetPos.x;
        this.y = targetPos.y;
      } else {
        const angle = Math.atan2(deltaY, deltaX);
        this.x += Math.cos(angle) * travelDistanceInStep;
        this.y += Math.sin(angle) * travelDistanceInStep;
      }
    }
    // Sınır kontrolü
    this.x = Math.max(0, Math.min(this.canvasWidth, this.x));
    this.y = Math.max(0, Math.min(this.canvasHeight, this.y));
  }

  draw(ctx) {
    const workerRadius = 7;
    ctx.beginPath();
    ctx.arc(this.x, this.y, workerRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.available ? this.color : "rgba(220, 50, 50, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "bold 8px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`W${this.id}`, this.x, this.y);

    if (
      !this.available &&
      this.path.length > 0 &&
      this.assigned_jobs.length > 0
    ) {
      const currentAssignment = this.assigned_jobs[0];
      if (
        currentAssignment &&
        typeof currentAssignment.targetX !== "undefined" &&
        typeof currentAssignment.targetY !== "undefined"
      ) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(currentAssignment.targetX, currentAssignment.targetY);
        ctx.strokeStyle = "rgba(100, 100, 100, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}
