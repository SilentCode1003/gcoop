create table savings_ledger(
sl_id int(16) NOT NULL,
sl_savings_id	INT NOT NULL,
sl_transaction_type	ENUM('DEPOSIT', 'WITHDRAWAL','INTEREST_PAYOUT','PENALTY','ADJUSTMENT','TRANSFER'),
sl_amount	DECIMAL(15,2) NOT NULL,
sl_balance_after	DECIMAL(15,2) NOT NULL,
sl_reference_no	VARCHAR(50) UNIQUE NOT NULL,
sl_description	TEXT,
sl_create_by	INT NOT NULL,
sl_create_date	DATETIME,
foreign key (sl_create_by) references master_users(mu_id)
);