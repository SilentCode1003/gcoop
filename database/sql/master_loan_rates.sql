create table master_loan_rates(
mlr_id	INT AUTO_INCREMENT primary key,
mlr_name	VARCHAR(300) NOT NULL,
mlr_loan_rate	DECIMAL(4,2) NOT NULL,
mlr_create_at	DATETIME NOT NULL,
mlr_update_at	DATETIME
);