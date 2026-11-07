create table member_savings(
ms_id int(16) primary key NOT NULL,
ms_member_id INT NOT NULL,
ms_current_balance DECIMAL(15,2) NOT NULL,
ms_update_at DATETIME
);