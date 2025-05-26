-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS zscaler_extension;
USE zscaler_extension;

-- Enable UTF-8 encoding
ALTER DATABASE zscaler_extension CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Portal Settings Table
CREATE TABLE IF NOT EXISTS portal_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    url VARCHAR(512),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type_active (type, active),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Protection Status Table
CREATE TABLE IF NOT EXISTS protection_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enabled BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'checking',
    last_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    public_ip VARCHAR(45),
    private_ip VARCHAR(45),
    docker_ip VARCHAR(45),
    non_private_ip VARCHAR(45),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_last_check (last_check),
    INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Network Status History Table
CREATE TABLE IF NOT EXISTS network_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    status VARCHAR(50) NOT NULL,
    public_ip VARCHAR(45),
    private_ip VARCHAR(45),
    docker_ip VARCHAR(45),
    non_private_ip VARCHAR(45),
    check_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT,
    INDEX idx_check_timestamp (check_timestamp),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(100) NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
