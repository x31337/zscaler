CREATE DATABASE IF NOT EXISTS zscaler_settings;
USE zscaler_settings;

CREATE TABLE IF NOT EXISTS portal_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    portal_type ENUM('company', 'partner') NOT NULL,
    email VARCHAR(255) NOT NULL,
    url VARCHAR(255) NOT NULL,
    settings JSON,
    auto_detected BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_portal (portal_type)
);

-- Create user and grant permissions
CREATE USER IF NOT EXISTS 'zscaler'@'localhost' IDENTIFIED BY 'zscaler123';
GRANT ALL PRIVILEGES ON zscaler_settings.* TO 'zscaler'@'localhost';
FLUSH PRIVILEGES;

