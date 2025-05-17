// js/config.js
export const CONFIG = {
  NUM_WORKERS: 8,
  MAX_JOBS: 15,
  AUCTION_INTERVAL: 5.0,
  AREA_SIZE: 600, // Şu an kullanılmıyor.
  JOB_CREATION_PROBABILITY: 0.1, // Her saniye yeni iş oluşturma olasılığı
  TIME_STEP: 1 / 60, // Saniye cinsinden (60 FPS hedefi için)
  BASE_WORKER_SPEED: 50, // Birim / saniye
  BASE_WORKER_COST: 50,
  JOB_FIXED_DURATION: 5, // Her işin sabit tamamlanma süresi (saniye)
};
