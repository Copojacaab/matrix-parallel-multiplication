-- crea db
CREATE DATABASE IF NOT EXISTS  matrixlab
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

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
    matrix_a MEDIUMTEXT NULL,
    matrix_b MEDIUMTEXT NULL,
    result_c MEDIUMTEXT NULL,
    INDEX idx_jobs_status_created_at (status, created_at) -- per indicizzazione veloce su status e created_at (filtraggio e sorting)
);
