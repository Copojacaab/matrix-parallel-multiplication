-- crea db
CREATE DATABASE IF NOT EXISTS  matrixlab
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- utente con permessi minimi
CREATE USER IF NOT EXISTS 'matrixlab_user'@'%'
    IDENTIFIED BY 'stocazzo';
-- permessi minimi crud
GRANT SELECT, INSERT, UPDATE, DELETE
ON matrixlab.* TO 'matrixlab_user'@'%';
FLUSH PRIVILEGES;

-- uso il db
USE matrixlab;

-- creo tabella jobs
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(32) PRIMARY KEY, 
    status ENUM('queued', 'running', 'completed', 'failed') NOT NULL,
    nra INT NOT NULL,
    nca INT NOT NULL, 
    ncb INT NOT NULL, 
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    execution_time_ms INT NULL,
    compute_time_ms INT NULL,
    exec_total_ms INT NULL,
    matrix_a MEDIUMTEXT NULL,
    matrix_b MEDIUMTEXT NULL,
    result_c MEDIUMTEXT NULL,
    error_msg TEXT NULL,
    INDEX idx_jobs_status_created_at (status, created_at) -- per indicizzazione veloce su status e created_at (filtraggio e sorting)
);

-- creo tabella benchmarks per metadati
CREATE TABLE IF NOT EXISTS benchmark_batches (
  batch_id       VARCHAR(64) PRIMARY KEY,
  seed           BIGINT NOT NULL,
  repeats        INT NOT NULL,
  sizes_expr     VARCHAR(255) NOT NULL,
  procs_expr     VARCHAR(255) NOT NULL,
  sizes_json     JSON NOT NULL,
  procs_json     JSON NOT NULL,
  oversubscribe  TINYINT(1) DEFAULT 0,
  hw_profile     JSON NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Risultati unificati (seriale e MPI)
CREATE TABLE IF NOT EXISTS benchmark_results (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id      VARCHAR(64) NOT NULL,
  n             INT NOT NULL,
  p             INT NOT NULL,                          -- 1 per seriale
  mode          ENUM('serial','mpi') NOT NULL,
  time_ms       DOUBLE NULL,                           -- mediana (post-warmup)
  samples_json  JSON NULL,                             -- campioni usati per la mediana
  status        ENUM('pending','ok','failed') DEFAULT 'pending',
  error_msg     TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_bench_batch
    FOREIGN KEY (batch_id) REFERENCES benchmark_batches(batch_id)
    ON DELETE CASCADE,

  UNIQUE KEY u_batch_n_mode_p (batch_id, n, mode, p),
  KEY idx_bench_results_batch_created (batch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;