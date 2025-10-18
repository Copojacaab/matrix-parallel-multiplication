-- metadati generali del batch
CREATE TABLE IF NOT EXISTS benchmark_batches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL,
    seed BIGINT NOT NULL,
    repeats INT NOT NULL,
    sizes_expr VARCHAR(255) NOT NULL,
    procs_expr VARCHAR(255) NOT NULL,
    sizes_json JSON NOT NULL,
    procs_json JSON NOT NULL,
    oversubscribe TINYINT(1) DEFAULT 0,
    hw_profile JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- benchmark sieriali: una riga per ogni dupla (batch_id, n)
CREATE TABLE IF NOT EXISTS benchmark_serial (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL,
    n INT NOT NULL,
    Ts_ms DOUBLE NOT NULL,
    times_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY u_batch_n (batch_id, n),
    FOREIGN KEY (batch_id) REFERENCES benchmark_batches(batch_id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- benchmark parello, unariga per ogni (batch_id, n, p)
CREATE TABLE IF NOT EXISTS benchmark_mpi (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL,
    n INT NOT NULL,
    p INT NOT NULL,
    Tp_ms DOUBLE NOT NULL,
    speedup DOUBLE NULL,
    efficiency DOUBLE NULL,
    times_json JSON NOT NULL,
    status ENUM('running', 'completed', 'failed') DEFAULT 'running',
    error_msg TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY u_batch_n_p (batch_id, n, p),
    FOREIGN KEY (batch_id) REFERENCES benchmark_batches(batch_id) ON DELETE CASCADE
) ENGINE=InnoDB;
