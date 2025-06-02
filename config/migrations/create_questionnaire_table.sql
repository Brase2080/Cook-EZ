CREATE TABLE IF NOT EXISTS user_questionnaire (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    cooking_level INT NOT NULL CHECK (cooking_level BETWEEN 1 AND 5),
    dietary_preferences JSON,
    allergies JSON,
    utensils JSON,
    why_join VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
); 