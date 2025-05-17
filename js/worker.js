// js/worker.js
import { Utils } from "./utils.js";
import { CONFIG } from "./config.js";

export class Worker {
  constructor(id, x, y, speed, canvasWidth, canvasHeight) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.speed = speed; // Birim / saniye
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.targetProfitPercentageFromRemaining =
      CONFIG.DEFAULT_TARGET_PROFIT_PERCENTAGE;

    this.assigned_jobs = []; // Atanmış işlerin listesi { jobId, startTime, duration, winningBid, targetX, targetY }
    this.earnings = 0.0;
    this.available = true;
    this.path = []; // Hedefe giden yol [{x: job.x, y: job.y}]

    this.color = `hsl(${Math.random() * 360}, 70%, 60%)`; // İşçi için rastgele bir renk
  }

  /**
   * @param {Job} job Teklif hesaplanacak iş nesnesi.
   * @returns {number} Hesaplanan teklif miktarı veya teklif verilemiyorsa Infinity.
   */

  _calculateBidForJob(job) {
    if (!job || typeof job.baseRevenue === "undefined") {
      console.error(
        `W${this.id}: J${
          job ? job.id : "unknown"
        } için baseRevenue tanımsız, teklif hesaplanamıyor.`
      );
      return Infinity;
    }

    /*console.log(
      `W${this.id}, J${
        job.id
      } için teklif hesaplıyor. İş konumu: (${job.x.toFixed(
        0
      )}, ${job.y.toFixed(0)}). İşçi konumu: (${this.x.toFixed(
        0
      )}, ${this.y.toFixed(0)}).`
    );*/

    const distance = Utils.distance(this.x, this.y, job.x, job.y);
    const distanceCost = distance * CONFIG.COST_PER_DISTANCE_UNIT;

    // 1. Kural: Eğer işin temel geliri, sadece mesafe maliyetini bile karşılamıyorsa, bu işe girme.
    if (job.baseRevenue <= distanceCost) {
      console.log(
        `W${this.id}: J${job.id} (R:${job.baseRevenue.toFixed(
          0
        )}) için mesafe maliyeti (${distanceCost.toFixed(
          0
        )}) gelirden yüksek. Teklif verilmiyor. Mesafe = ${distance.toFixed(0)}`
      );
      return Infinity;
    }

    // 2. Kural: Teklif, işin temel gelirini aşamaz.
    if (
      this.targetProfitPercentageFromRemaining < 0 ||
      this.targetProfitPercentageFromRemaining > 1
    ) {
      console.warn(
        `W${this.id}: targetProfitPercentageFromRemaining (${this.targetProfitPercentageFromRemaining}) 0-1 aralığında olmalı.`
      );
      this.targetProfitPercentageFromRemaining = Math.max(
        0,
        Math.min(
          1,
          this.targetProfitPercentageFromRemaining ||
            CONFIG.DEFAULT_TARGET_PROFIT_PERCENTAGE
        )
      );
    }

    const remainingValueAfterDistanceCost = job.baseRevenue - distanceCost;

    // 3. Kural: Kalan değer üzerinden hedeflenen kârı hesapla.
    const desiredProfitFromRemaining =
      remainingValueAfterDistanceCost *
      this.targetProfitPercentageFromRemaining;

    // Teklif = Mesafe Maliyeti + Kalan Değerden İstenen Kâr
    let workerBid = distanceCost + desiredProfitFromRemaining;

    // 4. Kural: Teklif, tanımlanmış minimum bir değerden düşük olamaz.
    workerBid = Math.max(CONFIG.MIN_POSSIBLE_BID, workerBid);

    // 5. Kural: Eğer hesaplanan teklif, sadece mesafe maliyetinden bile düşükse, o zaman teklifi en azından mesafe maliyetine çek.
    if (workerBid < distanceCost) {
      workerBid = distanceCost; // En azından maliyeti kurtar (0 kâr)
    }

    return parseFloat(workerBid.toFixed(2));
  }

  /**
   * @param {Array<Job>} availableJobs Teklif verilebilecek işlerin listesi.
   * @returns {{job: Job, bid: number} | null} Seçilen iş ve teklif miktarı, veya null.
   */
  selectJobAndCalculateBid(availableJobs) {
    if (!this.available || !availableJobs || availableJobs.length === 0) {
      return null;
    }

    // Sadece atanmamış ve tamamlanmamış işleri filtrele
    const eligibleJobs = availableJobs.filter(
      (job) => job.assignedWorkerId === null && !job.completed
    );

    if (eligibleJobs.length === 0) {
      return null;
    }

    // Rastgele bir uygun iş seç
    const randomIndex = Math.floor(Math.random() * eligibleJobs.length);
    const chosenJob = eligibleJobs[randomIndex];

    // Seçilen iş için teklifi hesapla
    const bidAmount = this._calculateBidForJob(chosenJob);

    // Eğer teklif geçersizse (örn: Infinity), bu işe teklif verme
    if (!isFinite(bidAmount) || bidAmount <= 0) {
      console.log(
        `W${this.id}: J${chosenJob.id} için geçerli teklif hesaplanamadı (${bidAmount}).`
      );
      return null;
    }

    // console.log(`W${this.id}: J${chosenJob.id} (R:${chosenJob.baseRevenue.toFixed(0)}) için rastgele seçildi, Teklif: ${bidAmount.toFixed(0)}`);
    return { job: chosenJob, bid: bidAmount };
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

    // Sınır Kontrolü
    this.x = Math.max(0, Math.min(this.canvasWidth, this.x));
    this.y = Math.max(0, Math.min(this.canvasHeight, this.y));
  }

  draw(ctx) {
    const workerRadius = 7;
    ctx.beginPath();
    ctx.arc(this.x, this.y, workerRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.available ? this.color : "rgba(220, 50, 50, 0.8)"; // Uygunsa kendi rengi, değilse kırmızımsı
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();

    // İşçi ID'sini yazdır
    ctx.fillStyle = "white"; // Metin rengi
    ctx.font = "bold 8px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`W${this.id}`, this.x, this.y);

    // Eğer bir hedefe gidiyorsa yolu çiz
    if (
      !this.available &&
      this.path.length > 0 &&
      this.assigned_jobs.length > 0
    ) {
      const currentAssignment = this.assigned_jobs[0];
      if (currentAssignment) {
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
