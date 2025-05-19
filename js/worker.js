// js/worker.js
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
    this.totalNetProfit = 0.0; // Toplam net kâr (SimulationController'da güncellenecek)
    this.available = true;
    this.path = [];
    this.color = `hsl(${Math.random() * 360}, 70%, 60%)`;

    // MAB Değişkenleri
    this.mabArms = this._initializeMabArms();
    this.epsilon = CONFIG.MAB_EPSILON;
  }

  _initializeMabArms() {
    const arms = {};
    const distances = ["near", "medium", "far"];
    const revenues = ["low", "medium", "high"];
    for (const d of distances) {
      for (const r of revenues) {
        arms[`${d}_${r}`] = {
          count: 0, // Bu kol kaç kere seçildi (ve bir sonuç verdi)
          value: CONFIG.MAB_INITIAL_Q_VALUE, // Bu kolun ortalama ödülü (Q-değeri)
        };
      }
    }
    return arms;
  }

  /**
   * Bir işi mesafe ve gelirine göre MAB kategorisine atar.
   * @param {Job} job İş nesnesi.
   * @returns {string | null} İşin MAB kolu adı (örn: "near_high") veya null (eğer kategorize edilemezse).
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
   * Belirli bir iş için teklif miktarını hesaplar.
   * @param {Job} job Teklif hesaplanacak iş nesnesi.
   * @returns {number} Hesaplanan teklif miktarı veya teklif verilemiyorsa Infinity.
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

    // Kalan değer üzerinden hedeflenen kârı hesapla.
    // targetProfitPercentageFromRemaining 0 ile 1 arasında bir değer olmalı.
    // Eğer negatif bir remainingValue varsa, desiredProfit da negatif olur,
    // bu da workerBid'in distanceCost'tan daha düşük olmasına yol açabilir.
    // Bu durum, işin kendisinin maliyetini bile karşılamadığı anlamına gelir.
    // Bu tür işlere teklif vermemek veya maliyeti yansıtacak şekilde teklif vermek
    // stratejiye bağlıdır. Mevcut durumda, teklif potansiyel olarak zararına olabilir.
    const desiredProfitFromRemaining =
      remainingValueAfterDistanceCost *
      this.targetProfitPercentageFromRemaining;

    let workerBid = distanceCost + desiredProfitFromRemaining;

    // Teklif, tanımlanmış minimum bir değerden düşük olamaz.
    workerBid = Math.max(CONFIG.MIN_POSSIBLE_BID, workerBid);

    // Teklif, işin temel gelirini aşmamalıdır (bu bir ikinci kontrol, genellikle
    // targetProfitPercentageFromRemaining < 1 ise zaten sağlanır, ama garanti için eklenebilir).
    // workerBid = Math.min(workerBid, job.baseRevenue);

    return parseFloat(workerBid.toFixed(2));
  }

  /**
   * MAB (Epsilon-Greedy) kullanarak bir iş kategorisi seçer,
   * bu kategoriye uyan ve en iyi potansiyel net kârı sunan işe teklif verir.
   * @param {Array<Job>} availableJobs Teklif verilebilecek işlerin listesi.
   * @returns {{job: Job, bid: number, armKey: string} | null} Seçilen iş, teklif ve kullanılan MAB kolu, veya null.
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
      // console.log(`W${this.id}: Hiçbir uygun iş MAB kategorisine atanamadı.`);
      return null;
    }

    const activeArmKeys = Array.from(activeArmsMap.keys());
    let chosenArmKey;

    if (Math.random() < this.epsilon) {
      chosenArmKey =
        activeArmKeys[Math.floor(Math.random() * activeArmKeys.length)];
      // console.log(`W${this.id} MAB: Keşif (aktiflerden) -> ${chosenArmKey}`);
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
        // console.log(
        //   `W${this.id} MAB: Sömürü (aktiflerde Q eşit/başlangıç/denenmemiş) -> Rastgele ${bestArmKeyFromActive} ${allInitialOrUntried}`
        // );
      } else {
        // console.log(
        //   `W${
        //     this.id
        //   } MAB: Sömürü (aktiflerden) -> ${bestArmKeyFromActive} (Q=${maxQValue.toFixed(
        //     2
        //   )})`
        // );
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
    let highestPotentialNetProfitFromBid = -Infinity; // Tekliften hesaplanan potansiyel net kâr
    let actualBidForBestJob = Infinity;

    for (const job of jobsInChosenArm) {
      const bid = this._calculateBidForJob(job);
      if (!isFinite(bid) || bid <= 0) {
        continue;
      }

      // Teklifin işin gelirini aşmamasını kontrol et. Eğer aşarsa, bu işe bu teklifle girilmemeli.
      if (bid > job.baseRevenue) {
        // console.log(`W${this.id} J${job.id} için teklif (${bid.toFixed(0)}) geliri (${job.baseRevenue.toFixed(0)}) aşıyor. Atla.`);
        continue;
      }

      const distance = Utils.distance(this.x, this.y, job.x, job.y);
      const distanceCost = distance * CONFIG.COST_PER_DISTANCE_UNIT;
      const potentialNetProfit = bid - distanceCost; // Bu, teklif ve maliyete dayalı net kâr

      if (potentialNetProfit > highestPotentialNetProfitFromBid) {
        highestPotentialNetProfitFromBid = potentialNetProfit;
        bestJobForArm = job;
        actualBidForBestJob = bid;
      }
    }

    if (bestJobForArm && highestPotentialNetProfitFromBid >= 0) {
      // Sadece pozitif veya sıfır kârlı işlere teklif ver
      // console.log(
      //   `W${this.id} MAB: Kol ${chosenArmKey} -> J${
      //     bestJobForArm.id
      //   } için teklif: ${actualBidForBestJob.toFixed(
      //     0
      //   )} (Pot. Net Kâr: ${highestPotentialNetProfitFromBid.toFixed(2)})`
      // );
      return {
        job: bestJobForArm,
        bid: actualBidForBestJob,
        armKey: chosenArmKey,
      };
    } else {
      // console.log(
      //   `W${this.id} MAB: Kol ${chosenArmKey} için kârlı (>=0) iş bulunamadı. En yüksek potansiyel net kâr: ${highestPotentialNetProfitFromBid.toFixed(2)}`
      // );
      return null;
    }
  }

  /**
   * Bir MAB kolunun istatistiklerini (seçim sayısı ve ortalama ödül) günceller.
   * @param {string} armKey Güncellenecek kolun adı (örn: "near_high").
   * @param {number} reward Bu seçimden elde edilen ödül (net kâr).
   */
  updateMabArm(armKey, reward) {
    if (this.mabArms[armKey]) {
      const arm = this.mabArms[armKey];
      arm.count++;
      // Q-değeri güncelleme: Q_new = Q_old + (1/N) * (R - Q_old)
      arm.value = arm.value + (1 / arm.count) * (reward - arm.value);
      // console.log(
      //   `W${this.id} MAB Güncelleme: Kol=${armKey}, Sayac=${
      //     arm.count
      //   }, Yeni Q-Değeri=${arm.value.toFixed(2)}, Ödül=${reward.toFixed(2)}`
      // );
    } else {
      console.warn(
        `W${this.id}: Geçersiz MAB kolu güncellenmeye çalışıldı: ${armKey}`
      );
    }
  }

  /**
   * MAB kollarının mevcut durumunu (Q-değerleri ve seçim sayıları) döndürür.
   * Grafik çizimi için kullanılacak.
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
        // Eğer bu path'teki son noktaysa, path'i temizleyebilir veya
        // bir sonraki noktaya geçişi burada yönetebilirsiniz.
        // Mevcut mantıkta, path[0] her zaman güncel hedeftir.
        // İşe varıldığında path AuctionManager veya SimulationController'da temizlenir.
      } else {
        const angle = Math.atan2(deltaY, deltaX);
        this.x += Math.cos(angle) * travelDistanceInStep;
        this.y += Math.sin(angle) * travelDistanceInStep;
      }
    }
    // Canvas sınırları içinde kalmasını sağla
    this.x = Math.max(0, Math.min(this.canvasWidth, this.x));
    this.y = Math.max(0, Math.min(this.canvasHeight, this.y));
  }

  draw(ctx) {
    const workerRadius = 7;
    ctx.beginPath();
    ctx.arc(this.x, this.y, workerRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.available ? this.color : "rgba(220, 50, 50, 0.8)"; // Meşgulse farklı renk
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();

    // İşçi ID'sini yazdır
    ctx.fillStyle = "white";
    ctx.font = "bold 8px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`W${this.id}`, this.x, this.y);

    // Eğer işçi meşgulse ve bir hedefi varsa, hedefe doğru bir çizgi çiz
    if (
      !this.available &&
      this.path.length > 0 &&
      this.assigned_jobs.length > 0
    ) {
      const currentAssignment = this.assigned_jobs[0]; // İlk atanmış işe gider
      if (
        currentAssignment &&
        typeof currentAssignment.targetX !== "undefined" &&
        typeof currentAssignment.targetY !== "undefined"
      ) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(currentAssignment.targetX, currentAssignment.targetY);
        ctx.strokeStyle = "rgba(100, 100, 100, 0.4)"; // Soluk bir çizgi
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}
