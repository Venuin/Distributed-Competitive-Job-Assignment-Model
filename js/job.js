// js/job.js
export class Job {
  constructor(id, x, y, creationTime) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.creationTime = creationTime;
    this.duration = 0.0; // İşin tamamlanması için gereken süre (hareket süresi hariç)
    this.baseRevenue = 0; // İşin temel geliri/müşteri ödemesi
    this.assignedWorkerId = null;
    this.startTime = null; // İşçinin işe başladığı zaman (hedefe ulaştıktan sonra)
    this.completed = false;
    this.progress = 0.0; // 0.0 ile 1.0 arası
    this.winningBid = null;
    this.estimatedTravelTime = 0.0; // İşçinin işe ulaşma süresi
    this.timedOut = false;
  }

  draw(ctx) {
    if (this.completed || this.timedOut) {
      return;
    }
    ctx.beginPath();
    const size = 12;
    ctx.rect(this.x - size / 2, this.y - size / 2, size, size);
    if (this.assignedWorkerId !== null) {
      ctx.fillStyle = "orange";
    } else {
      ctx.fillStyle = "blue";
    }
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.stroke();
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    // İş ID'si ve Temel Gelirini göster
    ctx.fillText(
      `J${this.id} (R:${this.baseRevenue.toFixed(0)})`,
      this.x,
      this.y + size + 3
    );

    // İlerleme çubuğu
    if (this.assignedWorkerId !== null) {
      const barWidth = 30;
      const barHeight = 5;
      const barX = this.x - barWidth / 2;
      const barY = this.y - size / 2 - barHeight - 2;
      ctx.fillStyle = "#ccc";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = "purple";
      ctx.fillRect(barX, barY, barWidth * this.progress, barHeight);
    }
  }
}
