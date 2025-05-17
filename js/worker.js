export class Worker {
  constructor(id, x, y, speed, base_cost, canvasWidth, canvasHeight) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.speed = speed; // Birim / saniye
    this.base_cost = base_cost;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    this.assigned_jobs = []; // Atanmış işlerin listesi { jobId, startTime, duration, winningBid, targetX, targetY }
    this.earnings = 0.0;
    this.available = true;
    this.path = []; // Hedefe giden yol [{x: job.x, y: job.y}])

    this.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
  }

  calculateBid(job) {
    const distance = Math.sqrt((this.x - job.x) ** 2 + (this.y - job.y) ** 2);
    return this.base_cost + distance;
  }

  selectJobAndCalculateBid(availableJobs) {
    if (!this.available || !availableJobs || availableJobs.length === 0) {
      return null;
    }

    const eligibleJobs = availableJobs.filter(
      (job) => job.assignedWorkerId === null && !job.completed
    );

    if (eligibleJobs.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * eligibleJobs.length);
    const chosenJobForBid = eligibleJobs[randomIndex];

    const bidForChosenJob = this.calculateBid(chosenJobForBid);

    return { job: chosenJobForBid, bid: bidForChosenJob };
  }

  moveToTarget(timeStep) {
    if (this.path.length > 0) {
      const targetPos = this.path[0]; // path[0] işin kendi konumu
      const deltaX = targetPos.x - this.x;
      const deltaY = targetPos.y - this.y;
      const distanceToTargetPoint = Math.sqrt(
        deltaX * deltaX + deltaY * deltaY
      );

      const travelDistanceInStep = this.speed * timeStep; // Bu adımda kat edilecek mesafe

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
    const workerRadius = 7; // İşçi yarıçapı
    ctx.beginPath();
    ctx.arc(this.x, this.y, workerRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.available ? this.color : "rgba(220, 50, 50, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "white"; // Metin rengi
    ctx.font = "8px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`W${this.id}`, this.x, this.y);

    if (
      !this.available &&
      this.path.length > 0 &&
      this.assigned_jobs.length > 0
    ) {
      const target = this.assigned_jobs[0];
      if (target) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(target.targetX, target.targetY);
        ctx.strokeStyle = "rgba(100, 100, 100, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}
