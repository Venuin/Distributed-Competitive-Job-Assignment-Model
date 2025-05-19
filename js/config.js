// js/config.js
export const CONFIG = {
  NUM_WORKERS: 8,
  MAX_JOBS: 15,
  AUCTION_INTERVAL: 5.0,
  AREA_SIZE: 600, // Şu an kullanılmıyor.
  JOB_CREATION_PROBABILITY: 0.1, // Her saniye yeni iş oluşturma olasılığı
  TIME_STEP: 1 / 60, // Saniye cinsinden (60 FPS hedefi için)
  BASE_WORKER_SPEED: 50, // Birim / saniye
  // BASE_WORKER_COST: 50, // KALDIRILDI
  JOB_FIXED_DURATION: 5, // Her işin sabit tamamlanma süresi (saniye)
  COST_PER_DISTANCE_UNIT: 0.2, // Mesafe başına maliyet
  DEFAULT_TARGET_PROFIT_PERCENTAGE: 0.5, // Kalan değerden hedeflenen kâr yüzdesi (%50)
  MIN_POSSIBLE_BID: 1, // Minimum teklif değeri
  MIN_REVENUE_FOR_JOB_SPAWN: 80, // İşler için minimum temel gelir
  MAX_REVENUE_FOR_JOB_SPAWN: 250, // İşler için maksimum temel gelir
  JOB_SPAWN_RATE_MULTIPLIER: 10, // İş oluşturma sıklığı çarpanı
  JOB_TIMEOUT_DURATION: 60.0,

  // MAB için Eşik Değerler
  MAB_DISTANCE_THRESHOLDS: {
    // Mesafe kategorileri
    NEAR: 200, // 0 - 200 arası "near"
    MEDIUM: 450, // 201 - 450 arası "medium" sonrası "far"
  },
  MAB_REVENUE_THRESHOLDS: {
    // Gelir kategorileri
    LOW: 120, // 0 - 120 arası "low"
    MEDIUM: 190, // 121 - 190 arası "medium", sonrası "high"
  },
  MAB_EPSILON: 0.1, // Epsilon-Greedy için keşif oranı (%10 keşif, %90 sömürü)
  MAB_INITIAL_Q_VALUE: 0, // Kolların başlangıçtaki tahmini değeri (0 veya küçük pozitif bir değer)
};
